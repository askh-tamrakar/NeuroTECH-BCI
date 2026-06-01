import json
import os
from itertools import product
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.model_selection import train_test_split, GroupShuffleSplit, GroupKFold, StratifiedShuffleSplit
from sklearn.preprocessing import StandardScaler

from src.database.db_manager import db_manager
from src.learning.tree_utils import tree_to_json
from src.utils.paths import get_base_data_dir

EMG_FEATURE_COLUMNS = [
    'rms', 'mav', 'var', 'wl', 'peak', 'range', 'iemg',
    'entropy', 'energy', 'kurtosis', 'skewness', 'ssc', 'wamp',
]

LABELS_MAP = {
    'EMG': [0, 1, 2, 3],
    'EOG': [0, 1, 2],
    'EEG': [0, 1, 2, 3, 4, 5, 6],
}

DISPLAY_LABELS = {
    'EMG': {0: 'Rest', 1: 'Rock', 2: 'Paper', 3: 'Scissors'},
    'EOG': {0: 'Rest', 1: 'SingleBlink', 2: 'DoubleBlink'},
    'EEG': {0: 'Rest', 1: 'T1', 2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6'},
}

MODELS_ROOT = get_base_data_dir()
ACTIVE_MODELS = {'EMG': None, 'EOG': None, 'EEG': None}
ACTIVE_SCALERS = {'EMG': None, 'EOG': None, 'EEG': None}
ACTIVE_MODEL_NAMES = {'EMG': None, 'EOG': None, 'EEG': None}


def get_feature_cols(sensor):
    sensor = sensor.upper()
    if sensor == 'EMG':
        return list(EMG_FEATURE_COLUMNS)
    if sensor == 'EOG':
        return ['amplitude', 'duration_ms', 'rise_time_ms', 'fall_time_ms', 'asymmetry', 'peak_count', 'kurtosis', 'skewness']
    if sensor == 'EEG':
        return ['score_1', 'score_2', 'score_3', 'score_4', 'score_5', 'score_6', 'max_score', 'second_max_score', 'score_ratio', 'score_mean', 'score_std', 'dominant_freq', 'peak_freq']
    return []


def get_group_column(sensor):
    return None


def get_model_paths(sensor, model_id):
    sensor_dir = MODELS_ROOT / sensor.upper() / "models"
    sensor_dir.mkdir(parents=True, exist_ok=True)
    base = sensor_dir / model_id
    return {
        "model": base.with_suffix(".joblib"),
        "scaler": sensor_dir / f"{model_id}_scaler.joblib",
        "meta": sensor_dir / f"{model_id}_meta.json",
    }


def get_rejected_model_paths(sensor, model_id):
    rejected_dir = MODELS_ROOT / sensor.upper() / "rejected_models"
    rejected_dir.mkdir(parents=True, exist_ok=True)
    base = rejected_dir / model_id
    return {
        "model": base.with_suffix(".joblib"),
        "scaler": rejected_dir / f"{model_id}_scaler.joblib",
        "meta": rejected_dir / f"{model_id}_meta.json",
    }


def _candidate_prefix(candidate_index: int) -> str:
    visible_candidate = max(1, int(candidate_index) + 1)
    return chr(ord('C') + (visible_candidate // 256))


def generate_model_id(candidate_index: int, fold_index: int) -> str:
    visible_candidate = max(1, int(candidate_index) + 1)
    return f"{_candidate_prefix(candidate_index)}{visible_candidate % 256:02X}F{int(fold_index):X}"


def _normalize_label(sensor: str, value):
    sensor = sensor.upper()
    if sensor != 'EEG':
        try:
            return int(value)
        except Exception:
            return 0
    raw = str(value).strip().lower()
    mapping = {
        'rest': 0, '0': 0,
        't1': 1, 'target 1': 1, 'concentration': 1, '1': 1,
        't2': 2, 'target 2': 2, 'relaxation': 2, '2': 2,
        't3': 3, 'target 3': 3, '3': 3,
        't4': 4, 'target 4': 4, '4': 4,
        't5': 5, 'target 5': 5, '5': 5,
        't6': 6, 'target 6': 6, '6': 6,
    }
    return mapping.get(raw, 0)


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return float(default)


def _load_table(sensor: str, table_name: str):
    conn = db_manager.connect(sensor)
    try:
        return pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    finally:
        conn.close()


def _resolve_split_configuration(train_split, val_split, test_split, n_folds):
    test_ratio = min(max(_safe_float(test_split, 0.15), 0.01), 0.5)
    remaining = max(0.01, 1.0 - test_ratio)
    requested_folds = int(max(1, min(15, int(n_folds or 1))))

    if requested_folds <= 1:
        val_ratio = 0.0
        train_ratio = remaining
    else:
        val_ratio = remaining / requested_folds
        train_ratio = remaining - val_ratio

    return {
        "requested": {
            "train_ratio": _safe_float(train_split, 0.7),
            "val_ratio": _safe_float(val_split, 0.15),
            "test_ratio": _safe_float(test_split, 0.15),
            "k_folds": int(n_folds or 1),
        },
        "resolved": {
            "train_ratio": round(train_ratio, 6),
            "val_ratio": round(val_ratio, 6),
            "test_ratio": round(test_ratio, 6),
            "k_folds": requested_folds,
        },
    }


def _extract_session_names(df: pd.DataFrame, table_name: str):
    session_names = set()
    if 'metadata_json' in df.columns:
        for raw in df['metadata_json'].fillna(''):
            if not raw:
                continue
            try:
                parsed = json.loads(raw)
            except Exception:
                continue
            session_name = parsed.get('session_name') or parsed.get('sessionName')
            if session_name:
                session_names.add(str(session_name))
    if table_name and table_name != 'ALL':
        session_names.add(str(table_name))
    return sorted(session_names)


def _prepare_dataframe(sensor: str, table_name: str):
    df = _load_table(sensor, table_name)
    if df.empty:
        return df

    feature_cols = get_feature_cols(sensor)
    for column in feature_cols:
        if column not in df.columns:
            df[column] = 0.0
    df['label'] = df['label'].apply(lambda value: _normalize_label(sensor, value))

    return df


def _split_train_and_test(df: pd.DataFrame, test_ratio: float):
    indices = np.arange(len(df))
    if 'batch_id' in df.columns and df['batch_id'].notna().any():
        # Build a group->label mapping using each batch's most common label.
        # Then use StratifiedShuffleSplit on the *groups* so that every class is
        # proportionally represented in the test set (fixes the imbalance caused
        # by plain GroupShuffleSplit which splits groups at random).
        filled = df['batch_id'].fillna('unknown_batch')
        group_labels = (
            df.assign(_group=filled)
            .groupby('_group')['label']
            .agg(lambda x: x.mode()[0])
        )
        group_ids = group_labels.index.to_numpy()
        group_label_values = group_labels.values

        n_classes = len(np.unique(group_label_values))
        min_per_class = int(np.min(np.bincount(
            np.searchsorted(np.unique(group_label_values), group_label_values)
        )))
        # StratifiedShuffleSplit needs at least 2 members per class in both
        # train and test splits; fall back to plain GroupShuffleSplit when the
        # data is too sparse.
        n_test_groups = max(1, int(round(test_ratio * len(group_ids))))
        n_train_groups = len(group_ids) - n_test_groups
        can_stratify = (n_classes > 1
                        and min_per_class >= 2
                        and n_test_groups >= n_classes
                        and n_train_groups >= n_classes)
        if can_stratify:
            sss = StratifiedShuffleSplit(n_splits=1, test_size=test_ratio, random_state=42)
            g_train_idx, g_test_idx = next(sss.split(group_ids, group_label_values))
            train_groups = set(group_ids[g_train_idx])
            test_groups = set(group_ids[g_test_idx])
        else:
            gss = GroupShuffleSplit(n_splits=1, test_size=test_ratio, random_state=42)
            train_idx, test_idx = next(gss.split(df, groups=filled))
            return df.iloc[train_idx].copy(), df.iloc[test_idx].copy()

        train_mask = filled.isin(train_groups)
        test_mask = filled.isin(test_groups)
        return df[train_mask].copy(), df[test_mask].copy()
    else:
        stratify = df['label'] if df['label'].nunique() > 1 else None
        train_idx, test_idx = train_test_split(
            indices,
            test_size=test_ratio,
            random_state=42,
            shuffle=True,
            stratify=stratify,
        )
    return df.iloc[train_idx].copy(), df.iloc[test_idx].copy()


def _build_folds(train_df: pd.DataFrame, resolved_folds: int):
    if resolved_folds <= 1:
        all_indices = np.arange(len(train_df))
        return [(all_indices, np.array([], dtype=int))]
    row_indices = np.arange(len(train_df))
    folds = []
    
    if 'batch_id' in train_df.columns and train_df['batch_id'].notna().any():
        groups = train_df['batch_id'].fillna('unknown_batch')
        n_groups = train_df['batch_id'].nunique()
        actual_folds = min(resolved_folds, n_groups) if n_groups > 1 else 1
        
        if actual_folds > 1:
            gkf = GroupKFold(n_splits=actual_folds)
            for train_idx, val_idx in gkf.split(train_df, groups=groups):
                folds.append((train_idx, val_idx))
            return folds

    # Fallback if no batch_id or not enough groups
    stratify = train_df['label'] if train_df['label'].nunique() > 1 else None
    for fold_seed in range(resolved_folds):
        train_idx, val_idx = train_test_split(
            row_indices,
            test_size=1 / resolved_folds,
            random_state=42 + fold_seed,
            shuffle=True,
            stratify=stratify,
        )
        folds.append((train_idx, val_idx))
    return folds


def _hyperparameters_for_response(sensor: str, params: dict, resolved_split: dict):
    selected = dict(params)
    selected.update(resolved_split)
    return {
        "sensor": sensor,
        "selected_hyperparameters": selected,
        **resolved_split,
        "random_state": 42,
    }


def _resolution_count(params: dict) -> int:
    try:
        return max(1, int(params.get("search_resolution", 1) or 1))
    except Exception:
        return 1


def _coalesce_param(params: dict, *keys, default=None):
    for key in keys:
        value = params.get(key)
        if value is not None:
            return value
    return default


def _candidate_values(min_value, max_value, resolution: int, value_type: str):
    if min_value is None and max_value is None:
        return [None] if value_type == "optional_int" else [0.0]
    if max_value is None:
        max_value = min_value
    if min_value is None:
        min_value = max_value
    if resolution <= 1 or float(min_value) == float(max_value):
        raw_values = [min_value]
    else:
        raw_values = np.linspace(float(min_value), float(max_value), num=resolution).tolist()

    values = []
    for raw in raw_values:
        if value_type == "int":
            casted = int(round(float(raw)))
        elif value_type == "optional_int":
            casted = None if raw is None else int(round(float(raw)))
        else:
            casted = float(raw)
        if casted not in values:
            values.append(casted)
    return values


def _xgb_candidate_grid(params: dict):
    resolution = _resolution_count(params)
    n_estimators_values = _candidate_values(
        _coalesce_param(params, "n_estimators_min", "n_estimators", default=100),
        _coalesce_param(params, "n_estimators_max", "n_estimators", default=100),
        resolution,
        "int",
    )
    max_depth_values = _candidate_values(
        _coalesce_param(params, "max_depth_min", "max_depth", default=6),
        _coalesce_param(params, "max_depth_max", "max_depth", default=6),
        resolution,
        "int",
    )
    learning_rate_values = _candidate_values(
        _coalesce_param(params, "learning_rate_min", "learning_rate", default=0.1),
        _coalesce_param(params, "learning_rate_max", "learning_rate", default=0.1),
        resolution,
        "float",
    )
    gamma_values = _candidate_values(
        _coalesce_param(params, "gamma_min", "gamma", default=0.0),
        _coalesce_param(params, "gamma_max", "gamma", default=0.0),
        resolution,
        "float",
    )
    candidates = []
    subsample = float(_coalesce_param(params, "subsample", default=0.8))
    colsample_bytree = float(_coalesce_param(params, "colsample_bytree", default=0.8))
    for n_estimators, max_depth, learning_rate, gamma in product(n_estimators_values, max_depth_values, learning_rate_values, gamma_values):
        candidates.append({
            "n_estimators": int(n_estimators),
            "max_depth": int(max_depth),
            "learning_rate": float(learning_rate),
            "gamma": float(gamma),
            "subsample": subsample,
            "colsample_bytree": colsample_bytree,
            "search_resolution": resolution,
        })
    return candidates


def _artifact_path_for_ui(path: Path):
    try:
        return str(path.resolve())
    except Exception:
        return str(path)


def _training_history_item(candidate_index: int, fold_index: int, model_id: str, artifact_paths: dict, hyperparameters: dict,
                           train_accuracy: float, validation_accuracy: float, n_train_samples: int, n_validation_samples: int):
    return {
        "id": model_id,
        "model_id": model_id,
        "candidate_index": candidate_index,
        "candidate_idx": candidate_index,
        "fold_index": fold_index,
        "fold_idx": fold_index,
        "train_accuracy": train_accuracy,
        "validation_accuracy": validation_accuracy,
        "accuracy": validation_accuracy,
        "n_train_samples": n_train_samples,
        "n_validation_samples": n_validation_samples,
        "hyperparameters": hyperparameters,
        "artifact_path": _artifact_path_for_ui(artifact_paths["model"]),
        "created_at": datetime.now().isoformat(),
    }


def _save_json(path: Path, payload: dict):
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _build_result_payload(sensor: str, model_name: str, metadata: dict, evaluation_table: str | None = None, live_metrics: dict | None = None):
    payload = {
        "status": "success",
        "sensor": sensor,
        "model_name": model_name,
        "model_id": metadata.get("model_id", model_name),
        "best_fold_id": metadata.get("best_fold_id"),
        "candidate_index": metadata.get("candidate_index"),
        "fold_index": metadata.get("fold_index"),
        "classifier": metadata.get("classifier"),
        "session_name": metadata.get("session_name"),
        "session_names": metadata.get("session_names", []),
        "n_samples": metadata.get("n_samples"),
        "train_accuracy": metadata.get("train_accuracy"),
        "validation_accuracy": metadata.get("validation_accuracy"),
        "test_accuracy": metadata.get("test_accuracy", metadata.get("accuracy")),
        "accuracy": metadata.get("test_accuracy", metadata.get("accuracy")),
        "mean_accuracy": metadata.get("mean_accuracy"),
        "cv_mean": metadata.get("mean_accuracy"),
        "fold_std": metadata.get("fold_std"),
        "cv_std": metadata.get("fold_std"),
        "fold_min": metadata.get("fold_min"),
        "cv_min": metadata.get("fold_min"),
        "split_summary": metadata.get("split_summary", {}),
        "train_ratio": metadata.get("train_ratio"),
        "val_ratio": metadata.get("val_ratio"),
        "test_ratio": metadata.get("test_ratio"),
        "k_folds": metadata.get("k_folds"),
        "resolved_split": metadata.get("resolved_split", {}),
        "training_history": metadata.get("training_history", []),
        "hyperparameters": metadata.get("hyperparameters", {}),
        "group_counts": metadata.get("group_counts", {}),
        "confusion_matrix": metadata.get("confusion_matrix", []),
        "labels": metadata.get("labels", []),
        "feature_importances": metadata.get("feature_importances", {}),
        "feature_order": metadata.get("feature_order", []),
        "tree_structure": metadata.get("tree_structure"),
        "visualization": metadata.get("visualization"),
        "artifact_path": metadata.get("artifact_path"),
        "created_at": metadata.get("created_at"),
        "table_name": metadata.get("table_name"),
    }
    if evaluation_table:
        payload["evaluation_table"] = evaluation_table
    if live_metrics:
        payload.update(live_metrics)
    return payload


def _fit_xgboost(sensor: str, train_df: pd.DataFrame, test_df: pd.DataFrame, feature_cols: list[str], params: dict, table_name: str, model_name: str, progress_callback=None):
    # XGBoost requires contiguous 0-based class labels ([0,1,2], not [0,1,3]).
    # Remap if the actual labels in the data are non-contiguous (e.g. a class was
    # deleted from the DB after recording, leaving a gap).
    _all_y = np.concatenate([train_df['label'].astype(int).values, test_df['label'].astype(int).values])
    _unique = sorted(set(_all_y))
    if _unique != list(range(len(_unique))):
        _remap = {orig: enc for enc, orig in enumerate(_unique)}
        train_df = train_df.copy()
        test_df = test_df.copy()
        train_df['label'] = train_df['label'].astype(int).map(_remap)
        test_df['label'] = test_df['label'].astype(int).map(_remap)

    split_cfg = _resolve_split_configuration(params.get('train_split', 0.7), params.get('val_split', 0.15), params.get('test_split', 0.15), params.get('n_folds', 2))
    resolved_split = split_cfg["resolved"]
    candidates = _xgb_candidate_grid(params)
    folds = _build_folds(train_df, resolved_split["k_folds"])
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

    # Pre-compute scaled fold data ONCE per fold, shared across all candidates.
    # This eliminates (n_candidates - 1) * n_folds redundant StandardScaler fits.
    _has_batch = 'batch_id' in train_df.columns and train_df['batch_id'].notna().any()
    fold_cache = []
    for _fn, (train_idx, val_idx) in enumerate(folds, start=1):
        _fold_train = train_df.iloc[train_idx]
        _scaler = StandardScaler()
        _x_train = _scaler.fit_transform(_fold_train[feature_cols].fillna(0.0))
        _y_train = _fold_train['label'].astype(int).values
        if len(val_idx) > 0:
            _fold_val = train_df.iloc[val_idx]
            _x_val = _scaler.transform(_fold_val[feature_cols].fillna(0.0))
            _y_val = _fold_val['label'].astype(int).values
            _n_val = int(_fold_val['batch_id'].nunique()) if _has_batch else len(_fold_val)
        else:
            _x_val, _y_val = _x_train, _y_train
            _n_val = 0
        _n_train = int(_fold_train['batch_id'].nunique()) if _has_batch else len(_fold_train)
        fold_cache.append((_fn, _scaler, _x_train, _y_train, _x_val, _y_val, _n_train, _n_val))

    for candidate_index, candidate_params in enumerate(candidates):
        hyperparameters = _hyperparameters_for_response(sensor, candidate_params, resolved_split)
        for fold_number, scaler, x_train, y_train, x_val, y_val, n_train_batches, n_val_batches in fold_cache:
            model = xgb.XGBClassifier(
                n_estimators=int(candidate_params.get("n_estimators", 100)),
                max_depth=int(candidate_params.get("max_depth", 6)),
                learning_rate=float(candidate_params.get("learning_rate", 0.1)),
                gamma=float(candidate_params.get("gamma", 0.0)),
                subsample=float(candidate_params.get("subsample", 0.8)),
                colsample_bytree=float(candidate_params.get("colsample_bytree", 0.8)),
                objective='multi:softprob',
                tree_method='hist',
                eval_metric='mlogloss',
                importance_type=str(params.get('importance_type', 'gain')),
                n_jobs=-1,
                random_state=42,
            )
            model.fit(x_train, y_train)

            train_accuracy = accuracy_score(y_train, model.predict(x_train))
            val_accuracy = accuracy_score(y_val, model.predict(x_val))
            fold_model_id = generate_model_id(candidate_index, fold_number)
            rejected_paths = get_rejected_model_paths(sensor, fold_model_id)
            # compress=1: ~60% smaller files, measurably faster for large grids.
            joblib.dump(model, rejected_paths["model"], compress=1)
            joblib.dump(scaler, rejected_paths["scaler"], compress=1)
            history_item = _training_history_item(
                candidate_index,
                fold_number,
                fold_model_id,
                rejected_paths,
                hyperparameters["selected_hyperparameters"],
                float(train_accuracy),
                float(val_accuracy),
                n_train_batches,
                n_val_batches,
            )
            _save_json(rejected_paths["meta"], {
                **history_item,
                "sensor": sensor,
                "table_name": table_name,
            })
            history.append(history_item)
            completed_runs += 1
            if progress_callback:
                progress_callback({
                    "status": "running",
                    "progress": completed_runs / total_runs,
                    "candidate_index": candidate_index,
                    "total_candidates": total_candidates,
                    "fold_index": fold_number,
                    "total_folds": total_folds,
                    "history": list(history),
                    "latest_history_item": history_item,
                })
            if best is None or val_accuracy > best["validation_accuracy"]:
                best = {
                    "model": model,
                    "scaler": scaler,
                    "history_item": history_item,
                    "validation_accuracy": float(val_accuracy),
                    "train_accuracy": float(train_accuracy),
                    "hyperparameters": hyperparameters,
                }

    final_paths = get_model_paths(sensor, model_name)
    joblib.dump(best["model"], final_paths["model"])
    joblib.dump(best["scaler"], final_paths["scaler"])

    x_test = best["scaler"].transform(test_df[feature_cols].fillna(0.0))
    y_test = test_df['label'].astype(int)
    y_pred = best["model"].predict(x_test)
    test_accuracy = float(accuracy_score(y_test, y_pred))
    # Use the encoded 0-based label range that _unique was remapped to.
    # Using LABELS_MAP[sensor] here would incorrectly map remapped indices back
    # to their original slot names (e.g. Scissors remapped to index 2 would
    # appear as "Paper" in the matrix).  _unique holds the original values in
    # the order they were encoded so display names resolve correctly.
    _enc_labels = list(range(len(_unique)))
    confusion = confusion_matrix(y_test, y_pred, labels=_enc_labels).tolist()
    feature_importances = dict(zip(feature_cols, best["model"].feature_importances_.tolist()))

    all_df = pd.concat([train_df, test_df], axis=0)
    has_batch = 'batch_id' in all_df.columns and all_df['batch_id'].notna().any()
    n_samples_total = int(all_df['batch_id'].nunique()) if has_batch else int(len(all_df))
    n_train_samples = int(train_df['batch_id'].nunique()) if has_batch else int(len(train_df))
    n_test_samples = int(test_df['batch_id'].nunique()) if has_batch else int(len(test_df))

    metadata = {
        "sensor": sensor,
        "model_name": model_name,
        "model_id": model_name,
        "best_fold_id": best["history_item"]["model_id"],
        "candidate_index": best["history_item"]["candidate_index"],
        "fold_index": best["history_item"]["fold_index"],
        "classifier": "XGBoost",
        "session_name": _extract_session_names(all_df, table_name)[0] if _extract_session_names(all_df, table_name) else table_name,
        "session_names": _extract_session_names(all_df, table_name),
        "n_samples": n_samples_total,
        "train_accuracy": best["train_accuracy"],
        "validation_accuracy": best["validation_accuracy"],
        "test_accuracy": test_accuracy,
        "accuracy": test_accuracy,
        "mean_accuracy": float(np.mean([item["validation_accuracy"] for item in history])) if history else best["validation_accuracy"],
        "fold_std": float(np.std([item["validation_accuracy"] for item in history])) if history else 0.0,
        "fold_min": float(min(item["validation_accuracy"] for item in history)) if history else best["validation_accuracy"],
        "split_summary": {
            "total_samples": n_samples_total,
            "train_samples": int(round((resolved_split["k_folds"] - 1) * n_train_samples / resolved_split["k_folds"])) if len(history) > 1 else history[0]["n_train_samples"],
            "val_samples": int(round(n_train_samples / resolved_split["k_folds"])) if len(history) > 1 else history[0]["n_validation_samples"],
            "test_samples": n_test_samples,
        },
        "train_ratio": resolved_split["train_ratio"],
        "val_ratio": resolved_split["val_ratio"],
        "test_ratio": resolved_split["test_ratio"],
        "k_folds": resolved_split["k_folds"],
        "resolved_split": resolved_split,
        "training_history": history,
        "hyperparameters": best["hyperparameters"],
        "group_counts": {},
        "confusion_matrix": confusion,
        "labels": [DISPLAY_LABELS[sensor].get(orig, str(orig)) for orig in _unique],
        "feature_importances": feature_importances,
        "feature_order": feature_cols,
        "tree_structure": tree_to_json(best["model"], feature_cols, 0),
        "artifact_path": _artifact_path_for_ui(final_paths["model"]),
        "created_at": datetime.now().isoformat(),
        "table_name": table_name,
    }
    _save_json(final_paths["meta"], metadata)

    load_model(sensor, model_name)
    if progress_callback:
        progress_callback({
            "status": "finalizing",
            "progress": 1.0,
            "candidate_index": best["history_item"]["candidate_index"],
            "total_candidates": total_candidates,
            "fold_index": best["history_item"]["fold_index"],
            "total_folds": total_folds,
            "history": list(history),
            "latest_history_item": best["history_item"],
            "result": _build_result_payload(sensor, model_name, metadata),
        })
    return _build_result_payload(sensor, model_name, metadata)


def train_model(sensor, n_estimators=100, max_depth=6, learning_rate=0.1, gamma=0.0, subsample=0.8, colsample_bytree=0.8, train_split=0.7, val_split=0.15, test_split=0.15, n_folds=2, table_name=None, model_name=None, progress_callback=None, **search_params):
    sensor = sensor.upper()
    table_name = table_name or f"{sensor.lower()}_windows"
    model_name = model_name or generate_model_id(0, 0)
    df = _prepare_dataframe(sensor, table_name)
    if df.empty:
        return {"error": "Database table is empty."}

    feature_cols = get_feature_cols(sensor)
    train_df, test_df = _split_train_and_test(df, min(max(float(test_split), 0.05), 0.5))
    if train_df.empty or test_df.empty:
        return {"error": "Unable to produce non-empty train/test partitions."}

    return _fit_xgboost(sensor, train_df, test_df, feature_cols, {
        "n_estimators": n_estimators,
        "max_depth": max_depth,
        "learning_rate": learning_rate,
        "gamma": gamma,
        "subsample": subsample,
        "colsample_bytree": colsample_bytree,
        "train_split": train_split,
        "val_split": val_split,
        "test_split": test_split,
        "n_folds": n_folds,
        **search_params,
    }, table_name, model_name, progress_callback=progress_callback)


def train_emg_model(**kwargs):
    return train_model('EMG', **kwargs)


def train_eog_model(**kwargs):
    return train_model('EOG', **kwargs)


def train_eeg_model(**kwargs):
    return train_model('EEG', **kwargs)


def _read_metadata(sensor: str, model_name: str):
    paths = get_model_paths(sensor, model_name)
    if not paths["meta"].exists():
        return {}
    try:
        return json.loads(paths["meta"].read_text(encoding="utf-8"))
    except Exception:
        return {}


def list_saved_models(sensor='EMG'):
    sensor = sensor.upper()
    sensor_dir = MODELS_ROOT / sensor / "models"
    from src.utils.config import config_manager
    active_name = config_manager.get_active_model(sensor)
    if not sensor_dir.exists():
        return []
    models = []
    for path in sensor_dir.glob("*.joblib"):
        if path.name.endswith("_scaler.joblib"):
            continue
        name = path.stem
        meta = _read_metadata(sensor, name)
        history = meta.get("training_history", []) or []
        latest_history_item = history[-1] if history else {}
        best_fold_id = meta.get("best_fold_id") or latest_history_item.get("model_id") or latest_history_item.get("id")
        models.append({
            "name": name,
            "model_id": best_fold_id or meta.get("model_id") or name,
            "best_fold_id": best_fold_id,
            "candidate_index": meta.get("candidate_index", latest_history_item.get("candidate_index")),
            "fold_index": meta.get("fold_index", latest_history_item.get("fold_index")),
            "candidate_idx": meta.get("candidate_index", latest_history_item.get("candidate_index")),
            "fold_idx": meta.get("fold_index", latest_history_item.get("fold_index")),
            "accuracy": meta.get("accuracy", meta.get("test_accuracy")),
            "created_at": meta.get("created_at"),
            "active": name == active_name,
            "session_name": meta.get("session_name"),
            "n_samples": meta.get("n_samples"),
        })
    return sorted(models, key=lambda item: item.get("created_at") or "", reverse=True)


def delete_model(sensor, model_name):
    paths = get_model_paths(sensor, model_name)
    deleted = []
    for path in paths.values():
        if path.exists():
            os.remove(path)
            deleted.append(str(path))
    return {"status": "success", "deleted": deleted}


def load_model(sensor, model_name):
    sensor = sensor.upper()
    paths = get_model_paths(sensor, model_name)
    if not paths["model"].exists():
        return {"error": f"Model {model_name} not found"}
    ACTIVE_MODELS[sensor] = joblib.load(paths["model"])
    ACTIVE_SCALERS[sensor] = joblib.load(paths["scaler"])
    ACTIVE_MODEL_NAMES[sensor] = model_name
    from src.utils.config import config_manager
    config_manager.set_active_model(sensor, model_name)
    metadata = _read_metadata(sensor, model_name)
    payload = _build_result_payload(sensor, model_name, metadata)
    payload["status"] = "success"
    payload["loaded"] = True
    return payload


def evaluate_saved_model(sensor='EMG', table_name=None, model_name=None):
    sensor = sensor.upper()
    model_name = model_name or ACTIVE_MODEL_NAMES[sensor]
    if not model_name:
        return {"error": "No active model"}
    table_name = table_name or f"{sensor.lower()}_windows"
    paths = get_model_paths(sensor, model_name)
    if not paths["model"].exists():
        return {"error": f"Model {model_name} not found"}

    model = joblib.load(paths["model"])
    scaler = joblib.load(paths["scaler"])
    metadata = _read_metadata(sensor, model_name)
    df = _prepare_dataframe(sensor, table_name)
    if df.empty:
        return {"error": "Evaluation table is empty."}
    feature_cols = metadata.get("feature_order") or get_feature_cols(sensor)
    x_eval = scaler.transform(df[feature_cols].fillna(0.0))
    y_eval = df['label'].astype(int)
    # Apply the same remap used during training so the model's 0-based encoded
    # predictions align with the eval labels.
    _eval_unique = sorted(set(y_eval.values))
    if _eval_unique != list(range(len(_eval_unique))):
        _eval_remap = {orig: enc for enc, orig in enumerate(_eval_unique)}
        y_eval = y_eval.map(_eval_remap)
    _eval_enc_labels = list(range(len(_eval_unique)))
    y_pred = model.predict(x_eval)
    accuracy = float(accuracy_score(y_eval, y_pred))
    live_metrics = {
        "accuracy": accuracy,
        "test_accuracy": accuracy,
        "confusion_matrix": confusion_matrix(y_eval, y_pred, labels=_eval_enc_labels).tolist(),
        "labels": [DISPLAY_LABELS[sensor].get(orig, str(orig)) for orig in _eval_unique],
        "n_samples": int(len(df)),
    }
    return _build_result_payload(sensor, model_name, metadata, evaluation_table=table_name, live_metrics=live_metrics)


def get_model_tree_structure(sensor='EMG', model_name=None, tree_index=0):
    sensor = sensor.upper()
    name = model_name or ACTIVE_MODEL_NAMES[sensor]
    if not name:
        return {"error": "No model loaded"}
    paths = get_model_paths(sensor, name)
    if not paths["model"].exists():
        return {"error": f"Model {name} not found"}
    model = joblib.load(paths["model"])
    feature_cols = _read_metadata(sensor, name).get("feature_order") or get_feature_cols(sensor)
    has_xgb = hasattr(model, 'get_booster')
    has_rf = hasattr(model, 'estimators_')
    if not has_xgb and not has_rf:
        return {"error": "Tree structure is not available for this model type"}
    if has_xgb:
        total_trees = len(model.get_booster().get_dump())
    else:
        total_trees = len(model.estimators_)
    tree_index = max(0, min(int(tree_index), total_trees - 1))
    return {
        "status": "success",
        "tree_index": tree_index,
        "total_trees": total_trees,
        "tree_structure": tree_to_json(model, feature_cols, tree_index)
    }
