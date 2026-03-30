import json
from datetime import datetime

import joblib
import numpy as np
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
    "peak_freq",
]


def _resolve_model_feature_order(model=None, scaler=None):
    expected = getattr(scaler, "n_features_in_", None)
    if expected is None and model is not None:
        expected = getattr(model, "n_features_in_", None)
    if not expected:
        expected = len(EEG_LDA_FEATURES)
    return EEG_LDA_FEATURES[: int(expected)]


def _normalize_feature_importances(model, feature_order) -> tuple[dict, dict]:
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


def _build_lda_visualization(model, X_scaled, y, feature_order) -> dict:
    visualization = {
        "component_count": 0,
        "class_centroids": [],
        "class_signatures": [],
    }

    try:
        projections = model.transform(X_scaled)
        projections = np.asarray(projections)
        if projections.ndim == 1:
            projections = projections.reshape(-1, 1)

        visualization["component_count"] = int(projections.shape[1])
        for label in sorted(pd.Series(y).astype(int).unique().tolist()):
            mask = (pd.Series(y).astype(int).to_numpy() == label)
            if not np.any(mask):
                continue
            subset = projections[mask]
            visualization["class_centroids"].append({
                "label": int(label),
                "name": DISPLAY_LABELS["EEG"].get(int(label), str(label)),
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
                "label": int(class_id),
                "name": DISPLAY_LABELS["EEG"].get(int(class_id), str(class_id)),
                "signature": signature,
            })

    return visualization


def train_eeg_lda_model(
    table_name: str = "eeg_windows",
    test_size: float = 0.2,
    model_name: str = "eeg_lda",
    solver: str = "eigen",
    shrinkage: str | None = "auto",
):
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
    )
    model.fit(X_train_scaled, y_train)

    y_pred = model.predict(X_test_scaled)
    acc = accuracy_score(y_test, y_pred)
    std_labels = LABELS_MAP["EEG"]
    cm = confusion_matrix(y_test, y_pred, labels=std_labels).tolist()
    feature_order = list(EEG_LDA_FEATURES)
    feature_importances, raw_feature_importances = _normalize_feature_importances(model, feature_order)
    visualization = _build_lda_visualization(model, X_test_scaled, y_test, feature_order)

    paths = get_model_paths("EEG", model_name)
    joblib.dump(model, paths["model"])
    joblib.dump(scaler, paths["scaler"])

    with open(paths["meta"], "w", encoding="utf-8") as f:
        json.dump(
            {
                "sensor": "EEG",
                "classifier": "LDA",
                "feature_order": feature_order,
                "test_size": test_size,
                "solver": solver,
                "shrinkage": shrinkage if solver in {"lsqr", "eigen"} else "none",
                "train_samples": int(len(y_train)),
                "test_samples": int(len(y_test)),
                "total_samples": int(len(df)),
                "table_name": table_name,
                "created_at": datetime.now().isoformat(),
                "accuracy": acc,
            },
            f,
            indent=2,
        )

    config_manager.set_active_model("EEG", model_name)

    # Dynamically resolve frequency labels from data
    label_to_freq = {}
    if "target_frequency" in df.columns:
        for lbl, group in df.groupby("label"):
            freqs = group["target_frequency"].dropna().unique()
            valid_freqs = [f for f in freqs if f > 0]
            if valid_freqs:
                label_to_freq[int(lbl)] = valid_freqs[0]

    nice_labels = []
    for i in std_labels:
        freq = label_to_freq.get(i)
        if freq:
            # Format to remove .0 if it's an integer
            fmt_freq = f"{int(freq)}" if freq == int(freq) else f"{freq}"
            nice_labels.append(f"{fmt_freq}Hz")
        elif i == 0:
            nice_labels.append("Rest")
        else:
            nice_labels.append(DISPLAY_LABELS["EEG"].get(i, str(i)))

    return {
        "status": "success",
        "sensor": "EEG",
        "classifier": "LDA",
        "accuracy": acc,
        "confusion_matrix": cm,
        "labels": nice_labels,
        "n_samples": int(len(y_test)),
        "train_samples": int(len(y_train)),
        "total_samples": int(len(df)),
        "model_name": model_name,
        "model_path": str(paths["model"]),
        "feature_order": feature_order,
        "feature_importances": feature_importances,
        "raw_feature_importances": raw_feature_importances,
        "visualization": visualization,
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

    feature_order = _resolve_model_feature_order(model, scaler)
    X = df[feature_order].fillna(0.0)
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

    feature_importances, raw_feature_importances = _normalize_feature_importances(model, feature_order)
    visualization = _build_lda_visualization(model, X_eval, y, feature_order)

    # Dynamically resolve frequency labels from data
    label_to_freq = {}
    if "target_frequency" in df.columns:
        for lbl, group in df.groupby("label"):
            freqs = group["target_frequency"].dropna().unique()
            valid_freqs = [f for f in freqs if f > 0]
            if valid_freqs:
                label_to_freq[int(lbl)] = valid_freqs[0]

    nice_labels = []
    for i in std_labels:
        freq = label_to_freq.get(i)
        if freq:
            fmt_freq = f"{int(freq)}" if freq == int(freq) else f"{freq}"
            nice_labels.append(f"{fmt_freq}Hz")
        elif i == 0:
            nice_labels.append("Rest")
        else:
            nice_labels.append(DISPLAY_LABELS["EEG"].get(i, str(i)))

    return {
        "status": "success",
        "sensor": "EEG",
        "classifier": "LDA",
        "model_name": model_name,
        "model_path": str(paths["model"]),
        "accuracy": acc,
        "confusion_matrix": cm,
        "labels": nice_labels,
        "n_samples": int(len(df)),
        "total_samples": int(len(df)),
        "feature_importances": feature_importances,
        "raw_feature_importances": raw_feature_importances,
        "tree_structure": None,
        "hyperparameters": meta,
        "feature_order": feature_order,
        "visualization": visualization,
    }

