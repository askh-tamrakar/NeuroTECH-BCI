import pandas as pd
import numpy as np
import joblib
import json
import os
import random
from datetime import datetime
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import GroupKFold, train_test_split
from sklearn.metrics import accuracy_score, confusion_matrix
import sys

# Standard Labels for EOG (0=Rest, 1=SingleBlink, 2=DoubleBlink)
STANDARD_LABELS = [0, 1, 2]

# Project root for imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from src.learning.tree_utils import tree_to_json
from src.database.db_manager import db_manager
from src.learning.emg_trainer import DISPLAY_LABELS, LABELS_MAP, get_model_paths, get_rejected_model_paths, generate_hex_id
from src.utils.config import config_manager

EOG_FEATURES = [
    'amplitude', 'duration_ms', 'rise_time_ms', 'fall_time_ms',
    'asymmetry', 'peak_count', 'kurtosis', 'skewness'
]

def train_eog_model(n_estimators=100, max_depth=None, min_impurity_decrease=0.0, 
                   train_split=0.7, val_split=0.15, test_split=0.15, n_folds=1,
                   table_name="eog_windows", model_name=None):
    conn = db_manager.connect('EOG')
    try:
        df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    except Exception as e:
        conn.close()
        return {"error": str(e)}
    conn.close()

    if df.empty: return {"error": "EOG Database is empty."}
    
    # Check features
    for col in EOG_FEATURES:
        if col not in df.columns: df[col] = 0.0
    
    X = df[EOG_FEATURES]
    y = df['label']
    groups = df['serial_id'] if 'serial_id' in df.columns else pd.Series(range(len(df)))

    # 1. Split Serial IDs into [Train+Val] and [Test]
    unique_ids = groups.unique()
    if len(unique_ids) < 3:
        train_val_idx, test_idx = train_test_split(np.arange(len(y)), test_size=test_split, stratify=y, random_state=42)
    else:
        tv_ids, test_ids = train_test_split(unique_ids, test_size=test_split, random_state=42)
        train_val_idx = df[groups.isin(tv_ids)].index
        test_idx = df[groups.isin(test_ids)].index

    X_tv, y_tv, grp_tv = X.iloc[train_val_idx], y.iloc[train_val_idx], groups.iloc[train_val_idx]
    X_test, y_test = X.iloc[test_idx], y.iloc[test_idx]

    candidate_base = random.randint(0x100, 0xFFF)
    fold_results = []

    if n_folds > 1 and len(grp_tv.unique()) >= n_folds:
        gkf = GroupKFold(n_splits=n_folds)
        folds = list(gkf.split(X_tv, y_tv, groups=grp_tv))
    else:
        # Single fold (Trial-Aware)
        n_folds = 1
        unique_trials_tv = grp_tv.unique()
        if len(unique_trials_tv) >= 2:
            tr_t, val_t = train_test_split(unique_trials_tv, test_size=val_split/(train_split+val_split), random_state=42)
            tr_idx = grp_tv[grp_tv.isin(tr_t)].index
            val_idx = grp_tv[grp_tv.isin(val_t)].index
            folds = [(tr_idx, val_idx)]
        else:
            # Row-wise fallback
            tr_idx, val_idx = train_test_split(np.arange(len(y_tv)), test_size=val_split/(train_split+val_split), random_state=42)
            folds = [(tr_idx, val_idx)]
        

    best_acc, best_data = -1, None
    for f_idx, (t_idx, v_idx) in enumerate(folds):
        X_f_t, X_f_v = X_tv.iloc[t_idx], X_tv.iloc[v_idx]
        y_f_t, y_f_v = y_tv.iloc[t_idx], y_tv.iloc[v_idx]

        scaler = StandardScaler()
        X_f_t_s = scaler.fit_transform(X_f_t)
        X_f_v_s = scaler.transform(X_f_v)

        rf = RandomForestClassifier(n_estimators=n_estimators, max_depth=max_depth, min_impurity_decrease=min_impurity_decrease, random_state=42)
        rf.fit(X_f_t_s, y_f_t)

        acc = accuracy_score(y_f_v, rf.predict(X_f_v_s))
        model_id = generate_hex_id(candidate_base, f_idx + 1)
        
        r_paths = get_rejected_model_paths("EOG", model_id)
        joblib.dump(rf, r_paths["model"])
        joblib.dump(scaler, r_paths["scaler"])
        with open(r_paths["meta"], 'w') as f_m: json.dump({"accuracy": acc, "fold": f_idx+1, "candidate": f"{candidate_base:X}"}, f_m)
        
        fold_results.append({"fold": f_idx+1, "accuracy": acc, "model_id": model_id})
        if acc > best_acc: best_acc, best_data = acc, (rf, scaler, model_id)

    best_rf, best_s, best_id = best_data
    X_test_s = best_s.transform(X_test)
    y_test_pred = best_rf.predict(X_test_s)
    test_acc = accuracy_score(y_test, y_test_pred)

    final_id = model_name or generate_hex_id(candidate_base, 0)
    final_paths = get_model_paths("EOG", final_id)
    joblib.dump(best_rf, final_paths["model"])
    joblib.dump(best_s, final_paths["scaler"])
    with open(final_paths["meta"], 'w') as f_m: 
        json.dump({"accuracy": test_acc, "val_accuracy": best_acc, "folds": fold_results, "id": final_id, "created_at": datetime.now().isoformat()}, f_m)

    config_manager.set_active_model("EOG", final_id)
    std_labels = LABELS_MAP["EOG"]
    cm = confusion_matrix(y_test, y_test_pred, labels=std_labels).tolist()

    return {
        "status": "success", "sensor": "EOG", "accuracy": test_acc, "val_accuracy": best_acc,
        "confusion_matrix": cm, "labels": [DISPLAY_LABELS["EOG"].get(i, str(i)) for i in std_labels],
        "model_id": final_id, "best_fold_id": best_id, "folds": fold_results,
        "feature_importances": dict(zip(EOG_FEATURES, best_rf.feature_importances_.tolist())),
        "tree_structure": tree_to_json(best_rf.estimators_[0], EOG_FEATURES)
    }

def evaluate_saved_eog_model(table_name="eog_windows", model_name=None):
    model_name = model_name or config_manager.get_active_model("EOG")
    if not model_name: return {"error": "No EOG model active."}
    paths = get_model_paths("EOG", model_name)
    model = joblib.load(paths["model"])
    scaler = joblib.load(paths["scaler"])
    conn = db_manager.connect("EOG")
    try: df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    finally: conn.close()
    X = df[EOG_FEATURES].fillna(0.0)
    y = df["label"].astype(int)
    X_eval = scaler.transform(X)
    y_pred = model.predict(X_eval)
    acc = accuracy_score(y, y_pred)
    std_labels = LABELS_MAP["EOG"]
    cm = confusion_matrix(y, y_pred, labels=std_labels).tolist()
    return {
        "status": "success", "accuracy": acc, "confusion_matrix": cm,
        "labels": [str(DISPLAY_LABELS["EOG"].get(i, i)) for i in std_labels]
    }

def list_saved_models():
    """Alias for emg_trainer.list_saved_models('EOG')"""
    from src.learning.emg_trainer import list_saved_models as lsm
    return lsm('EOG')

def delete_model(model_name):
    """Alias for emg_trainer.delete_model('EOG', model_name)"""
    from src.learning.emg_trainer import delete_model as dm
    return dm('EOG', model_name)

def load_model(model_name):
    """Alias for emg_trainer.load_model('EOG', model_name)"""
    from src.learning.emg_trainer import load_model as lm
    return lm('EOG', model_name)
