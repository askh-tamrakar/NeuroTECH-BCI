from __future__ import annotations

import json
import os
import time
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.preprocessing import StandardScaler

from src.database.db_manager import db_manager
from src.feature.extractors.rps_extractor import EMG_FEATURE_COLUMNS
from src.learning.data_splitter import build_train_val_test_split, iter_cv_folds, load_sensor_dataset, split_summary
from src.learning.tree_utils import tree_to_json
from src.utils.paths import get_base_data_dir


LABELS_MAP = {
    "EMG": [0, 1, 2, 3],
    "EOG": [0, 1, 2],
    "EEG": [0, 1, 2, 3, 4, 5, 6],
}

DISPLAY_LABELS = {
    "EMG": {0: "Rest", 1: "Rock", 2: "Paper", 3: "Scissors"},
    "EOG": {0: "Rest", 1: "SingleBlink", 2: "DoubleBlink"},
    "EEG": {0: "Rest", 1: "Target 1", 2: "Target 2", 3: "Target 3", 4: "Target 4", 5: "Target 5", 6: "Target 6"},
}

MODELS_ROOT = get_base_data_dir()
REJECTED_MODELS_ROOT = Path(__file__).resolve().parents[3] / "rejected_models"

ACTIVE_MODELS = {"EMG": None, "EOG": None, "EEG": None}
ACTIVE_SCALERS = {"EMG": None, "EOG": None, "EEG": None}
ACTIVE_MODEL_NAMES = {"EMG": None, "EOG": None, "EEG": None}

LEGACY_EMG_FEATURE_COLUMNS = [
    "rms", "mav", "var", "wl", "peak", "range", "iemg", "entropy", "energy", "kurtosis", "skewness", "ssc", "wamp"
]


def get_feature_cols(sensor):
    sensor = sensor.upper()
    if sensor == "EMG":
        return list(EMG_FEATURE_COLUMNS)
    if sensor == "EOG":
        return ["amplitude", "duration_ms", "rise_time_ms", "fall_time_ms", "asymmetry", "peak_count", "kurtosis", "skewness"]
    if sensor == "EEG":
        return [
            "score_1", "score_2", "score_3", "score_4", "score_5", "score_6",
            "max_score", "second_max_score", "score_ratio", "score_mean", "score_std", "peak_freq",
        ]
    return []


def resolve_feature_cols(sensor, model=None, scaler=None):
    sensor = sensor.upper()
    feature_cols = get_feature_cols(sensor)
    if sensor == "EMG":
        expected = getattr(scaler, "n_features_in_", None)
        if expected is None and model is not None:
            expected = getattr(model, "n_features_in_", None)
        if expected == len(LEGACY_EMG_FEATURE_COLUMNS):
            return LEGACY_EMG_FEATURE_COLUMNS
    return feature_cols


def get_model_paths(sensor, model_name):
    clean_name = "".join([c for c in model_name if c.isalnum() or c in ("_", "-")])
    sensor_dir = MODELS_ROOT / sensor.upper() / "models"
    sensor_dir.mkdir(parents=True, exist_ok=True)
    base = sensor_dir / clean_name
    return {
        "model": base.with_suffix(".joblib"),
        "scaler": sensor_dir / f"{clean_name}_scaler.joblib",
        "meta": sensor_dir / f"{clean_name}_meta.json",
    }


def get_rejected_models_root(sensor: str) -> Path:
    root = REJECTED_MODELS_ROOT / sensor.upper()
    root.mkdir(parents=True, exist_ok=True)
    return root


def create_training_run_dir(sensor: str, model_name: str) -> Path:
    clean_name = "".join([c for c in model_name if c.isalnum() or c in ("_", "-")]) or sensor.lower()
    run_dir = get_rejected_models_root(sensor) / f"{clean_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


def save_candidate_snapshot(run_dir: Path, model_id: str, payload: dict) -> str:
    path = run_dir / f"{model_id}.joblib"
    joblib.dump(payload, path)
    return str(path)


def _collect_emg_session_profile(df):
    if df.empty:
        return {}

    def normalized_values(primary_column, default_value, fallback_column=None):
        if primary_column not in df.columns and (not fallback_column or fallback_column not in df.columns):
            return [default_value]
        if fallback_column and fallback_column in df.columns:
            base = pd.to_numeric(df[fallback_column], errors="coerce")
        else:
            base = pd.Series([default_value] * len(df))
        if primary_column in df.columns:
            series = pd.to_numeric(df[primary_column], errors="coerce")
            series = series.where(series > 0, base)
        else:
            series = base
        series = series.fillna(default_value).replace(0, default_value)
        values = sorted({round(float(v), 4) for v in series.tolist()})
        return values or [default_value]

    return {
        "window_ms": normalized_values("session_window_ms", 300.0, fallback_column="window_ms"),
        "sampling_rate": normalized_values("sampling_rate", 1000.0),
        "stride_ms": normalized_values("session_stride_ms", 300.0),
    }


