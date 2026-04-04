import pandas as pd
import numpy as np
import sqlite3
import joblib
import json
import os
import time
import random
from datetime import datetime
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import GroupKFold, train_test_split
from sklearn.metrics import accuracy_score, confusion_matrix
import sys

# Standard Labels for Confusion Matrix alignment (Indices)
LABELS_MAP = {
    'EMG': [0, 1, 2, 3],
    'EOG': [0, 1, 2],
    'EEG': [0, 1, 2, 3, 4, 5, 6]
}

DISPLAY_LABELS = {
    'EMG': {0: 'Rest', 1: 'Rock', 2: 'Paper', 3: 'Scissors'},
    'EOG': {0: 'Rest', 1: 'SingleBlink', 2: 'DoubleBlink'},
    'EEG': {0: 'Rest', 1: 'T1', 2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6'}
}

# Project root for imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from src.learning.tree_utils import tree_to_json
from src.database.db_manager import db_manager
from src.feature.extractors.rps_extractor import EMG_FEATURE_COLUMNS
from src.utils.paths import get_base_data_dir

MODELS_ROOT = get_base_data_dir()
REJECTED_MODELS_ROOT = MODELS_ROOT / "rejected_models"

# Active model state
ACTIVE_MODELS = {'EMG': None, 'EOG': None, 'EEG': None}
ACTIVE_SCALERS = {'EMG': None, 'EOG': None, 'EEG': None}
ACTIVE_MODEL_NAMES = {'EMG': None, 'EOG': None, 'EEG': None}

def get_feature_cols(sensor):
    sensor = sensor.upper()
    if sensor == 'EMG': return list(EMG_FEATURE_COLUMNS)
    if sensor == 'EOG': return ['duration_ms', 'max_amplitude', 'min_amplitude', 'peak_to_peak', 'variance', 'kurtosis', 'skewness', 'entropy', 'activity_sum']
    if sensor == 'EEG': return ['score_1', 'score_2', 'score_3', 'score_4', 'score_5', 'score_6', 'max_score', 'second_max_score', 'score_ratio', 'score_mean', 'score_std', 'dominant_freq', 'peak_freq', 'target_frequency']
    return []

def get_model_paths(sensor, model_id):
    sensor_dir = MODELS_ROOT / sensor.upper() / "models"
    sensor_dir.mkdir(parents=True, exist_ok=True)
    base = sensor_dir / model_id
    return {
        "model": base.with_suffix(".joblib"),
        "scaler": sensor_dir / f"{model_id}_scaler.joblib",
        "meta": sensor_dir / f"{model_id}_meta.json"
    }

def get_rejected_model_paths(sensor, model_id):
    rejected_dir = REJECTED_MODELS_ROOT / sensor.upper()
    rejected_dir.mkdir(parents=True, exist_ok=True)
    base = rejected_dir / model_id
    return {
        "model": base.with_suffix(".joblib"),
        "scaler": rejected_dir / f"{model_id}_scaler.joblib",
        "meta": rejected_dir / f"{model_id}_meta.json"
    }

def generate_hex_id(candidate_base=None, fold=None):
    """Generates a 5-digit hex Model ID: C[3D]F[1D] + check OR just random."""
    if candidate_base is None:
        candidate_base = random.randint(0x100, 0xFFF)
    if fold is None:
        return f"C{candidate_base:03X}0"
    return f"C{candidate_base:03X}{fold:X}"

def train_model(sensor, n_estimators=100, max_depth=None, min_impurity_decrease=0.0, 
                train_split=0.7, val_split=0.15, test_split=0.15, n_folds=1,
                table_name=None, model_name=None):
    sensor = sensor.upper()
    table_name = table_name or f"{sensor.lower()}_windows"
    
    conn = db_manager.connect(sensor)
    try:
        df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    except Exception as e:
        conn.close()
        return {"error": str(e)}
    conn.close()

    if df.empty: return {"error": "Database table is empty."}

    # Identify Trial column (trial for EMG/EEG, serial_id for EOG)
    trial_col = 'trial' if sensor in ['EMG', 'EEG'] else 'serial_id'
    if trial_col not in df.columns:
        df[trial_col] = 'default_trial'

    feature_cols = get_feature_cols(sensor)
    for c in feature_cols:
        if c not in df.columns: df[c] = 0.0
    
    X = df[feature_cols]
    y = df['label']
    groups = df[trial_col]

    # 1. Split Trials into [Train+Val] and [Test]
    unique_trials = groups.unique()
    if len(unique_trials) < 3:
        # Fallback to row-wise if trials are insufficient
        train_val_idx, test_idx = train_test_split(np.arange(len(y)), test_size=test_split, stratify=y if len(y.unique()) > 1 else None, random_state=42)
    else:
        train_val_trials, test_trials = train_test_split(unique_trials, test_size=test_split, random_state=42)
        train_val_idx = df[df[trial_col].isin(train_val_trials)].index
        test_idx = df[df[trial_col].isin(test_trials)].index

    X_train_val, X_test = X.iloc[train_val_idx], X.iloc[test_idx]
    y_train_val, y_test = y.iloc[train_val_idx], y.iloc[test_idx]
    groups_train_val = groups.iloc[train_val_idx]

    candidate_base = random.randint(0x100, 0xFFF)
    fold_results = []
    
    # 2. Iterate Folds
    if n_folds > 1 and len(groups_train_val.unique()) >= n_folds:
        gkf = GroupKFold(n_splits=n_folds)
        folds = list(gkf.split(X_train_val, y_train_val, groups=groups_train_val))
    else:
        # Single fold (Trial-Aware Split)
        n_folds = 1
        unique_tv_trials = groups_train_val.unique()
        if len(unique_tv_trials) >= 2:
            train_t, val_t = train_test_split(unique_tv_trials, test_size=val_split/(train_split+val_split), random_state=42)
            train_idx = groups_train_val[groups_train_val.isin(train_t)].index
            val_idx = groups_train_val[groups_train_val.isin(val_t)].index
            folds = [(train_idx, val_idx)]
        else:
            # Absolute fallback (row-wise)
            train_idx, val_idx = train_test_split(np.arange(len(y_train_val)), test_size=val_split/(train_split+val_split), random_state=42)
            folds = [(train_idx, val_idx)]

    best_acc = -1
    best_model_data = None
    
    for f_idx, (train_idx, val_idx) in enumerate(folds):
        X_f_train, X_f_val = X_train_val.iloc[train_idx], X_train_val.iloc[val_idx]
        y_f_train, y_f_val = y_train_val.iloc[train_idx], y_train_val.iloc[val_idx]

        scaler = StandardScaler()
        X_f_train_scaled = scaler.fit_transform(X_f_train)
        X_f_val_scaled = scaler.transform(X_f_val)

        rf = RandomForestClassifier(n_estimators=n_estimators, max_depth=max_depth, min_impurity_decrease=min_impurity_decrease, random_state=42)
        rf.fit(X_f_train_scaled, y_f_train)

        y_f_pred = rf.predict(X_f_val_scaled)
        acc = accuracy_score(y_f_val, y_f_pred)
        
        # Hex ID for this fold
        model_id = generate_hex_id(candidate_base, f_idx + 1)
        
        # Save to rejected_models
        r_paths = get_rejected_model_paths(sensor, model_id)
        joblib.dump(rf, r_paths["model"])
        joblib.dump(scaler, r_paths["scaler"])
        with open(r_paths["meta"], 'w') as f_meta:
            json.dump({"sensor": sensor, "accuracy": acc, "fold": f_idx+1, "candidate": f"{candidate_base:X}", "created_at": datetime.now().isoformat()}, f_meta)

        fold_results.append({"fold": f_idx+1, "accuracy": acc, "model_id": model_id})
        
        if acc > best_acc:
            best_acc = acc
            best_model_data = (rf, scaler, model_id, acc)

    # 3. Final Eval on TEST set using the BEST model
    best_rf, best_scaler, best_id, _ = best_model_data
    X_test_scaled = best_scaler.transform(X_test)
    y_test_pred = best_rf.predict(X_test_scaled)
    test_acc = accuracy_score(y_test, y_test_pred)
    
    std_labels = LABELS_MAP.get(sensor, sorted(list(y.unique())))
    cm = confusion_matrix(y_test, y_test_pred, labels=std_labels).tolist()
    
    # 4. Save Final Best Model
    final_id = model_name or generate_hex_id(candidate_base, 0)
    final_paths = get_model_paths(sensor, final_id)
    joblib.dump(best_rf, final_paths["model"])
    joblib.dump(best_scaler, final_paths["scaler"])
    
    metadata = {
        "sensor": sensor,
        "model_id": final_id,
        "best_fold_id": best_id,
        "n_folds": n_folds,
        "train_samples": len(X_train_val),
        "test_samples": len(X_test),
        "accuracy": test_acc,
        "val_accuracy": best_acc,
        "folds": fold_results,
        "created_at": datetime.now().isoformat()
    }
    with open(final_paths["meta"], 'w') as f_meta: json.dump(metadata, f_meta)

    # Load into active state
    load_model(sensor, final_id)

    return {
        "status": "success",
        "sensor": sensor,
        "accuracy": test_acc,
        "val_accuracy": best_acc,
        "confusion_matrix": cm,
        "labels": [DISPLAY_LABELS.get(sensor, {}).get(i, str(i)) for i in std_labels],
        "feature_importances": dict(zip(feature_cols, best_rf.feature_importances_.tolist())),
        "tree_structure": tree_to_json(best_rf.estimators_[0], feature_cols),
        "model_id": final_id,
        "best_fold_id": best_id,
        "folds": fold_results
    }

def train_emg_model(**kwargs): return train_model('EMG', **kwargs)
def train_eog_model(**kwargs): return train_model('EOG', **kwargs)
def train_eeg_model(**kwargs): return train_model('EEG', **kwargs)

def list_saved_models(sensor='EMG'):
    sensor = sensor.upper()
    sensor_dir = MODELS_ROOT / sensor / "models"
    from src.utils.config import config_manager
    active_name = config_manager.get_active_model(sensor)
    if not sensor_dir.exists(): return []
    models = []
    for p in sensor_dir.glob("*.joblib"):
        if p.name.endswith("_scaler.joblib"): continue
        name = p.stem
        meta_path = sensor_dir / f"{name}_meta.json"
        meta = {}
        if meta_path.exists():
            try:
                with open(meta_path, 'r') as f: meta = json.load(f)
            except: pass
        models.append({
            "name": name, "accuracy": meta.get("accuracy"), "created_at": meta.get("created_at"), "active": (name == active_name)
        })
    return sorted(models, key=lambda x: x.get("created_at") or "", reverse=True)

def delete_model(sensor, model_name):
    paths = get_model_paths(sensor, model_name)
    deleted = []
    for p in paths.values():
        if p.exists(): os.remove(p); deleted.append(str(p))
    return {"status": "success", "deleted": deleted}

def load_model(sensor, model_name):
    sensor = sensor.upper()
    paths = get_model_paths(sensor, model_name)
    if not paths["model"].exists(): return {"error": f"Model {model_name} not found"}
    ACTIVE_MODELS[sensor] = joblib.load(paths["model"])
    ACTIVE_SCALERS[sensor] = joblib.load(paths["scaler"])
    ACTIVE_MODEL_NAMES[sensor] = model_name
    from src.utils.config import config_manager
    config_manager.set_active_model(sensor, model_name)
    return {"status": "success", "model_name": model_name}

def evaluate_saved_model(sensor='EMG', table_name=None, model_name=None):
    sensor = sensor.upper()
    model_name = model_name or ACTIVE_MODEL_NAMES[sensor]
    if not model_name: return {"error": "No active model"}
    paths = get_model_paths(sensor, model_name)
    model = joblib.load(paths["model"])
    scaler = joblib.load(paths["scaler"])
    
    table_name = table_name or f"{sensor.lower()}_windows"
    conn = db_manager.connect(sensor)
    df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    conn.close()
    
    feature_cols = get_feature_cols(sensor)
    X = df[feature_cols].fillna(0)
    y = df['label']
    X_scaled = scaler.transform(X)
    y_pred = model.predict(X_scaled)
    
    acc = accuracy_score(y, y_pred)
    std_labels = LABELS_MAP.get(sensor, sorted(list(y.unique())))
    cm = confusion_matrix(y, y_pred, labels=std_labels).tolist()
    
    return {
        "accuracy": acc, "confusion_matrix": cm,
        "labels": [str(DISPLAY_LABELS.get(sensor, {}).get(i, i)) for i in std_labels]
    }

def get_model_tree_structure(sensor='EMG', model_name=None, tree_index=0):
    sensor = sensor.upper()
    name = model_name or ACTIVE_MODEL_NAMES[sensor]
    paths = get_model_paths(sensor, name)
    model = joblib.load(paths["model"])
    return tree_to_json(model.estimators_[tree_index], get_feature_cols(sensor))
