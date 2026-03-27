import json
from datetime import datetime

import joblib
import pandas as pd
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from src.database.db_manager import db_manager
from src.learning.model_trainer import DISPLAY_LABELS, LABELS_MAP, get_model_paths
from src.utils.config import config_manager


EEG_LDA_FEATURES = [
    "score_1",
    "score_2",
    "score_3",
    "score_4",
    "score_5",
    "score_6",
    "max_score",
    "second_max_score",
    "score_ratio",
    "score_mean",
    "score_std",
]


def train_eeg_lda_model(table_name: str = "eeg_windows", test_size: float = 0.2, model_name: str = "eeg_lda"):
    conn = db_manager.connect("EEG")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
        if not cursor.fetchone():
            return {"error": f"Table {table_name} not found"}
        df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    finally:
        conn.close()

    if df.empty:
        return {"error": "Database is empty. Collect EEG windows first."}

    for column in EEG_LDA_FEATURES:
        if column not in df.columns:
            df[column] = 0.0

    df = df[df["label"].notna()]
    if df.empty or df["label"].nunique() < 2:
        return {"error": "Need at least 2 EEG classes to train an LDA model."}

    X = df[EEG_LDA_FEATURES].fillna(0.0)
    y = df["label"].astype(int)

    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, stratify=y, random_state=42
        )
    except ValueError:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42
        )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    model = LinearDiscriminantAnalysis()
    model.fit(X_train_scaled, y_train)

    y_pred = model.predict(X_test_scaled)
    acc = accuracy_score(y_test, y_pred)
    std_labels = LABELS_MAP["EEG"]
    cm = confusion_matrix(y_test, y_pred, labels=std_labels).tolist()

    paths = get_model_paths("EEG", model_name)
    joblib.dump(model, paths["model"])
    joblib.dump(scaler, paths["scaler"])

    with open(paths["meta"], "w", encoding="utf-8") as f:
        json.dump(
            {
                "sensor": "EEG",
                "classifier": "LDA",
                "feature_order": EEG_LDA_FEATURES,
                "test_size": test_size,
                "table_name": table_name,
                "created_at": datetime.now().isoformat(),
                "accuracy": acc,
            },
            f,
            indent=2,
        )

    config_manager.set_active_model("EEG", model_name)

    return {
        "status": "success",
        "sensor": "EEG",
        "classifier": "LDA",
        "accuracy": acc,
        "confusion_matrix": cm,
        "labels": [DISPLAY_LABELS["EEG"].get(i, str(i)) for i in std_labels],
        "n_samples": len(df),
        "model_name": model_name,
        "model_path": str(paths["model"]),
        "feature_order": EEG_LDA_FEATURES,
    }


def evaluate_eeg_lda_model(table_name: str = "eeg_windows", model_name: str | None = None):
    if not model_name:
        model_name = config_manager.get_active_model("EEG")
    if not model_name:
        return {"error": "No EEG model selected or loaded."}

    paths = get_model_paths("EEG", model_name)
    if not paths["model"].exists():
        return {"error": f"Model {model_name} not found"}

    try:
        model = joblib.load(paths["model"])
        scaler = joblib.load(paths["scaler"]) if paths["scaler"].exists() else None
    except Exception as e:
        return {"error": f"Load failed: {e}"}

    conn = db_manager.connect("EEG")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
        if not cursor.fetchone():
            return {"error": f"Table {table_name} not found"}
        df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    finally:
        conn.close()

    if df.empty:
        return {"error": f"Table {table_name} is empty."}

    for column in EEG_LDA_FEATURES:
        if column not in df.columns:
            df[column] = 0.0

    X = df[EEG_LDA_FEATURES].fillna(0.0)
    y = df["label"].astype(int)
    X_eval = scaler.transform(X) if scaler is not None else X.values
    y_pred = model.predict(X_eval)
    acc = accuracy_score(y, y_pred)
    std_labels = LABELS_MAP["EEG"]
    cm = confusion_matrix(y, y_pred, labels=std_labels).tolist()

    meta = {}
    if paths["meta"].exists():
        try:
            with open(paths["meta"], "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            meta = {}

    coefficients = getattr(model, "coef_", None)
    if coefficients is not None:
        coeffs = pd.DataFrame(coefficients, columns=EEG_LDA_FEATURES)
        feature_importances = coeffs.abs().mean(axis=0).to_dict()
    else:
        feature_importances = {}

    return {
        "status": "success",
        "sensor": "EEG",
        "classifier": "LDA",
        "model_name": model_name,
        "model_path": str(paths["model"]),
        "accuracy": acc,
        "confusion_matrix": cm,
        "labels": [DISPLAY_LABELS["EEG"].get(i, str(i)) for i in std_labels],
        "n_samples": len(df),
        "feature_importances": feature_importances,
        "tree_structure": None,
        "hyperparameters": meta,
    }

