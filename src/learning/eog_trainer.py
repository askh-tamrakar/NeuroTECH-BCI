import pandas as pd
import numpy as np
import joblib
import json
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, confusion_matrix
import sys
import os

# Standard Labels for EOG (Must match frontend)
# 0, 1, 2 corresponding to DoubleBlink, SingleBlink, Rest
STANDARD_LABELS = [0, 1, 2]

# Add project root to sys.path to allow imports from src
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

# Now we can import from src
from src.learning.tree_utils import tree_to_json
from src.database.db_manager import db_manager

# Paths
MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "models" / "EOG"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Global State for Active Model
ACTIVE_MODEL = None
ACTIVE_SCALER = None
ACTIVE_MODEL_NAME = None

def get_model_paths(model_name=None):
    """Returns dict of paths for a given model name (or default)."""
    # Use default if no name provided (legacy support)
    if not model_name: 
        return {
            "model": MODELS_DIR / "eog_rf.joblib",
            "scaler": MODELS_DIR / "eog_scaler.joblib",
            "meta": MODELS_DIR / "eog_rf_meta.json"
        }
        
    clean_name = "".join([c for c in model_name if c.isalnum() or c in ('_', '-')])
    base = MODELS_DIR / clean_name
    return {
        "model": base.with_suffix(".joblib"),
        "scaler": MODELS_DIR / f"{clean_name}_scaler.joblib",
        "meta": MODELS_DIR / f"{clean_name}_meta.json"
    }

EOG_FEATURES = [
    'amplitude', 'duration_ms', 'rise_time_ms', 'fall_time_ms',
    'asymmetry', 'peak_count', 'kurtosis', 'skewness'
]

def train_eog_model(n_estimators=100, max_depth=None, test_size=0.2, table_name="eog_windows", model_name="eog_rf"):
    """
    Trains a Random Forest classifier on EOG data from the database.
    """
    conn = db_manager.connect('EOG') # Fixed: Explicit sensor type
    
    # Load data from DB
    try:
        if not table_name: table_name = "eog_windows"
        if table_name == "undefined" or table_name == "null": table_name = "eog_windows"

        # Check if table exists first
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
        if not cursor.fetchone():
             conn.close()
             return {"error": f"Table {table_name} does not exist. Collect data first."}

        df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    except Exception as e:
        conn.close()
        return {"error": f"Database read error: {str(e)}"}
    
    conn.close()

    if df.empty:
        return {"error": "EOG Database is empty. Collect data first."}

    # Prepare Features and Labels
    # Check completeness
    missing = [c for c in EOG_FEATURES if c not in df.columns]
    if missing:
        return {"error": f"Missing columns in DB: {missing}"}

    X = df[EOG_FEATURES]
    y = df['label']

    # Test/Train Split
    try:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, stratify=y, random_state=42)
    except ValueError as e:
         return {"error": f"Split error (not enough data per class?): {str(e)}"}

    # Scale Features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train Random Forest
    rf = RandomForestClassifier(n_estimators=n_estimators, max_depth=max_depth, random_state=42)
    rf.fit(X_train_scaled, y_train)

    # Evaluate
    y_pred = rf.predict(X_test_scaled)
    acc = accuracy_score(y_test, y_pred)
    # Use standard labels to ensure matrix is aligned with frontend
    cm = confusion_matrix(y_test, y_pred, labels=STANDARD_LABELS).tolist()
    
    # Feature Importance
    importances = dict(zip(EOG_FEATURES, rf.feature_importances_.tolist()))

    # Save Model
    paths = get_model_paths(model_name)
    joblib.dump(rf, paths["model"])
    joblib.dump(scaler, paths["scaler"])
    
    # Save Metadata
    with open(paths["meta"], 'w') as f:
        json.dump({
            "n_estimators": n_estimators,
            "max_depth": max_depth,
            "test_size": test_size,
            "table_name": table_name,
            "created_at": pd.Timestamp.now().isoformat(),
            "accuracy": acc
        }, f)

    print(f"EOG Model saved to {paths['model']}")

    # Automatically load
    load_model(model_name)

    # Tree Visualization (First Estimator)
    tree_struct = tree_to_json(rf.estimators_[0], EOG_FEATURES)

    return {
        "status": "success",
        "accuracy": acc,
        "confusion_matrix": cm,
        "labels": STANDARD_LABELS,
        "feature_importances": importances,
        "tree_structure": tree_struct,
        "n_samples": len(y_test),
        "model_path": str(paths["model"]),
        "model_name": model_name
    }

