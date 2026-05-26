from flask import Blueprint, jsonify, request
import sqlite3
import time
import json
import os
from pathlib import Path
from src.server.server.state import state
from src.server.server.lsl_service import extract_emg_features

prediction_bp = Blueprint('prediction', __name__)

# DB Path configuration
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
PREDICTION_DB_DIR = PROJECT_ROOT / "prediction" / "emg"
PREDICTION_DB_PATH = PREDICTION_DB_DIR / "emg.db"

def get_db_connection():
    if not PREDICTION_DB_DIR.exists():
        PREDICTION_DB_DIR.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(str(PREDICTION_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    # Create predictions table if not exists
    # Columns: id, timestamp, ground_truth, predicted_label, confidence, features (JSON)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp REAL,
            ground_truth TEXT,
            predicted_label TEXT,
            confidence REAL,
            features TEXT
        )
    ''')
    conn.commit()
    conn.close()

# Initialize on module load (or first request)
try:
    init_db()
except Exception as e:
    print(f"[Prediction] Custom DB init failed: {e}")

@prediction_bp.route('/api/prediction/window/predict', methods=['POST'])
def predict_window():
    try:
        payload = request.get_json()
        if not payload:
            return jsonify({"error": "No payload"}), 400
            
        samples = payload.get('samples')
        label = payload.get('label', 'Unknown') # Ground truth
        
        if not samples:
            return jsonify({"error": "No samples provided"}), 400
            
        # 1. Extract Features
        # Assuming EMG for now as per request "prediction/emg/emg.db"
        sr = state.config.get('sampling_rate', 512) if state.config else 512
        features = extract_emg_features(samples, sr)
        
        # 2. Predict (Stateless)
        predicted_label = "Unknown"
        confidence = 0.0
        
        if state.rps_detector:
            # Use predict_instant for single window test
            pred, conf = state.rps_detector.predict_instant(features)
            predicted_label = pred
            confidence = float(conf)
            
        # 3. Save to DB
        conn = get_db_connection()
        conn.execute(
            "INSERT INTO predictions (timestamp, ground_truth, predicted_label, confidence, features) VALUES (?, ?, ?, ?, ?)",
            (time.time(), label, predicted_label, confidence, json.dumps(features))
        )
        conn.commit()
        conn.close()
        
        return jsonify({
            "status": "predicted",
            "predicted_label": predicted_label,
            "confidence": confidence,
            "features": features,
            "ground_truth": label,
            "match": (predicted_label == label)
        })
        
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[Prediction] Error: {e}")
        return jsonify({"error": str(e), "traceback": tb}), 500

@prediction_bp.route('/api/prediction/history', methods=['GET'])
def get_history():
    try:
        conn = get_db_connection()
        rows = conn.execute("SELECT * FROM predictions ORDER BY id DESC LIMIT 1000").fetchall()
        conn.close()
        
        result = []
        for r in rows:
            result.append({
                "id": r["id"],
                "timestamp": r["timestamp"],
                "label": r["ground_truth"], # Mapping ground_truth to 'label' for frontend compatibility
                "class": r["predicted_label"], # Mapping predicted to 'class' or similar
                "predicted_label": r["predicted_label"],
                "confidence": r["confidence"],
                "features": json.loads(r["features"]) if r["features"] else {}
            })
            
        # Frontend SessionManager expects { columns: [], rows: [] } usually, or just rows?
        # SessionManagerPanel.jsx line 162: `setSelectedSessionRows(Array.isArray(data) ? data : (data.rows || []));`
        # So array is fine.
        return jsonify(result)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@prediction_bp.route('/api/prediction/sessions', methods=['GET'])
def get_sessions_mock():
    # Mocking a session list response for SessionManagerPanel
    # It expects { tables: [...] }
    return jsonify({
        "tables": ["prediction_session_History"]
    })

@prediction_bp.route('/api/prediction/sessions/<path:session_name>', methods=['GET'])
def get_session_details(session_name):
    # Route that matches what SessionManager might call if we redirected the base URL
    # But since we are likely going to change the fetch URL in frontend, we can just use /api/prediction/history
    return get_history()

@prediction_bp.route('/api/prediction/sessions/<path:session_name>/rows/<row_id>', methods=['DELETE'])
def delete_row(session_name, row_id):
    try:
        conn = get_db_connection()
        conn.execute("DELETE FROM predictions WHERE id = ?", (row_id,))
        conn.commit()
        conn.close()
        return jsonify({"status": "deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@prediction_bp.route('/api/prediction/sessions/<path:session_name>', methods=['DELETE'])
def clear_history(session_name):
    try:
        conn = get_db_connection()
        conn.execute("DELETE FROM predictions")
        conn.commit()
        conn.close()
        return jsonify({"status": "cleared"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
