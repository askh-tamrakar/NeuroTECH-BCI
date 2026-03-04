import pandas as pd
import numpy as np
import sqlite3
import joblib
import json
import os
import glob
from datetime import datetime
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, confusion_matrix
import sys

# Standard Labels for Confusion Matrix alignment (Indices)
# Standard Labels for Confusion Matrix alignment (Indices)
# 0=Rest, 1=Rock, 2=Paper, 3=Scissors (Assumed based on usage)
# For EOG: 0=DoubleBlink, 1=SingleBlink, 2=Rest (Inferred from Frontend)
LABELS_MAP = {
    'EMG': [0, 1, 2, 3],
    'EOG': [0, 1, 2],
    'EEG': [0, 1, 2] # Placeholder for EEG labels (e.g. Low, Med, High Focus)
}

DISPLAY_LABELS = {
    'EMG': {0: 'Rest', 1: 'Rock', 2: 'Paper', 3: 'Scissors'},
    'EOG': {0: 'DoubleBlink', 1: 'SingleBlink', 2: 'Rest'},
    'EEG': {0: 'Class 0', 1: 'Class 1', 2: 'Class 2'}
}

# Add project root to sys.path to allow imports from src
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

# Now we can import from src
from src.learning.tree_utils import tree_to_json
from src.database.db_manager import db_manager

# Paths
from src.utils.paths import get_base_data_dir
MODELS_ROOT = get_base_data_dir()

# Global State for Active Models (per sensor)
ACTIVE_MODELS = {
    'EMG': None,
    'EOG': None,
    'EEG': None
}
ACTIVE_SCALERS = {
    'EMG': None,
    'EOG': None,
    'EEG': None
}
ACTIVE_MODEL_NAMES = {
    'EMG': None,
    'EOG': None,
    'EEG': None
}

def get_feature_cols(sensor):
    sensor = sensor.upper()
    if sensor == 'EMG':
        return ['rms', 'mav', 'var', 'wl', 'peak', 'range', 'iemg', 'entropy', 'energy', 'kurtosis', 'skewness', 'ssc', 'wamp']
    elif sensor == 'EOG':
        # EOG features from BlinkExtractor
        return ['duration_ms', 'max_amplitude', 'min_amplitude', 'peak_to_peak', 'variance', 'kurtosis', 'skewness', 'entropy', 'activity_sum']
    elif sensor == 'EEG':
         # EEG features from EEGExtractor
         return ['bp_delta', 'bp_theta', 'bp_alpha', 'bp_beta', 'bp_gamma', 'rel_delta', 'rel_theta', 'rel_alpha', 'rel_beta', 'rel_gamma', 'mean', 'std', 'max', 'min']
    return []

def get_model_paths(sensor, model_name):
    """Returns dict of paths for a given model name."""
    clean_name = "".join([c for c in model_name if c.isalnum() or c in ('_', '-')])
    sensor_dir = MODELS_ROOT / sensor.upper() / "models"
    sensor_dir.mkdir(parents=True, exist_ok=True)
    
    base = sensor_dir / clean_name
    return {
        "model": base.with_suffix(".joblib"),
        "scaler": sensor_dir / f"{clean_name}_scaler.joblib",
        "meta": sensor_dir / f"{clean_name}_meta.json"
    }