def evaluate_saved_eog_model(table_name="eog_windows", model_name=None):
    """
    Evaluates the currently saved EOG model against the specified database table.
    """
    # Logic to resolve model similar to EMG
    display_model = None
    display_scaler = None
    paths = None
    
    if model_name and model_name == ACTIVE_MODEL_NAME and ACTIVE_MODEL:
        display_model = ACTIVE_MODEL
        display_scaler = ACTIVE_SCALER
        paths = get_model_paths(model_name)
    elif model_name:
         paths = get_model_paths(model_name)
         if not paths["model"].exists(): return {"error": f"Model {model_name} not found"}
         try:
             display_model = joblib.load(paths["model"])
             display_scaler = joblib.load(paths["scaler"])
         except Exception as e: return {"error": f"Load failed: {e}"}
    elif ACTIVE_MODEL:
        display_model = ACTIVE_MODEL
        display_scaler = ACTIVE_SCALER
        paths = get_model_paths(ACTIVE_MODEL_NAME)
    else:
        # Default
        paths = get_model_paths("eog_rf")
        if paths["model"].exists():
             try:
                 display_model = joblib.load(paths["model"])
                 display_scaler = joblib.load(paths["scaler"])
             except: return {"error": "Default model load failed"}
        else:
             return {"error": "No EOG model found"}

    # Load Metadata if available
    hyperparameters = {}
    if paths and paths["meta"].exists():
        try:
            with open(paths["meta"], 'r') as f:
                hyperparameters = json.load(f)
        except Exception:
            pass

    # Prepare base response
    base_response = {
        "status": "success",
        "model_path": str(paths["model"]),
        "model_name": model_name or ACTIVE_MODEL_NAME or "eog_rf",
        "feature_importances": dict(zip(EOG_FEATURES, display_model.feature_importances_.tolist())),
        "tree_structure": tree_to_json(display_model.estimators_[0], EOG_FEATURES),
        "hyperparameters": hyperparameters
    }

    if not table_name:
        table_name = "eog_windows"

    conn = db_manager.connect('EOG')
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
        if not cursor.fetchone():
             conn.close()
             return {
                 **base_response,
                 "accuracy": None,
                 "confusion_matrix": None,
                 "n_samples": 0,
                 "warning": f"Table {table_name} not found."
             }

        df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    except Exception as e:
        conn.close()
        return {
             **base_response,
             "accuracy": None,
             "confusion_matrix": None,
             "n_samples": 0,
             "warning": f"Database read error: {str(e)}"
        }
    conn.close()

    if df.empty:
         return {
             **base_response,
             "accuracy": None,
             "confusion_matrix": None,
             "n_samples": 0,
             "warning": f"Table {table_name} is empty."
         }

    X = df[EOG_FEATURES]
    y = df['label']

    # Inference on FULL dataset
    try:
        X_scaled = display_scaler.transform(X)
        y_pred = display_model.predict(X_scaled)
        
        acc = accuracy_score(y, y_pred)
        # Use standard labels
        cm = confusion_matrix(y, y_pred, labels=STANDARD_LABELS).tolist()
        
        return {
            **base_response,
            "accuracy": acc,
            "confusion_matrix": cm,
            "labels": STANDARD_LABELS,
            "n_samples": len(df)
        }
    except Exception as e:
        return {"error": f"Inference error: {str(e)}"}

def list_saved_models():
    """Returns a list of available EOG models."""
    models = []
    # Glob for .joblib files
    all_files = list(MODELS_DIR.glob("*.joblib"))
    
    for p in all_files:
        if p.name.endswith("_scaler.joblib"):
            continue
            
        name = p.stem 
        meta_path = MODELS_DIR / f"{name}_meta.json"
        
        meta = {}
        if meta_path.exists():
            try:
                with open(meta_path, 'r') as f: meta = json.load(f)
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

def delete_model(model_name):
    """Deletes the specified EOG model and associated files."""
    paths = get_model_paths(model_name)
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

def load_model(model_name):
    """Loads the specified EOG model into global state."""
    global ACTIVE_MODEL, ACTIVE_SCALER, ACTIVE_MODEL_NAME
    
    paths = get_model_paths(model_name)
    if not paths["model"].exists() or not paths["scaler"].exists():
        return {"error": f"Model {model_name} not found"}
        
    try:
        ACTIVE_MODEL = joblib.load(paths["model"])
        ACTIVE_SCALER = joblib.load(paths["scaler"])
        ACTIVE_MODEL_NAME = model_name
        print(f"[EOG Trainer] Loaded model: {model_name}")
        return {"status": "success", "model_name": model_name}
    except Exception as e:
        print(f"[EOG Trainer] Failed to load model {model_name}: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    # Test run
    # print(train_eog_model())
    pass
