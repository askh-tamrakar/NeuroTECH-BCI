from __future__ import annotations

import json
import os
import time
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.preprocessing import StandardScaler

from src.learning.data_splitter import build_train_val_test_split, iter_cv_folds, load_sensor_dataset, split_summary
from src.learning.emg_trainer import create_training_run_dir, save_candidate_snapshot
from src.learning.tree_utils import tree_to_json
from src.utils.paths import get_base_data_dir


STANDARD_LABELS = [0, 1, 2]
MODELS_DIR = get_base_data_dir() / "EOG" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
EOG_FEATURES = ["amplitude", "duration_ms", "rise_time_ms", "fall_time_ms", "asymmetry", "peak_count", "kurtosis", "skewness"]

ACTIVE_MODEL = None
ACTIVE_SCALER = None
ACTIVE_MODEL_NAME = None


def get_model_paths(model_name=None):
    if not model_name:
        return {
            "model": MODELS_DIR / "eog_rf.joblib",
            "scaler": MODELS_DIR / "eog_rf_scaler.joblib",
            "meta": MODELS_DIR / "eog_rf_meta.json",
        }
    clean_name = "".join([c for c in model_name if c.isalnum() or c in ("_", "-")])
    base = MODELS_DIR / clean_name
    return {
        "model": base.with_suffix(".joblib"),
        "scaler": MODELS_DIR / f"{clean_name}_scaler.joblib",
        "meta": MODELS_DIR / f"{clean_name}_meta.json",
    }


def _candidate_values(min_value, max_value, exact_value, caster, search_resolution=3):
    if min_value is None and max_value is None:
        return [caster(exact_value)]
    lo = caster(min_value if min_value is not None else exact_value)
    hi = caster(max_value if max_value is not None else exact_value)
    if hi < lo:
        lo, hi = hi, lo
    if lo == hi:
        return [lo]
    
    steps = max(2, int(search_resolution))
    step_size = (hi - lo) / (steps - 1)
    
    values = set()
    for i in range(steps):
        val = lo + (step_size * i)
        if caster is int:
            values.add(int(round(val)))
        else:
            values.add(round(float(val), 6))
            
    return sorted(list(values))


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


def _fit_rf(train_df, n_estimators, max_depth, min_impurity_decrease, criterion="gini", max_features="sqrt"):
    scaler = StandardScaler()
    X_train = train_df[EOG_FEATURES].fillna(0.0)
    y_train = train_df["label"].astype(int)
    X_train_scaled = scaler.fit_transform(X_train)
    model = RandomForestClassifier(
        n_estimators=int(n_estimators),
        max_depth=int(max_depth) if max_depth is not None else None,
        min_impurity_decrease=float(min_impurity_decrease),
        criterion=criterion,
        max_features=None if max_features in ("None", "none", None) else max_features,
        random_state=42,
    )
    model.fit(X_train_scaled, y_train)
    return model, scaler


def _score(model, scaler, df):
    X = df[EOG_FEATURES].fillna(0.0)
    y = df["label"].astype(int)
    y_pred = model.predict(scaler.transform(X))
    return {
        "accuracy": float(accuracy_score(y, y_pred)),
        "confusion_matrix": confusion_matrix(y, y_pred, labels=STANDARD_LABELS).tolist(),
        "n_samples": int(len(df)),
    }


def _emit_progress(progress_callback, **payload):
    if progress_callback:
        progress_callback(payload)