def train_model(sensor, n_estimators=100, max_depth=None, min_impurity_decrease=0.0, test_size=0.2, table_name=None, model_name=None):
    """
    Generic training function for any sensor.
    """
    sensor = sensor.upper()

    if table_name == 'ALL':
        print(f"[{sensor}] Training on ALL available data (global table)...")
        table_name = f"{sensor.lower()}_windows"

    if not table_name:
        table_name = f"{sensor.lower()}_windows"
    if not model_name:
        model_name = f"{sensor.lower()}_rf"

    conn = db_manager.connect(sensor)
    df = pd.DataFrame()
    
    # Load data from DB
    try:
        # Basic validation
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
        if not cursor.fetchone():
            conn.close()
            return {"error": f"Table {table_name} not found"}

        df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    except Exception as e:
        conn.close()
        return {"error": f"Database read error from {table_name}: {str(e)}"}
    
    conn.close()


    if df.empty:
        return {"error": "Database is empty. Collect data first."}

    # Prepare Features and Labels
    feature_cols = get_feature_cols(sensor)
    
    # Check/Fix columns
    missing_cols = [c for c in feature_cols if c not in df.columns]
    if missing_cols:
         # Generic fix for 'range' if applicable
         if 'range' in missing_cols and 'rng' in df.columns:
             df.rename(columns={'rng': 'range'}, inplace=True)
         
         # Fill others with 0
         for col in missing_cols:
             if col not in df.columns:
                 df[col] = 0.0

    X = df[feature_cols]
    y = df['label']

    if len(y.unique()) < 2:
         return {"error": "Need at least 2 different classes to train (e.g. Rest vs Action)."}

    # Test/Train Split
    try:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, stratify=y, random_state=42)
    except ValueError:
        # Fallback if specific class has too few samples
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, random_state=42)

    # Scale Features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train Random Forest
    rf = RandomForestClassifier(
        n_estimators=n_estimators, 
        max_depth=max_depth, 
        min_impurity_decrease=min_impurity_decrease,
        random_state=42
    )
    rf.fit(X_train_scaled, y_train)

    # Evaluate
    y_pred = rf.predict(X_test_scaled)
    acc = accuracy_score(y_test, y_pred)
    
    std_labels = LABELS_MAP.get(sensor, list(sorted(y.unique())))
    cm = confusion_matrix(y_test, y_pred, labels=std_labels).tolist()
    
    # Feature Importance
    importances = dict(zip(feature_cols, rf.feature_importances_.tolist()))

    # Save Model
    paths = get_model_paths(sensor, model_name)
    joblib.dump(rf, paths["model"])
    joblib.dump(scaler, paths["scaler"])
    
    # Save Metadata (Hyperparameters)
    with open(paths["meta"], 'w') as f:
        json.dump({
            "sensor": sensor,
            "n_estimators": n_estimators,
            "max_depth": max_depth,
            "min_impurity_decrease": min_impurity_decrease,
            "test_size": test_size,
            "table_name": table_name,
            "created_at": datetime.now().isoformat(),
            "accuracy": acc
        }, f)
        
    print(f"[{sensor}] Model saved to {paths['model']}")
    
    # Automatically load the newly trained model
    load_model(sensor, model_name)

    # Tree Visualization (First Estimator)
    tree_struct = tree_to_json(rf.estimators_[0], feature_cols)

    return {
        "status": "success",
        "sensor": sensor,
        "accuracy": acc,
        "confusion_matrix": cm,
        "labels": [DISPLAY_LABELS.get(sensor, {}).get(i, str(i)) for i in std_labels],
        "feature_importances": importances,
        "tree_structure": tree_struct,
        "n_samples": len(y_test),
        "model_path": str(paths["model"]),
        "model_name": model_name
    }

# Wrappers for backward compatibility / specific use cases
def train_emg_model(n_estimators=100, max_depth=None, min_impurity_decrease=0.0, test_size=0.2, table_name="emg_windows", model_name="emg_rf"):
    return train_model('EMG', n_estimators, max_depth, min_impurity_decrease, test_size, table_name, model_name)

def train_eog_model(n_estimators=100, max_depth=None, min_impurity_decrease=0.0, test_size=0.2, table_name="eog_windows", model_name="eog_rf"):
    return train_model('EOG', n_estimators, max_depth, min_impurity_decrease, test_size, table_name, model_name)

def train_eeg_model(n_estimators=100, max_depth=None, min_impurity_decrease=0.0, test_size=0.2, table_name="eeg_windows", model_name="eeg_rf"):
    return train_model('EEG', n_estimators, max_depth, min_impurity_decrease, test_size, table_name, model_name)