def _validate_emg_session_profile(df, table_name):
    profile = _collect_emg_session_profile(df)
    mixed_fields = {key: values for key, values in profile.items() if len(values) > 1}
    if mixed_fields:
        return {"error": f"EMG table {table_name} mixes collection configs. Found {mixed_fields}."}
    return profile


def _filter_emg_training_rows(df, table_name):
    if df.empty or table_name != "emg_windows":
        return df
    filtered = df.copy()
    if "sample_count" in filtered.columns:
        filtered = filtered.loc[pd.to_numeric(filtered["sample_count"], errors="coerce").fillna(0) > 0]
    if "session_window_ms" in filtered.columns:
        filtered = filtered.loc[pd.to_numeric(filtered["session_window_ms"], errors="coerce").fillna(0) > 0]
    return filtered


def _candidate_values(min_value, max_value, exact_value, caster, search_resolution=3):
    if min_value is None and max_value is None:
        return [caster(exact_value)]
    lo = caster(min_value if min_value is not None else exact_value)
    hi = caster(max_value if max_value is not None else exact_value)
    if hi < lo:
        lo, hi = hi, lo
    if lo == hi:
        return [lo]
    
    # Ensure at least 2 steps (min and max)
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
    train_val_gap = float(train_accuracy - validation_accuracy)
    bias_indicator = "balanced"
    variance_indicator = "balanced"
    if train_accuracy < 0.75 and validation_accuracy < 0.75:
        bias_indicator = "high"
    elif train_accuracy < 0.85 and validation_accuracy < 0.85:
        bias_indicator = "moderate"
    if train_val_gap > 0.1 or fold_std > 0.08:
        variance_indicator = "high"
    elif train_val_gap > 0.05 or fold_std > 0.04:
        variance_indicator = "moderate"
    return {
        "average_accuracy": float(np.mean(fold_accuracies)) if fold_accuracies else float(validation_accuracy),
        "mean_accuracy": float(np.mean(fold_accuracies)) if fold_accuracies else float(validation_accuracy),
        "fold_std": fold_std,
        "fold_min": float(np.min(fold_accuracies)) if fold_accuracies else float(validation_accuracy),
        "fold_max": float(np.max(fold_accuracies)) if fold_accuracies else float(validation_accuracy),
        "train_val_gap": train_val_gap,
        "bias_indicator": bias_indicator,
        "variance_indicator": variance_indicator,
    }


def _fit_rf(train_df, feature_cols, n_estimators, max_depth, min_impurity_decrease, criterion="gini", max_features="sqrt", label_col="class_label"):
    scaler = StandardScaler()
    X_train = train_df[feature_cols].fillna(0.0)
    y_train = train_df[label_col].astype(int)
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


def _score_rf(model, scaler, df, feature_cols, sensor, label_col="class_label"):
    X = df[feature_cols].fillna(0.0)
    y = df[label_col].astype(int)
    X_scaled = scaler.transform(X)
    y_pred = model.predict(X_scaled)
    labels = LABELS_MAP[sensor]
    return {
        "accuracy": float(accuracy_score(y, y_pred)),
        "confusion_matrix": confusion_matrix(y, y_pred, labels=labels).tolist(),
        "n_samples": int(len(df)),
    }


def _emit_progress(progress_callback, **payload):
    if progress_callback:
        progress_callback(payload)


