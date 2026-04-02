from __future__ import annotations

import json
import time
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.preprocessing import StandardScaler

from src.learning.data_splitter import build_train_val_test_split, iter_cv_folds, load_sensor_dataset, split_summary
from src.learning.emg_trainer import DISPLAY_LABELS, LABELS_MAP, get_model_paths, _candidate_values, create_training_run_dir, save_candidate_snapshot
from src.utils.config import config_manager


EEG_LDA_FEATURES = [
    "score_1", "score_2", "score_3", "score_4", "score_5", "score_6",
    "max_score", "second_max_score", "score_ratio", "score_mean", "score_std", "peak_freq",
]


def _scalar_label(value):
    if isinstance(value, (np.floating, float)):
        return float(value)
    if isinstance(value, (np.integer, int)):
        return int(value)
    return value


def _format_eeg_label(value) -> str:
    scalar = _scalar_label(value)
    try:
        numeric = float(scalar)
    except (TypeError, ValueError):
        return str(scalar)
    if abs(numeric) <= 1e-12:
        return "Rest"
    if float(numeric).is_integer():
        return f"{int(numeric)}Hz"
    return f"{numeric:.2f}".rstrip("0").rstrip(".") + "Hz"


def _resolve_model_feature_order(model=None, scaler=None):
    expected = getattr(scaler, "n_features_in_", None)
    if expected is None and model is not None:
        expected = getattr(model, "n_features_in_", None)
    if not expected:
        expected = len(EEG_LDA_FEATURES)
    return EEG_LDA_FEATURES[: int(expected)]


def _normalize_feature_importances(model, feature_order):
    coefficients = getattr(model, "coef_", None)
    if coefficients is None:
        return {}, {}
    coeffs = pd.DataFrame(coefficients, columns=feature_order)
    raw_importances = coeffs.abs().mean(axis=0)
    total = float(raw_importances.sum())
    if total <= 1e-12:
        normalized = {feature: 0.0 for feature in feature_order}
    else:
        normalized = (raw_importances / total).to_dict()
    return normalized, raw_importances.to_dict()


def _build_lda_visualization(model, X_scaled, y, feature_order):
    visualization = {"component_count": 0, "class_centroids": [], "class_signatures": []}
    try:
        projections = np.asarray(model.transform(X_scaled))
        if projections.ndim == 1:
            projections = projections.reshape(-1, 1)
        visualization["component_count"] = int(projections.shape[1])
        series_y = pd.Series(y)
        for label in sorted(series_y.unique().tolist()):
            mask = series_y.to_numpy() == label
            if not np.any(mask):
                continue
            subset = projections[mask]
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
        coeffs = pd.DataFrame(coefficients, columns=feature_order)
        for index, class_id in enumerate(classes):
            if index >= len(coeffs):
                continue
            row = coeffs.iloc[index]
            top_features = row.abs().sort_values(ascending=False).head(4)
            max_abs = float(top_features.max()) if len(top_features) else 0.0
            signature = []
            for feature_name, feature_value in top_features.items():
                normalized = (abs(float(feature_value)) / max_abs) if max_abs > 1e-12 else 0.0
                signature.append({
                    "feature": feature_name,
                    "weight": float(feature_value),
                    "relative": float(normalized),
                })
            visualization["class_signatures"].append({
                "label": _scalar_label(class_id),
                "name": _format_eeg_label(class_id),
                "signature": signature,
            })
    return visualization


def _fit_lda(train_df, solver, shrinkage, tol=0.0001, label_col="target_frequency"):
    scaler = StandardScaler()
    X = train_df[EEG_LDA_FEATURES].fillna(0.0)
    y = train_df[label_col]
    X_scaled = scaler.fit_transform(X)
    solver = str(solver or "eigen").lower()
    if solver not in {"svd", "lsqr", "eigen"}:
        solver = "eigen"
    shrinkage_value = None
    if solver in {"lsqr", "eigen"}:
        if shrinkage in (None, "", "none", "None"):
            shrinkage_value = None
        elif shrinkage == "auto":
            shrinkage_value = "auto"
        else:
            try:
                shrinkage_value = float(shrinkage)
            except Exception:
                shrinkage_value = "auto"
    model = LinearDiscriminantAnalysis(
        solver=solver,
        shrinkage=shrinkage_value if solver in {"lsqr", "eigen"} else None,
        tol=float(tol),
    )
    model.fit(X_scaled, y)
    return model, scaler, solver, shrinkage_value, float(tol)


