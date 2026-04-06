from __future__ import annotations

import json
from itertools import product
from datetime import datetime

import joblib
import numpy as np
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.model_selection import GroupKFold, train_test_split
from sklearn.preprocessing import StandardScaler

from src.learning.emg_trainer import (
    DISPLAY_LABELS,
    LABELS_MAP,
    _artifact_path_for_ui,
    _build_result_payload,
    _candidate_prefix,
    _extract_session_names,
    _hyperparameters_for_response,
    _load_table,
    _normalize_label,
    _prepare_dataframe,
    _read_metadata,
    _resolve_split_configuration,
    delete_model as _delete_model,
    evaluate_saved_model as _evaluate_saved_model,
    generate_model_id,
    get_group_column,
    get_model_paths,
    get_rejected_model_paths,
    list_saved_models as _list_saved_models,
    load_model as _load_model,
    _resolution_count,
    _candidate_values,
)

EEG_LDA_FEATURES = [
    "score_1", "score_2", "score_3", "score_4", "score_5", "score_6",
    "max_score", "second_max_score", "score_ratio", "score_mean", "score_std",
    "peak_freq",
]


def _parse_solver_options(raw_solver):
    value = str(raw_solver or "svd").strip().lower()
    allowed = {"svd", "lsqr", "eigen"}
    options = [item.strip() for item in value.split(",") if item.strip()]
    parsed = [item for item in options if item in allowed]
    return parsed or ["svd"]


def _parse_shrinkage_options(raw_shrinkage, solver: str):
    if solver == "svd":
        return [None]

    value = str(raw_shrinkage or "auto").strip().lower()
    options = [item.strip() for item in value.split(",") if item.strip()]
    parsed = []
    for item in options:
        if item == "auto":
            parsed.append("auto")
        elif item == "none":
            parsed.append(None)
        else:
            try:
                numeric = float(item)
                if 0.0 <= numeric <= 1.0:
                    parsed.append(numeric)
            except Exception:
                continue
    return parsed or ["auto"]


def _shrinkage_for_metadata(shrinkage):
    return "none" if shrinkage is None else shrinkage


def _eeg_frequency_labels(df):
    labels = []
    if "target_frequency" in df.columns:
        frequency_column = df["target_frequency"].fillna(0.0).astype(float)
        for label in LABELS_MAP["EEG"]:
            if label == 0:
                labels.append("Rest")
                continue
            label_rows = df[df["label"].astype(int) == int(label)]
            if not label_rows.empty:
                positive_freqs = label_rows["target_frequency"].fillna(0.0).astype(float)
                positive_freqs = positive_freqs[positive_freqs > 0]
                if not positive_freqs.empty:
                    mode_series = positive_freqs.round(2).mode()
                    if not mode_series.empty:
                        labels.append(f"{mode_series.iloc[0]:.2f}Hz")
                        continue
            labels.append(DISPLAY_LABELS["EEG"].get(label, str(label)))
        return labels

    return [DISPLAY_LABELS["EEG"].get(label, str(label)) for label in LABELS_MAP["EEG"]]


def _lda_feature_importances(model):
    coefficients = getattr(model, "coef_", None)
    if coefficients is None:
        return {}
    weights = np.mean(np.abs(coefficients), axis=0)
    total = float(np.sum(weights))
    if total > 1e-12:
        weights = weights / total
    return {
        feature: float(weights[idx])
        for idx, feature in enumerate(EEG_LDA_FEATURES[: len(weights)])
    }


def _build_visualization(model, x_scaled, y):
    visualization = {"component_count": 0, "class_centroids": [], "class_signatures": []}
    try:
        projection = model.transform(x_scaled)
        if projection.ndim == 1:
            projection = projection.reshape(-1, 1)
        visualization["component_count"] = int(projection.shape[1])
        y_values = np.asarray(y, dtype=int)
        for label in sorted(np.unique(y_values)):
            mask = y_values == label
            subset = projection[mask]
            visualization["class_centroids"].append({
                "label": _scalar_label(label),
                "name": _format_eeg_label(label),
                "count": int(subset.shape[0]),
                "ld1": float(np.mean(subset[:, 0])) if subset.shape[1] > 0 else 0.0,
                "ld2": float(np.mean(subset[:, 1])) if subset.shape[1] > 1 else 0.0,
            })
    except Exception:
        pass

    coefficients = getattr(model, "coef_", None)
    classes = getattr(model, "classes_", [])
    if coefficients is not None and len(classes):
        for index, class_id in enumerate(classes):
            row = np.abs(coefficients[index])
            top_indices = np.argsort(row)[::-1][:4]
            max_value = float(np.max(row[top_indices])) if len(top_indices) else 0.0
            visualization["class_signatures"].append({
                "label": int(class_id),
                "name": DISPLAY_LABELS["EEG"].get(int(class_id), str(class_id)),
                "signature": [
                    {
                        "feature": EEG_LDA_FEATURES[idx],
                        "weight": float(coefficients[index][idx]),
                        "relative": float(abs(coefficients[index][idx]) / max_value) if max_value > 1e-12 else 0.0,
                    }
                    for idx in top_indices
                ],
            })
    return visualization