def train_eog_model(
    n_estimators=100,
    max_depth=None,
    min_impurity_decrease=0.0,
    table_name="eog_windows",
    model_name="eog_rf",
    train_ratio=0.7,
    val_ratio=0.15,
    test_ratio=0.15,
    k_folds=5,
    random_state=42,
    n_estimators_min=None,
    n_estimators_max=None,
    max_depth_min=None,
    max_depth_max=None,
    min_impurity_decrease_min=None,
    min_impurity_decrease_max=None,
    criterion="gini",
    max_features="sqrt",
    search_resolution=3,
    progress_callback=None,
):
    training_started_at = time.time()
    table_name = "eog_windows" if not table_name or table_name in {"ALL", "undefined", "null"} else table_name
    df = load_sensor_dataset("EOG", table_name, EOG_FEATURES)
    split_bundle = build_train_val_test_split("EOG", df, EOG_FEATURES, train_ratio, val_ratio, test_ratio, random_state=random_state)

    n_estimators_values = _candidate_values(n_estimators_min, n_estimators_max, n_estimators, int, search_resolution)
    max_depth_values = _candidate_values(max_depth_min, max_depth_max, max_depth if max_depth is not None else 5, int, search_resolution)
    impurity_values = _candidate_values(min_impurity_decrease_min, min_impurity_decrease_max, min_impurity_decrease, float, search_resolution)
    candidates = [
        {
            "n_estimators": trees, 
            "max_depth": depth, 
            "min_impurity_decrease": impurity,
            "criterion": crit,
            "max_features": mf
        }
        for trees in n_estimators_values
        for depth in max_depth_values
        for impurity in impurity_values
        for crit in (criterion.split(',') if isinstance(criterion, str) else [criterion])
        for mf in (max_features.split(',') if isinstance(max_features, str) else [max_features])
    ]
    total_steps = max(1, len(candidates) * int(k_folds))
    completed_steps = 0
    best_result = None
    training_history = []
    run_dir = create_training_run_dir("EOG", model_name)
    candidate_digits = max(2, len(str(len(candidates))))

    for candidate_index, candidate in enumerate(candidates, start=1):
        fold_train_scores = []
        fold_val_scores = []
        for fold_index, train_df, val_df in iter_cv_folds(split_bundle, int(k_folds), random_state=random_state):
            model, scaler = _fit_rf(
                train_df, 
                candidate["n_estimators"], 
                candidate["max_depth"], 
                candidate["min_impurity_decrease"],
                candidate["criterion"],
                candidate["max_features"]
            )
            train_metrics = _score(model, scaler, train_df)
            val_metrics = _score(model, scaler, val_df)
            fold_train_scores.append(train_metrics["accuracy"])
            fold_val_scores.append(val_metrics["accuracy"])
            accuracy = val_metrics["accuracy"]
            id_str = f"C{candidate_index:0{candidate_digits}d}F{fold_index}"
            artifact_path = save_candidate_snapshot(run_dir, id_str, {
                "sensor": "EOG",
                "classifier": "RandomForest",
                "model": model,
                "scaler": scaler,
                "feature_order": EOG_FEATURES,
                "hyperparameters": dict(candidate),
                "train_metrics": train_metrics,
                "validation_metrics": val_metrics,
                "model_id": id_str,
            })
            
            history_item = {
                "model_id": id_str,
                "candidate_index": candidate_index,
                "fold_index": fold_index,
                "accuracy": accuracy,
                "hyperparameters": dict(candidate),
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
            best_result["model_id"] = id_str
            best_result["candidate_index"] = candidate_index
            best_result["fold_index"] = fold_index

    model, scaler = _fit_rf(
        split_bundle.train_val_df, 
        best_result["candidate"]["n_estimators"],
        best_result["candidate"]["max_depth"],
        best_result["candidate"]["min_impurity_decrease"],
        best_result["candidate"]["criterion"],
        best_result["candidate"]["max_features"]
    )
    train_metrics = _score(model, scaler, split_bundle.train_val_df)
    test_metrics = _score(model, scaler, split_bundle.test_df)
    paths = get_model_paths(model_name)
    joblib.dump(model, paths["model"])
    joblib.dump(scaler, paths["scaler"])

    metadata = {
        "sensor": "EOG",
        "classifier": "RandomForest",
        "model_id": best_result.get("model_id"),
        "best_candidate_index": best_result.get("candidate_index"),
        "best_fold_index": best_result.get("fold_index"),
        "feature_order": EOG_FEATURES,
        "table_name": table_name,
        "created_at": datetime.now().isoformat(),
        "train_ratio": float(train_ratio),
        "val_ratio": float(val_ratio),
        "test_ratio": float(test_ratio),
        "k_folds": int(k_folds),
        "random_state": int(random_state),
        "total_candidates": int(len(candidates)),
        "total_models": int(len(training_history)),
        "training_duration_seconds": float(time.time() - training_started_at),
        "selected_hyperparameters": best_result["candidate"],
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
        "labels": STANDARD_LABELS,
        "split_summary": split_summary(split_bundle, int(k_folds)),
    }
    with open(paths["meta"], "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    load_model(model_name)
    _emit_progress(progress_callback, stage="completed", progress=1.0, completed_steps=total_steps, total_steps=total_steps)
    return {
        "status": "success",
        "sensor": "EOG",
        "classifier": "RandomForest",
        "model_name": model_name,
        "model_path": str(paths["model"]),
        "feature_order": EOG_FEATURES,
        "feature_importances": dict(zip(EOG_FEATURES, model.feature_importances_.tolist())),
        "tree_structure": tree_to_json(model.estimators_[0], EOG_FEATURES),
        "confusion_matrix": test_metrics["confusion_matrix"],
        "labels": STANDARD_LABELS,
        "n_samples": test_metrics["n_samples"],
        **metadata,
    }


def evaluate_saved_eog_model(table_name="eog_windows", model_name=None):
    global ACTIVE_MODEL, ACTIVE_SCALER, ACTIVE_MODEL_NAME
    current_name = model_name or ACTIVE_MODEL_NAME or "eog_rf"
    paths = get_model_paths(current_name)
    if not paths["model"].exists():
        return {"error": f"Model {current_name} not found"}
    model = ACTIVE_MODEL if ACTIVE_MODEL_NAME == current_name and ACTIVE_MODEL is not None else joblib.load(paths["model"])
    scaler = ACTIVE_SCALER if ACTIVE_MODEL_NAME == current_name and ACTIVE_SCALER is not None else joblib.load(paths["scaler"])
    meta = {}
    if paths["meta"].exists():
        try:
            with open(paths["meta"], "r", encoding="utf-8") as handle:
                meta = json.load(handle)
        except Exception:
            meta = {}
    response = {
        "status": "success",
        "model_name": current_name,
        "model_path": str(paths["model"]),
        "feature_order": EOG_FEATURES,
        "feature_importances": dict(zip(EOG_FEATURES, model.feature_importances_.tolist())),
        "tree_structure": tree_to_json(model.estimators_[0], EOG_FEATURES),
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
        "accuracy": meta.get("test_accuracy", meta.get("accuracy")),
        "confusion_matrix": meta.get("confusion_matrix"),
        "labels": meta.get("labels", STANDARD_LABELS),
        "n_samples": meta.get("split_summary", {}).get("test_samples"),
        "classifier": meta.get("classifier", "RandomForest"),
    }
    if not table_name:
        return response
    df = load_sensor_dataset("EOG", table_name, EOG_FEATURES)
    metrics = _score(model, scaler, df)
    response.update({
        "accuracy": metrics["accuracy"],
        "confusion_matrix": metrics["confusion_matrix"],
        "n_samples": metrics["n_samples"],
    })
    return response


def list_saved_models():
    models = []
    for path in MODELS_DIR.glob("*.joblib"):
        if path.name.endswith("_scaler.joblib"):
            continue
        meta_path = MODELS_DIR / f"{path.stem}_meta.json"
        meta = {}
        if meta_path.exists():
            try:
                with open(meta_path, "r", encoding="utf-8") as handle:
                    meta = json.load(handle)
            except Exception:
                meta = {}
        models.append({
            "name": path.stem,
            "path": str(path),
            "created_at": meta.get("created_at"),
            "accuracy": meta.get("test_accuracy", meta.get("accuracy")),
            "hyperparameters": meta.get("selected_hyperparameters", {}),
            "training_duration_seconds": meta.get("training_duration_seconds"),
            "total_models": meta.get("total_models"),
            "k_folds": meta.get("k_folds"),
            "candidate_index": meta.get("best_candidate_index"),
            "fold_index": meta.get("best_fold_index"),
            "model_id": meta.get("model_id") or (meta.get("training_history")[-1].get("model_id") if (meta.get("training_history") and len(meta.get("training_history")) > 0) else None),
        })
    models.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return models


def delete_model(model_name):
    paths = get_model_paths(model_name)
    deleted = []
    errors = []
    for _, path in paths.items():
        if path.exists():
            try:
                os.remove(path)
                deleted.append(str(path))
            except Exception as exc:
                errors.append(f"Failed to delete {path}: {exc}")
    if errors:
        return {"status": "partial_success", "deleted": deleted, "errors": errors}
    return {"status": "success", "deleted": deleted}


def load_model(model_name):
    global ACTIVE_MODEL, ACTIVE_SCALER, ACTIVE_MODEL_NAME
    paths = get_model_paths(model_name)
    if not paths["model"].exists() or not paths["scaler"].exists():
        return {"error": f"Model {model_name} not found"}
    try:
        ACTIVE_MODEL = joblib.load(paths["model"])
        ACTIVE_SCALER = joblib.load(paths["scaler"])
        ACTIVE_MODEL_NAME = model_name
        return {"status": "success", "model_name": model_name}
    except Exception as exc:
        return {"error": str(exc)}