def _score(model, scaler, df, feature_order, label_col, class_labels):
    X = df[feature_order].fillna(0.0)
    y = df[label_col]
    X_scaled = scaler.transform(X)
    y_pred = model.predict(X_scaled)
    return {
        "accuracy": float(accuracy_score(y, y_pred)),
        "confusion_matrix": confusion_matrix(y, y_pred, labels=class_labels).tolist(),
        "n_samples": int(len(df)),
        "visualization": _build_lda_visualization(model, X_scaled, y, feature_order),
    }


def _compute_bias_variance(train_accuracy, validation_accuracy, fold_accuracies):
    fold_accuracies = [float(score) for score in fold_accuracies]
    fold_std = float(np.std(fold_accuracies)) if fold_accuracies else 0.0
    gap = float(train_accuracy - validation_accuracy)
    bias = "balanced"
    variance = "balanced"
    if train_accuracy < 0.75 and validation_accuracy < 0.75:
        bias = "high"
    elif train_accuracy < 0.85 and validation_accuracy < 0.85:
        bias = "moderate"
    if gap > 0.1 or fold_std > 0.08:
        variance = "high"
    elif gap > 0.05 or fold_std > 0.04:
        variance = "moderate"
    return {
        "average_accuracy": float(np.mean(fold_accuracies)) if fold_accuracies else float(validation_accuracy),
        "mean_accuracy": float(np.mean(fold_accuracies)) if fold_accuracies else float(validation_accuracy),
        "fold_std": fold_std,
        "fold_min": float(np.min(fold_accuracies)) if fold_accuracies else float(validation_accuracy),
        "fold_max": float(np.max(fold_accuracies)) if fold_accuracies else float(validation_accuracy),
        "train_val_gap": gap,
        "bias_indicator": bias,
        "variance_indicator": variance,
    }


def _emit_progress(progress_callback, **payload):
    if progress_callback:
        progress_callback(payload)