def _lda_candidate_grid(params: dict):
    resolution = _resolution_count(params)
    tol_values = _candidate_values(
        params.get("tol_min", params.get("tol", 1e-4)),
        params.get("tol_max", params.get("tol", 1e-4)),
        resolution,
        "float",
    )
    candidates = []
    solver_options = _parse_solver_options(params.get("solver", "svd"))
    for solver in solver_options:
        for shrinkage in _parse_shrinkage_options(params.get("shrinkage", "auto"), solver):
            for tol in product(tol_values):
                candidates.append({
                    "solver": solver,
                    "shrinkage": shrinkage,
                    "tol": float(tol[0]),
                    "search_resolution": resolution,
                })
    return candidates


def train_eeg_lda_model(table_name="eeg_windows", train_split=0.7, val_split=0.15, test_split=0.15, n_folds=2, model_name=None, solver="eigen", shrinkage="auto", tol=1e-4, progress_callback=None, **search_params):
    df = _prepare_dataframe('EEG', table_name)
    if df.empty:
        return {"error": "Database is empty."}

    feature_cols = list(EEG_LDA_FEATURES)
    for column in feature_cols:
        if column not in df.columns:
            df[column] = 0.0
    if df["label"].nunique() < 2:
        return {"error": "Need at least 2 classes."}

    split_cfg = _resolve_split_configuration(train_split, val_split, test_split, n_folds)
    resolved_split = split_cfg["resolved"]
    group_col = get_group_column('EEG')
    groups = df[group_col].astype(str)
    unique_groups = groups.unique()
    if len(unique_groups) < 3:
        indices = np.arange(len(df))
        train_idx, test_idx = train_test_split(indices, test_size=resolved_split["test_ratio"], random_state=42, stratify=df["label"])
        train_df = df.iloc[train_idx].copy()
        test_df = df.iloc[test_idx].copy()
    else:
        train_groups, test_groups = train_test_split(unique_groups, test_size=resolved_split["test_ratio"], random_state=42)
        train_df = df[groups.isin(train_groups)].copy()
        test_df = df[groups.isin(test_groups)].copy()

    train_groups = train_df[group_col].astype(str)
    if len(train_groups.unique()) >= resolved_split["k_folds"]:
        folds = list(GroupKFold(n_splits=resolved_split["k_folds"]).split(train_df, train_df["label"], train_groups))
    else:
        row_indices = np.arange(len(train_df))
        train_idx, val_idx = train_test_split(row_indices, test_size=1 / resolved_split["k_folds"], random_state=42)
        folds = [(train_idx, val_idx)]

    candidates = _lda_candidate_grid({
        "solver": solver,
        "shrinkage": shrinkage,
        "tol": tol,
        **search_params,
    })
    history = []
    best = None
    total_folds = max(1, len(folds))
    total_candidates = max(1, len(candidates))
    total_runs = max(1, total_candidates * total_folds)
    completed_runs = 0
    if progress_callback:
        progress_callback({
            "status": "running",
            "progress": 0.0,
            "candidate_index": 0,
            "total_candidates": total_candidates,
            "fold_index": 0,
            "total_folds": total_folds,
            "history": [],
        })
    for candidate_index, candidate_params in enumerate(candidates):
        hyperparameters = _hyperparameters_for_response("EEG", {
            **candidate_params,
            "shrinkage": _shrinkage_for_metadata(candidate_params.get("shrinkage")),
        }, resolved_split)
        for fold_number, (train_idx, val_idx) in enumerate(folds, start=1):
            fold_train = train_df.iloc[train_idx].copy()
            fold_val = train_df.iloc[val_idx].copy()
            scaler = StandardScaler()
            x_train = scaler.fit_transform(fold_train[feature_cols].fillna(0.0))
            x_val = scaler.transform(fold_val[feature_cols].fillna(0.0))
            y_train = fold_train["label"].astype(int)
            y_val = fold_val["label"].astype(int)

            model = LinearDiscriminantAnalysis(
                solver=candidate_params["solver"],
                shrinkage=candidate_params["shrinkage"] if candidate_params["solver"] in {"lsqr", "eigen"} else None,
                tol=float(candidate_params.get("tol", 1e-4)),
            )
            model.fit(x_train, y_train)
            train_accuracy = float(accuracy_score(y_train, model.predict(x_train)))
            validation_accuracy = float(accuracy_score(y_val, model.predict(x_val)))

            fold_id = generate_model_id(candidate_index, fold_number)
            rejected_paths = get_rejected_model_paths("EEG", fold_id)
            joblib.dump(model, rejected_paths["model"])
            joblib.dump(scaler, rejected_paths["scaler"])
            history_item = {
                "id": fold_id,
                "model_id": fold_id,
                "candidate_index": candidate_index,
                "candidate_idx": candidate_index,
                "fold_index": fold_number,
                "fold_idx": fold_number,
                "train_accuracy": train_accuracy,
                "validation_accuracy": validation_accuracy,
                "accuracy": validation_accuracy,
                "n_train_samples": int(len(fold_train)),
                "n_validation_samples": int(len(fold_val)),
                "hyperparameters": hyperparameters["selected_hyperparameters"],
                "artifact_path": _artifact_path_for_ui(rejected_paths["model"]),
                "created_at": datetime.now().isoformat(),
            }
            rejected_paths["meta"].write_text(json.dumps(history_item, indent=2), encoding="utf-8")
            history.append(history_item)
            completed_runs += 1
            if progress_callback:
                progress_callback({
                    "status": "running",
                    "progress": min(0.95, completed_runs / total_runs),
                    "candidate_index": candidate_index,
                    "total_candidates": total_candidates,
                    "fold_index": fold_number,
                    "total_folds": total_folds,
                    "history": list(history),
                    "latest_history_item": history_item,
                })
            if best is None or validation_accuracy > best["validation_accuracy"]:
                best = {
                    "model": model,
                    "scaler": scaler,
                    "train_accuracy": train_accuracy,
                    "validation_accuracy": validation_accuracy,
                    "history_item": history_item,
                    "hyperparameters": hyperparameters,
                }

    final_name = model_name or generate_model_id(0, 0)
    final_paths = get_model_paths("EEG", final_name)
    joblib.dump(best["model"], final_paths["model"])
    joblib.dump(best["scaler"], final_paths["scaler"])

    x_test = best["scaler"].transform(test_df[feature_cols].fillna(0.0))
    y_test = test_df["label"].astype(int)
    y_pred = best["model"].predict(x_test)
    test_accuracy = float(accuracy_score(y_test, y_pred))
    confusion = confusion_matrix(y_test, y_pred, labels=LABELS_MAP["EEG"]).tolist()
    visualization = _build_visualization(best["model"], x_test, y_test)
    feature_importances = _lda_feature_importances(best["model"])

    session_names = _extract_session_names(df, table_name)
    metadata = {
        "sensor": "EEG",
        "model_name": final_name,
        "model_id": final_name,
        "best_fold_id": best["history_item"]["model_id"],
        "candidate_index": best["history_item"]["candidate_index"],
        "fold_index": best["history_item"]["fold_index"],
        "classifier": "LDA",
        "session_name": session_names[0] if session_names else table_name,
        "session_names": session_names,
        "n_samples": int(len(df)),
        "train_accuracy": best["train_accuracy"],
        "validation_accuracy": best["validation_accuracy"],
        "test_accuracy": test_accuracy,
        "accuracy": test_accuracy,
        "mean_accuracy": float(np.mean([item["validation_accuracy"] for item in history])) if history else best["validation_accuracy"],
        "fold_std": float(np.std([item["validation_accuracy"] for item in history])) if history else 0.0,
        "fold_min": float(min(item["validation_accuracy"] for item in history)) if history else best["validation_accuracy"],
        "split_summary": {
            "total_samples": int(len(df)),
            "train_samples": int(history[0]["n_train_samples"]) if history else 0,
            "val_samples": int(history[0]["n_validation_samples"]) if history else 0,
            "test_samples": int(len(test_df)),
        },
        "train_ratio": resolved_split["train_ratio"],
        "val_ratio": resolved_split["val_ratio"],
        "test_ratio": resolved_split["test_ratio"],
        "k_folds": resolved_split["k_folds"],
        "resolved_split": resolved_split,
        "training_history": history,
        "hyperparameters": best["hyperparameters"],
        "group_counts": train_df.groupby(group_col)["label"].count().to_dict(),
        "confusion_matrix": confusion,
        "labels": _eeg_frequency_labels(df),
        "feature_importances": feature_importances,
        "feature_order": feature_cols,
        "visualization": visualization,
        "artifact_path": _artifact_path_for_ui(final_paths["model"]),
        "created_at": datetime.now().isoformat(),
        "table_name": table_name,
    }
    final_paths["meta"].write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    _load_model("EEG", final_name)
    if progress_callback:
        progress_callback({
            "status": "finalizing",
            "progress": 0.98,
            "candidate_index": best["history_item"]["candidate_index"],
            "total_candidates": total_candidates,
            "fold_index": best["history_item"]["fold_index"],
            "total_folds": total_folds,
            "history": list(history),
            "latest_history_item": best["history_item"],
            "result": _build_result_payload("EEG", final_name, metadata),
        })
    return _build_result_payload("EEG", final_name, metadata)


def evaluate_eeg_lda_model(table_name="eeg_windows", model_name=None):
    return _evaluate_saved_model(sensor='EEG', table_name=table_name, model_name=model_name)


def list_saved_models():
    return _list_saved_models('EEG')


def delete_model(model_name):
    return _delete_model('EEG', model_name)


def load_model(model_name):
    return _load_model('EEG', model_name)