def list_saved_models(sensor='EMG'):
    """Returns a list of available models for a sensor."""
    models = []
    sensor = sensor.upper()
    sensor_dir = MODELS_ROOT / sensor / "models"
    
    if not sensor_dir.exists():
        return []
    
    all_files = list(sensor_dir.glob("*.joblib"))
    
    for p in all_files:
        if p.name.endswith("_scaler.joblib"):
            continue
            
        name = p.stem
        meta_path = sensor_dir / f"{name}_meta.json"
        
        meta = {}
        if meta_path.exists():
            try:
                with open(meta_path, 'r') as f:
                    meta = json.load(f)
            except: pass
            
        models.append({
            "name": name,
            "path": str(p),
            "created_at": meta.get("created_at"),
            "accuracy": meta.get("accuracy"),
            "hyperparameters": {k:v for k,v in meta.items() if k not in ["created_at", "accuracy"]}
        })
        
    models.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return models

def delete_model(sensor, model_name):
    """Deletes the specified model and its associated files."""
    # backward compat: if sensor is actually model_name (from old calls), assume EMG
    # But wait, old call was delete_model(model_name). 
    # We should update function signature carefully or check args.
    # To be safe, let's keep old signature as alias if needed, but here we define new one.
    # Python doesn't verify types, so...
    if model_name is None: 
         # Likely called as delete_model(model_name) where sensor arg got the name
         # Assuming EMG for safety if only 1 arg passed that looks like a name
         # But safer to just require both.
         pass

    paths = get_model_paths(sensor, model_name)
    deleted = []
    errors = []
    
    for key, p in paths.items():
        if p.exists():
            try:
                os.remove(p)
                deleted.append(str(p))
            except Exception as e:
                errors.append(f"Failed to delete {p}: {e}")
    
    if errors:
        return {"status": "partial_success", "deleted": deleted, "errors": errors}
    return {"status": "success", "deleted": deleted}

def load_model(sensor, model_name):
    """Loads the specified model into global state."""
    sensor = sensor.upper()
    paths = get_model_paths(sensor, model_name)
    
    if not paths["model"].exists() or not paths["scaler"].exists():
        return {"error": f"Model {model_name} not found"}
        
    try:
        ACTIVE_MODELS[sensor] = joblib.load(paths["model"])
        ACTIVE_SCALERS[sensor] = joblib.load(paths["scaler"])
        ACTIVE_MODEL_NAMES[sensor] = model_name
        
        # Persist to sensor_config for other processes (FeatureRouter)
        from src.utils.config import config_manager
        config_manager.set_active_model(sensor, model_name)
        
        print(f"[{sensor}] Loaded model: {model_name}")
        return {"status": "success", "model_name": model_name}
    except Exception as e:
        print(f"[{sensor}] Failed to load model {model_name}: {e}")
        return {"error": str(e)}