def train_emg_model(
    n_estimators=200,
    max_depth=15,
    min_impurity_decrease=0.0,
    table_name="emg_windows",
    model_name="emg_rf_model",
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
    table_name = "emg_windows" if not table_name or table_name == "ALL" else table_name
    feature_cols = list(EMG_FEATURE_COLUMNS)
    df = load_sensor_dataset("EMG", table_name, feature_cols, label_col="class_label", row_filter=_filter_emg_training_rows)
    profile = _validate_emg_session_profile(df, table_name)
    if "error" in profile:
        return profile

    split_bundle = build_train_val_test_split(
        "EMG",
        df,
        feature_cols,
        train_ratio=train_ratio,
        val_ratio=val_ratio,
        test_ratio=test_ratio,
        random_state=random_state,
    )

    n_estimators_values = _candidate_values(n_estimators_min, n_estimators_max, n_estimators, int, search_resolution)
    max_depth_values = _candidate_values(max_depth_min, max_depth_max, max_depth, int, search_resolution)
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
    run_dir = create_training_run_dir("EMG", model_name)
    candidate_digits = max(2, len(str(len(candidates))))

    for candidate_index, candidate in enumerate(candidates, start=1):
        fold_train_scores = []
        fold_val_scores = []
        for fold_index, fold_train_df, fold_val_df in iter_cv_folds(split_bundle, int(k_folds), random_state=random_state):
            model, scaler = _fit_rf(fold_train_df, feature_cols, label_col=split_bundle.label_col, **candidate)
            train_metrics = _score_rf(model, scaler, fold_train_df, feature_cols, "EMG", label_col=split_bundle.label_col)
            val_metrics = _score_rf(model, scaler, fold_val_df, feature_cols, "EMG", label_col=split_bundle.label_col)
            fold_train_scores.append(train_metrics["accuracy"])
            fold_val_scores.append(val_metrics["accuracy"])
            accuracy = val_metrics["accuracy"]
            id_str = f"C{candidate_index:0{candidate_digits}d}F{fold_index}"
            artifact_path = save_candidate_snapshot(run_dir, id_str, {
                "sensor": "EMG",
                "classifier": "RandomForest",
                "model": model,
                "scaler": scaler,
                "feature_order": feature_cols,
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

    final_model, final_scaler = _fit_rf(split_bundle.train_val_df, feature_cols, label_col=split_bundle.label_col, **best_result["candidate"])
    train_metrics = _score_rf(final_model, final_scaler, split_bundle.train_val_df, feature_cols, "EMG", label_col=split_bundle.label_col)
    test_metrics = _score_rf(final_model, final_scaler, split_bundle.test_df, feature_cols, "EMG", label_col=split_bundle.label_col)
    importances = dict(zip(feature_cols, final_model.feature_importances_.tolist()))
    tree_struct = tree_to_json(final_model.estimators_[0], feature_cols)

    paths = get_model_paths("EMG", model_name)
    joblib.dump(final_model, paths["model"])
    joblib.dump(final_scaler, paths["scaler"])

    metadata = {
        "sensor": "EMG",
        "classifier": "RandomForest",
        "feature_order": feature_cols,
        "table_name": table_name,
        "label_col": split_bundle.label_col,
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
        "labels": [DISPLAY_LABELS["EMG"][idx] for idx in LABELS_MAP["EMG"]],
        "split_summary": split_summary(split_bundle, int(k_folds)),
        "group_counts": {
            "train_val_groups": int(split_bundle.train_val_df[split_bundle.group_col].astype(str).nunique()) if split_bundle.group_col else 0,
            "test_groups": int(split_bundle.test_df[split_bundle.group_col].astype(str).nunique()) if split_bundle.group_col else 0,
        },
        "session_profile": profile,
    }
    with open(paths["meta"], "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    load_model("EMG", model_name)
    _emit_progress(progress_callback, stage="completed", progress=1.0, completed_steps=total_steps, total_steps=total_steps)
    return {
        "status": "success",
        "sensor": "EMG",
        "classifier": "RandomForest",
        "model_name": model_name,
        "model_path": str(paths["model"]),
        "feature_order": feature_cols,
        "feature_importances": importances,
        "tree_structure": tree_struct,
        "confusion_matrix": test_metrics["confusion_matrix"],
        "labels": metadata["labels"],
        "n_samples": test_metrics["n_samples"],
        **metadata,
    }


def list_saved_models(sensor="EMG"):
    models = []
    sensor = sensor.upper()
    sensor_dir = MODELS_ROOT / sensor / "models"
    from src.utils.config import config_manager
    active_name = config_manager.get_active_model(sensor)
    if not sensor_dir.exists():
        return []
    for path in sensor_dir.glob("*.joblib"):
        if path.name.endswith("_scaler.joblib"):
            continue
        name = path.stem
        meta_path = sensor_dir / f"{name}_meta.json"
        meta = {}
        if meta_path.exists():
            try:
                with open(meta_path, "r", encoding="utf-8") as handle:
                    meta = json.load(handle)
            except Exception:
                meta = {}
        models.append({
            "name": name,
            "path": str(path),
            "created_at": meta.get("created_at"),
            "accuracy": meta.get("test_accuracy", meta.get("accuracy")),
            "hyperparameters": meta.get("selected_hyperparameters") or {k: v for k, v in meta.items() if k not in {"created_at", "accuracy"}},
            "training_duration_seconds": meta.get("training_duration_seconds"),
            "total_candidates": meta.get("total_candidates"),
            "total_models": meta.get("total_models"),
            "k_folds": meta.get("k_folds"),
            "active": name == active_name,
        })
    models.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return models


def delete_model(sensor, model_name):
    paths = get_model_paths(sensor, model_name)
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


def load_model(sensor, model_name):
    sensor = sensor.upper()
    paths = get_model_paths(sensor, model_name)
    if not paths["model"].exists() or not paths["scaler"].exists():
        return {"error": f"Model {model_name} not found"}
    try:
        ACTIVE_MODELS[sensor] = joblib.load(paths["model"])
        ACTIVE_SCALERS[sensor] = joblib.load(paths["scaler"])
        ACTIVE_MODEL_NAMES[sensor] = model_name
        from src.utils.config import config_manager
        config_manager.set_active_model(sensor, model_name)
        return {"status": "success", "model_name": model_name}
    except Exception as exc:
        return {"error": str(exc)}


def evaluate_saved_model(sensor="EMG", table_name=None, model_name=None):
    sensor = sensor.upper()
    current_name = model_name or ACTIVE_MODEL_NAMES[sensor]
    if not current_name:
        current_name = "emg_rf_model" if sensor == "EMG" else f"{sensor.lower()}_rf"
    paths = get_model_paths(sensor, current_name)
    if not paths["model"].exists():
        return {"error": f"Model {current_name} not found"}

    model = ACTIVE_MODELS[sensor] if ACTIVE_MODEL_NAMES[sensor] == current_name and ACTIVE_MODELS[sensor] is not None else joblib.load(paths["model"])
    scaler = ACTIVE_SCALERS[sensor] if ACTIVE_MODEL_NAMES[sensor] == current_name and ACTIVE_SCALERS[sensor] is not None else joblib.load(paths["scaler"])
    feature_cols = resolve_feature_cols(sensor, model=model, scaler=scaler)
    meta = {}
    if paths["meta"].exists():
        try:
            with open(paths["meta"], "r", encoding="utf-8") as handle:
                meta = json.load(handle)
        except Exception:
            meta = {}

    base_response = {
        "status": "success",
        "model_name": current_name,
        "model_path": str(paths["model"]),
        "feature_order": feature_cols,
        "feature_importances": dict(zip(feature_cols, getattr(model, "feature_importances_", np.zeros(len(feature_cols))).tolist())),
        "tree_structure": tree_to_json(model.estimators_[0], feature_cols) if hasattr(model, "estimators_") and len(model.estimators_) else None,
        "hyperparameters": meta,
        "train_accuracy": meta.get("train_accuracy"),
        "validation_accuracy": meta.get("validation_accuracy"),
        "test_accuracy": meta.get("test_accuracy", meta.get("accuracy")),
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
        "classifier": meta.get("classifier", "RandomForest"),
    }

    if not table_name:
        return base_response

    label_col = meta.get("label_col", "class_label" if sensor == "EMG" else "label")
    df = load_sensor_dataset(sensor, table_name, feature_cols, label_col=label_col, row_filter=_filter_emg_training_rows if sensor == "EMG" else None)
    metrics = _score_rf(model, scaler, df, feature_cols, sensor, label_col=label_col)
    base_response.update({
        "accuracy": metrics["accuracy"],
        "confusion_matrix": metrics["confusion_matrix"],
        "n_samples": metrics["n_samples"],
    })
    return base_response


def get_model_tree_structure(sensor="EMG", model_name=None, tree_index=0):
    sensor = sensor.upper()
    current_name = model_name or ACTIVE_MODEL_NAMES[sensor]
    if not current_name:
        return {"error": "Model not found"}
    model = ACTIVE_MODELS[sensor] if ACTIVE_MODEL_NAMES[sensor] == current_name and ACTIVE_MODELS[sensor] is not None else None
    if model is None:
        paths = get_model_paths(sensor, current_name)
        if not paths["model"].exists():
            return {"error": "Model not found"}
        model = joblib.load(paths["model"])
    if tree_index < 0 or tree_index >= len(model.estimators_):
        return {"error": f"Tree index {tree_index} out of bounds"}
    feature_cols = resolve_feature_cols(sensor, model=model)
    return {
        "status": "success",
        "tree_index": int(tree_index),
        "total_trees": int(len(model.estimators_)),
        "tree_structure": tree_to_json(model.estimators_[tree_index], feature_cols),
    }


try:
    load_model("EMG", "emg_rf_model")
except Exception:
    pass
