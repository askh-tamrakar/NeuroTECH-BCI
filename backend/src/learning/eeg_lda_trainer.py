import json
import random
from datetime import datetime
import joblib
import numpy as np
import pandas as pd
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.model_selection import GroupKFold, train_test_split
from sklearn.preprocessing import StandardScaler
import os

from src.database.db_manager import db_manager
from src.learning.emg_trainer import DISPLAY_LABELS, LABELS_MAP, get_model_paths, get_rejected_model_paths, generate_hex_id
from src.utils.config import config_manager

EEG_LDA_FEATURES = [
    "score_1", "score_2", "score_3", "score_4", "score_5", "score_6",
    "max_score", "second_max_score", "score_ratio", "score_mean", "score_std",
    "peak_freq", "target_frequency"
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
    if coefficients is None: return {}, {}
    coeffs = pd.DataFrame(coefficients, columns=feature_order)
    raw_importances = coeffs.abs().mean(axis=0)
    total = float(raw_importances.sum())
    normalized = (raw_importances / total).to_dict() if total > 1e-12 else {f: 0.0 for f in feature_order}
    return normalized, raw_importances.to_dict()

def _build_lda_visualization(model, X_scaled, y, feature_order) -> dict:
    visualization = {"component_count": 0, "class_centroids": [], "class_signatures": []}
    try:
        projections = model.transform(X_scaled)
        if projections.ndim == 1: projections = projections.reshape(-1, 1)
        visualization["component_count"] = int(projections.shape[1])
        for label in sorted(pd.Series(y).astype(int).unique().tolist()):
            mask = (pd.Series(y).astype(int).to_numpy() == label)
            if not np.any(mask): continue
            subset = projections[mask]
            visualization["class_centroids"].append({
                "label": label,
                "name": str(DISPLAY_LABELS["EEG"].get(label, label)),
                "count": int(subset.shape[0]),
                "ld1": float(np.mean(subset[:, 0])) if subset.shape[1] > 0 else 0.0,
                "ld2": float(np.mean(subset[:, 1])) if subset.shape[1] > 1 else 0.0,
            })
    except: pass
    
    coefficients = getattr(model, "coef_", None)
    classes = getattr(model, "classes_", [])
    if coefficients is not None and len(classes):
        coeffs = pd.DataFrame(coefficients, columns=feature_order)
        for index, class_id in enumerate(classes):
            if index >= len(coeffs): continue
            row = coeffs.iloc[index]
            top_features = row.abs().sort_values(ascending=False).head(4)
            max_abs = float(top_features.max()) if len(top_features) else 0.0
            signature = [{"feature": k, "weight": float(v), "relative": (abs(float(v))/max_abs) if max_abs > 1e-12 else 0.0} for k,v in top_features.items()]
            visualization["class_signatures"].append({"label": class_id, "name": str(DISPLAY_LABELS["EEG"].get(class_id, class_id)), "signature": signature})
    return visualization

def train_eeg_lda_model(table_name: str = "eeg_windows", train_split=0.7, val_split=0.15, test_split=0.15, n_folds=1, model_name=None, solver="eigen", shrinkage="auto"):
    conn = db_manager.connect("EEG")
    try:
        df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    finally: conn.close()
    
    if df.empty: return {"error": "Database is empty."}
    
    for col in EEG_LDA_FEATURES:
        if col not in df.columns: df[col] = 0.0
    
    df = df[df["label"].notna()]
    if df["label"].nunique() < 2: return {"error": "Need at least 2 classes."}
    
    X = df[EEG_LDA_FEATURES].fillna(0.0)
    y = df["label"]
    groups = df["trial"] if "trial" in df.columns else pd.Series(["T0"]*len(df))
    
    unique_trials = groups.unique()
    if len(unique_trials) < 3:
        train_val_idx, test_idx = train_test_split(np.arange(len(y)), test_size=test_split, stratify=y, random_state=42)
    else:
        tv_trials, test_trials = train_test_split(unique_trials, test_size=test_split, random_state=42)
        train_val_idx = df[groups.isin(tv_trials)].index
        test_idx = df[groups.isin(test_trials)].index
    
    X_tv, y_tv, groups_tv = X.iloc[train_val_idx], y.iloc[train_val_idx], groups.iloc[train_val_idx]
    X_test, y_test = X.iloc[test_idx], y.iloc[test_idx]
    
    candidate_base = random.randint(0x100, 0xFFF)
    fold_results = []
    
    if n_folds > 1 and len(groups_tv.unique()) >= n_folds:
        gkf = GroupKFold(n_splits=n_folds)
        folds = list(gkf.split(X_tv, y_tv, groups=groups_tv))
    else:
        # Single fold (Trial-Aware)
        n_folds = 1
        unique_trials_tv = groups_tv.unique()
        if len(unique_trials_tv) >= 2:
            tr_t, val_t = train_test_split(unique_trials_tv, test_size=val_split/(train_split+val_split), random_state=42)
            tr_idx = groups_tv[groups_tv.isin(tr_t)].index
            val_idx = groups_tv[groups_tv.isin(val_t)].index
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
        
        model = LinearDiscriminantAnalysis(solver=solver, shrinkage="auto" if solver in ["lsqr", "eigen"] else None)
        model.fit(X_f_t_s, y_f_t)
        
        acc = accuracy_score(y_f_v, model.predict(X_f_v_s))
        model_id = generate_hex_id(candidate_base, f_idx + 1)
        
        r_paths = get_rejected_model_paths("EEG", model_id)
        joblib.dump(model, r_paths["model"])
        joblib.dump(scaler, r_paths["scaler"])
        with open(r_paths["meta"], 'w') as f_m: json.dump({"accuracy": acc, "fold": f_idx+1, "candidate": f"{candidate_base:X}"}, f_m)
        
        fold_results.append({"fold": f_idx+1, "accuracy": acc, "model_id": model_id})
        if acc > best_acc: best_acc, best_data = acc, (model, scaler, model_id)

    best_m, best_s, best_id = best_data
    X_test_s = best_s.transform(X_test)
    y_test_pred = best_m.predict(X_test_s)
    test_acc = accuracy_score(y_test, y_test_pred)
    
    final_id = model_name or generate_hex_id(candidate_base, 0)
    final_paths = get_model_paths("EEG", final_id)
    joblib.dump(best_m, final_paths["model"])
    joblib.dump(best_s, final_paths["scaler"])
    with open(final_paths["meta"], 'w') as f_m: 
        json.dump({"accuracy": test_acc, "val_accuracy": best_acc, "folds": fold_results, "id": final_id, "created_at": datetime.now().isoformat()}, f_m)
        
    config_manager.set_active_model("EEG", final_id)
    
    std_labels = LABELS_MAP["EEG"]
    cm = confusion_matrix(y_test, y_test_pred, labels=std_labels).tolist()
    
    return {
        "status": "success", "sensor": "EEG", "accuracy": test_acc, "val_accuracy": best_acc,
        "confusion_matrix": cm, "labels": [DISPLAY_LABELS["EEG"].get(i, str(i)) for i in std_labels],
        "model_id": final_id, "best_fold_id": best_id, "folds": fold_results,
        "visualization": _build_lda_visualization(best_m, X_test_s, y_test, EEG_LDA_FEATURES)
    }

def evaluate_eeg_lda_model(table_name="eeg_windows", model_name=None):
    model_name = model_name or config_manager.get_active_model("EEG")
    if not model_name: return {"error": "No model active."}
    paths = get_model_paths("EEG", model_name)
    model = joblib.load(paths["model"])
    scaler = joblib.load(paths["scaler"])
    conn = db_manager.connect("EEG")
    try: df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    finally: conn.close()
    X = df[EEG_LDA_FEATURES].fillna(0.0)
    y = df["label"]
    X_eval = scaler.transform(X)
    y_pred = model.predict(X_eval)
    
    acc = accuracy_score(y, y_pred)
    std_labels = LABELS_MAP["EEG"]
    cm = confusion_matrix(y, y_pred, labels=std_labels).tolist()
    
    return {
        "accuracy": acc, "confusion_matrix": cm,
        "labels": [str(DISPLAY_LABELS["EEG"].get(i, i)) for i in std_labels]
    }