def evaluate_saved_model(sensor='EMG', table_name=None, model_name=None):
    """
    Evaluates a saved model. 
    """
    sensor = sensor.upper()
    current_name = model_name or ACTIVE_MODEL_NAMES[sensor]
    paths = None
    
    display_model = None
    display_scaler = None
    
    if model_name and model_name == ACTIVE_MODEL_NAMES[sensor] and ACTIVE_MODELS[sensor]:
        display_model = ACTIVE_MODELS[sensor]
        display_scaler = ACTIVE_SCALERS[sensor]
        paths = get_model_paths(sensor, model_name)
    elif model_name:
        paths = get_model_paths(sensor, model_name)
        if not paths["model"].exists(): return {"error": f"Model {model_name} not found"}
        try:
            display_model = joblib.load(paths["model"])
            display_scaler = joblib.load(paths["scaler"])
        except Exception as e: return {"error": f"Load failed: {e}"}
    elif ACTIVE_MODELS[sensor]:
        display_model = ACTIVE_MODELS[sensor]
        display_scaler = ACTIVE_SCALERS[sensor]
        paths = get_model_paths(sensor, ACTIVE_MODEL_NAMES[sensor])
    else:
        # Fallback default
        default_name = f"{sensor.lower()}_rf"
        paths = get_model_paths(sensor, default_name)
        if paths["model"].exists():
            try:
                display_model = joblib.load(paths["model"])
                display_scaler = joblib.load(paths["scaler"])
            except: return {"error": f"No active {sensor} model and default not found."}
        else:
             return {"error": f"No {sensor} model selected or loaded."}

    feature_cols = get_feature_cols(sensor)
    meta = {}
    if paths and paths["meta"].exists():
        try:
            with open(paths["meta"], 'r') as f: meta = json.load(f)
        except: pass

    base_response = {
        "status": "success",
        "model_path": str(paths["model"]),
        "model_name": model_name or ACTIVE_MODEL_NAMES[sensor] or "unknown",
        "feature_importances": dict(zip(feature_cols, display_model.feature_importances_.tolist())),
        "tree_structure": tree_to_json(display_model.estimators_[0], feature_cols),
        "hyperparameters": meta
    }

    if not table_name: table_name = f"{sensor.lower()}_windows"
    
    conn = db_manager.connect(sensor)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
        if not cursor.fetchone():
             conn.close()
             return {**base_response, "warning": f"Table {table_name} not found. Evaluation skipped."}
        df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    except Exception as e:
        conn.close()
        return {**base_response, "warning": f"DB Error: {str(e)}"}
    conn.close()

    if df.empty:
         return {**base_response, "warning": f"Table {table_name} is empty."}

    # Prepare Features
    missing_cols = [c for c in feature_cols if c not in df.columns]
    if missing_cols:
         if 'range' in missing_cols and 'rng' in df.columns:
             df.rename(columns={'rng': 'range'}, inplace=True)
         for col in missing_cols:
             if col not in df.columns: df[col] = 0.0

    X = df[feature_cols]
    y = df['label']

    try:
        X_scaled = display_scaler.transform(X)
        y_pred = display_model.predict(X_scaled)
        
        acc = accuracy_score(y, y_pred)
        std_labels = LABELS_MAP.get(sensor, list(sorted(y.unique())))
        cm = confusion_matrix(y, y_pred, labels=std_labels).tolist()
        
        return {
            **base_response,
            "accuracy": acc,
            "confusion_matrix": cm,
            "labels": [DISPLAY_LABELS.get(sensor, {}).get(i, str(i)) for i in std_labels],
            "n_samples": len(df)
        }
    except Exception as e:
        return {"error": f"Inference error: {str(e)}"}

def get_model_tree_structure(sensor='EMG', model_name=None, tree_index=0):
    """
    Returns the JSON structure of a specific tree.
    """
    sensor = sensor.upper()
    current_name = model_name or ACTIVE_MODEL_NAMES[sensor]
    paths = get_model_paths(sensor, current_name) if current_name else None
    
    model = None
    
    if ACTIVE_MODELS[sensor] and ACTIVE_MODEL_NAMES[sensor] == current_name:
        model = ACTIVE_MODELS[sensor]
    elif paths and paths["model"].exists():
        try:
            model = joblib.load(paths["model"])
        except: pass
        
    if not model:
        return {"error": "Model not found"}
        
    try:
        if tree_index < 0 or tree_index >= len(model.estimators_):
            return {"error": f"Tree index {tree_index} out of bounds"}
            
        feature_cols = get_feature_cols(sensor)
        tree_struct = tree_to_json(model.estimators_[tree_index], feature_cols)
        
        return {
            "status": "success",
            "tree_index": tree_index,
            "total_trees": len(model.estimators_),
            "tree_structure": tree_struct
        }
    except Exception as e:
        return {"error": str(e)}

# Initial load try
try:
    load_model('EMG', 'emg_rf')
except: pass
try:
    load_model('EOG', 'eog_rf')
except: pass

if __name__ == "__main__":
    print("Testing Generic Evaluation...")
    # print(evaluate_saved_model('EMG'))