def train_eeg_lda_model(
    table_name="eeg_windows",
    model_name="eeg_lda",
    solver="eigen",
    shrinkage="auto",
    tol=0.0001,
    train_ratio=0.7,
    val_ratio=0.15,
    test_ratio=0.15,
    k_folds=5,
    random_state=42,
    tol_min=None,
    tol_max=None,
    search_resolution=3,
    progress_callback=None,
):
    training_started_at = time.time()
    table_name = "eeg_windows" if not table_name or table_name == "ALL" else table_name
    df = load_sensor_dataset("EEG", table_name, EEG_LDA_FEATURES, label_col="target_frequency")
    # Cast target frequency to string to avoid 'continuous' classification target error with floats
    df[df.attrs["label_col"]] = df[df.attrs["label_col"]].astype(str)
    
    split_bundle = build_train_val_test_split("EEG", df, EEG_LDA_FEATURES, train_ratio, val_ratio, test_ratio, random_state=random_state, label_col="target_frequency")
    class_labels = sorted(pd.Series(df[split_bundle.label_col]).dropna().unique().tolist())

    solver_candidates = [candidate for candidate in ["svd", "lsqr", "eigen"] if candidate == str(solver).lower()] or ["svd", "lsqr", "eigen"]
    shrinkage_candidates = ["none", "auto"] if str(shrinkage).lower() in {"auto", "none"} else [shrinkage]
    tol_values = _candidate_values(tol_min, tol_max, tol, float, search_resolution)
    candidates = [
        {"solver": solver_candidate, "shrinkage": shrinkage_candidate, "tol": t} 
        for solver_candidate in solver_candidates 
        for shrinkage_candidate in shrinkage_candidates
        for t in tol_values
    ]

    total_steps = max(1, len(candidates) * int(k_folds))
    completed_steps = 0
    best_result = None
    training_history = []
    run_dir = create_training_run_dir("EEG", model_name)
    candidate_digits = max(2, len(str(len(candidates))))

    for candidate_index, candidate in enumerate(candidates, start=1):
        fold_train_scores = []
        fold_val_scores = []
        for fold_index, train_df, val_df in iter_cv_folds(split_bundle, int(k_folds), random_state=random_state):
            try:
                model, scaler, solver_used, shrinkage_used, tol_used = _fit_lda(train_df, candidate["solver"], candidate["shrinkage"], candidate.get("tol", 0.0001), label_col=split_bundle.label_col)
            except Exception:
                completed_steps += 1
                continue
            train_metrics = _score(model, scaler, train_df, EEG_LDA_FEATURES, split_bundle.label_col, class_labels)
            val_metrics = _score(model, scaler, val_df, EEG_LDA_FEATURES, split_bundle.label_col, class_labels)
            fold_train_scores.append(train_metrics["accuracy"])
            fold_val_scores.append(val_metrics["accuracy"])
            accuracy = val_metrics["accuracy"]
            id_str = f"C{candidate_index:0{candidate_digits}d}F{fold_index}"
            artifact_path = save_candidate_snapshot(run_dir, id_str, {
                "sensor": "EEG",
                "classifier": "LDA",
                "model": model,
                "scaler": scaler,
                "feature_order": EEG_LDA_FEATURES,
                "hyperparameters": {
                    "solver": solver_used,
                    "shrinkage": "none" if shrinkage_used is None else shrinkage_used,
                    "tol": tol_used,
                },
                "train_metrics": train_metrics,
                "validation_metrics": val_metrics,
                "model_id": id_str,
            })
            
            history_item = {
                "model_id": id_str,
                "candidate_index": candidate_index,
                "fold_index": fold_index,
                "accuracy": accuracy,
                "hyperparameters": {
                    "solver": solver_used,
                    "shrinkage": "none" if shrinkage_used is None else shrinkage_used,
                    "tol": tol_used,
                },
                "train_accuracy": train_metrics["accuracy"],
                "validation_accuracy": val_metrics["accuracy"],
                "n_train_samples": train_metrics["n_samples"],
                "n_validation_samples": val_metrics["n_samples"],
                "artifact_path": artifact_path,
                "timestamp": time.time(),
            }
            training_history.append(history_item)

            completed_steps += 1
            _emit_progress(
                progress_callback,
                stage="tuning",
                model_id=id_str,
                candidate_index=candidate_index,
                total_candidates=len(candidates),
                fold_index=fold_index,
                total_folds=int(k_folds),
                completed_steps=completed_steps,
                total_steps=total_steps,
                progress=float(completed_steps / total_steps),
                history_item=history_item
            )
        if not fold_val_scores:
            continue
        validation_accuracy = float(np.mean(fold_val_scores))
        train_accuracy = float(np.mean(fold_train_scores))
        result = {
            "candidate": candidate,
            "train_accuracy": train_accuracy,
            "validation_accuracy": validation_accuracy,
            "fold_accuracies": [float(score) for score in fold_val_scores],
            **_compute_bias_variance(train_accuracy, validation_accuracy, fold_val_scores),
        }
        if best_result is None or result["validation_accuracy"] > best_result["validation_accuracy"]:
            best_result = result

    if best_result is None:
        return {"error": "No valid EEG LDA candidate could be fit with the current dataset."}

    model, scaler, solver_used, shrinkage_used, tol_used = _fit_lda(
        split_bundle.train_val_df, 
        best_result["candidate"]["solver"], 
        best_result["candidate"]["shrinkage"],
        best_result["candidate"].get("tol", 0.0001),
        label_col=split_bundle.label_col,
    )
    feature_order = list(EEG_LDA_FEATURES)
    train_metrics = _score(model, scaler, split_bundle.train_val_df, feature_order, split_bundle.label_col, class_labels)
    test_metrics = _score(model, scaler, split_bundle.test_df, feature_order, split_bundle.label_col, class_labels)
    feature_importances, raw_feature_importances = _normalize_feature_importances(model, feature_order)

    paths = get_model_paths("EEG", model_name)
    joblib.dump(model, paths["model"])
    joblib.dump(scaler, paths["scaler"])

    labels = [_format_eeg_label(label) for label in class_labels]

    metadata = {
        "sensor": "EEG",
        "classifier": "LDA",
        "feature_order": feature_order,
        "table_name": table_name,
        "label_col": split_bundle.label_col,
        "frequency_classes": [_scalar_label(label) for label in class_labels],
        "created_at": datetime.now().isoformat(),
        "train_ratio": float(train_ratio),
        "val_ratio": float(val_ratio),
        "test_ratio": float(test_ratio),
        "k_folds": int(k_folds),
        "random_state": int(random_state),
        "total_candidates": int(len(candidates)),
        "total_models": int(len(training_history)),
        "training_duration_seconds": float(time.time() - training_started_at),
        "solver": solver_used,
        "shrinkage": "none" if shrinkage_used is None else shrinkage_used,
        "tol": tol_used,
        "selected_hyperparameters": {
            "solver": solver_used, 
            "shrinkage": "none" if shrinkage_used is None else shrinkage_used,
            "tol": tol_used
        },
        "train_accuracy": train_metrics["accuracy"],
        "validation_accuracy": best_result["validation_accuracy"],
        "test_accuracy": test_metrics["accuracy"],
        "fold_accuracies": best_result["fold_accuracies"],
        "average_accuracy": best_result["average_accuracy"],
        "mean_accuracy": best_result["mean_accuracy"],
        "fold_std": best_result["fold_std"],
        "fold_min": best_result["fold_min"],
        "fold_max": best_result["fold_max"],
        "train_val_gap": best_result["train_val_gap"],
        "bias_indicator": best_result["bias_indicator"],
        "variance_indicator": best_result["variance_indicator"],
        "training_history": training_history,
        "training_history_dir": str(run_dir),
        "confusion_matrix": test_metrics["confusion_matrix"],
        "labels": labels,
        "split_summary": split_summary(split_bundle, int(k_folds)),
        "group_counts": {
            "train_val_groups": int(split_bundle.train_val_df[split_bundle.group_col].astype(str).nunique()) if split_bundle.group_col else 0,
            "test_groups": int(split_bundle.test_df[split_bundle.group_col].astype(str).nunique()) if split_bundle.group_col else 0,
        },
    }
    with open(paths["meta"], "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    config_manager.set_active_model("EEG", model_name)
    _emit_progress(progress_callback, stage="completed", progress=1.0, completed_steps=total_steps, total_steps=total_steps)
    return {
        "status": "success",
        "sensor": "EEG",
        "classifier": "LDA",
        "model_name": model_name,
        "model_path": str(paths["model"]),
        "feature_order": feature_order,
        "feature_importances": feature_importances,
        "raw_feature_importances": raw_feature_importances,
        "visualization": test_metrics["visualization"],
        "confusion_matrix": test_metrics["confusion_matrix"],
        "labels": labels,
        "n_samples": test_metrics["n_samples"],
        **metadata,
    }


def evaluate_eeg_lda_model(table_name="eeg_windows", model_name=None):
    current_name = model_name or config_manager.get_active_model("EEG")
    if not current_name:
        return {"error": "No EEG model selected or loaded."}
    paths = get_model_paths("EEG", current_name)
    if not paths["model"].exists():
        return {"error": f"Model {current_name} not found"}
    model = joblib.load(paths["model"])
    scaler = joblib.load(paths["scaler"]) if paths["scaler"].exists() else None
    meta = {}
    if paths["meta"].exists():
        try:
            with open(paths["meta"], "r", encoding="utf-8") as handle:
                meta = json.load(handle)
        except Exception:
            meta = {}

    feature_order = _resolve_model_feature_order(model, scaler)
    response = {
        "status": "success",
        "sensor": "EEG",
        "classifier": meta.get("classifier", "LDA"),
        "model_name": current_name,
        "model_path": str(paths["model"]),
        "feature_order": feature_order,
        "feature_importances": _normalize_feature_importances(model, feature_order)[0],
        "raw_feature_importances": _normalize_feature_importances(model, feature_order)[1],
        "hyperparameters": meta,
        "train_accuracy": meta.get("train_accuracy"),
        "validation_accuracy": meta.get("validation_accuracy"),
        "test_accuracy": meta.get("test_accuracy"),
        "average_accuracy": meta.get("average_accuracy"),
        "mean_accuracy": meta.get("mean_accuracy"),
        "fold_accuracies": meta.get("fold_accuracies", []),
        "fold_std": meta.get("fold_std"),
        "fold_min": meta.get("fold_min"),
        "fold_max": meta.get("fold_max"),
        "train_val_gap": meta.get("train_val_gap"),
        "bias_indicator": meta.get("bias_indicator"),
        "variance_indicator": meta.get("variance_indicator"),
        "training_history": meta.get("training_history", []),
        "training_history_dir": meta.get("training_history_dir"),
        "split_summary": meta.get("split_summary", {}),
        "group_counts": meta.get("group_counts", {}),
        "accuracy": meta.get("test_accuracy", meta.get("accuracy")),
        "confusion_matrix": meta.get("confusion_matrix"),
        "labels": meta.get("labels"),
        "n_samples": meta.get("split_summary", {}).get("test_samples"),
    }
    if not table_name:
        return response
    label_col = meta.get("label_col", "target_frequency")
    class_labels = meta.get("frequency_classes") or getattr(model, "classes_", [])
    df = load_sensor_dataset("EEG", table_name, feature_order, label_col=label_col)
    # Ensure targets are strings for consistent multiclass evaluation
    df[df.attrs["label_col"]] = df[df.attrs["label_col"]].astype(str)
    
    metrics = _score(model, scaler, df, feature_order, label_col, class_labels)
    response.update({
        "accuracy": metrics["accuracy"],
        "confusion_matrix": metrics["confusion_matrix"],
        "n_samples": metrics["n_samples"],
        "visualization": metrics["visualization"],
    })
    return response
