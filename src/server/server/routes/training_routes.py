from flask import Blueprint, jsonify, request
import time
import numpy as np
from src.server.server.state import state
from src.server.server.config_manager import load_config, save_config
from src.server.server.extensions import socketio
from src.database.db_manager import db_manager
from src.server.server.lsl_service import extract_emg_features, extract_emg_features as extract_features_for_sensor
# Note: original code routed `extract_features_for_sensor` to specific functions.
# We need to reimplement that routing or import it.
# EOG features are also needed.
from src.server.server.lsl_service import extract_eog_features
from scipy import stats as scipy_stats

# Imports for ML logic
from src.learning.model_trainer import (
    train_model, train_emg_model, train_eog_model,
    evaluate_saved_model, list_saved_models, delete_model, load_model, get_model_tree_structure
)
from src.learning.eog_trainer import (
    train_eog_model, evaluate_saved_eog_model, 
    list_saved_models as list_saved_eog_models, 
    delete_model as delete_eog_model, 
    load_model as load_eog_model
)

training_bp = Blueprint('training', __name__)

def extract_features_wrapper(sensor: str, samples: list, sr: int = 512) -> dict:
    """Route to sensor-specific feature extraction."""
    sensor = sensor.upper()
    if sensor == "EMG":
        return extract_emg_features(samples, sr)
    elif sensor == "EOG":
        return extract_eog_features(samples, sr)
    else:
        return extract_emg_features(samples, sr)

@training_bp.route('/api/train-emg-rf', methods=['POST'])
def api_train_emg():
    try:
        params = request.get_json() or {}
        target_table = params.get('table_name', 'emg_windows')
        
        # Bypass DB check if ALL
        if target_table != 'ALL':
            try:
                conn = db_manager.connect('EMG')
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (target_table,))
                if not cursor.fetchone():
                     return jsonify({"error": f"Table {target_table} not found"}), 404
                     
                n = conn.execute(f"SELECT COUNT(*) FROM {target_table}").fetchone()[0]
                conn.close()
                
                print(f"[Training] Train Request on {target_table}. Contains {n} samples.")
                if n == 0:
                    return jsonify({"error": "Database is empty (0 samples). Please Record Data and hit Stop."}), 400
            except Exception as e:
                print(f"[Training] DB Check failed: {e}")

        n_est = int(params.get('n_estimators', 100))
        max_d = params.get('max_depth')
        if max_d == 'None' or max_d is None: max_d = None
        else: max_d = int(max_d)
        
        test_size = float(params.get('test_size', 0.2))
        
        model_name = params.get('model_name', 'emg_rf')
        
        result = train_emg_model(n_estimators=n_est, max_depth=max_d, test_size=test_size, table_name=target_table, model_name=model_name)
        if "error" in result:
             return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@training_bp.route('/api/train-eog-rf', methods=['POST'])
def api_train_eog():
    try:
        params = request.get_json() or {}
        n_est = int(params.get('n_estimators', 100))
        max_d = params.get('max_depth')
        table_name = params.get('table_name') # Extract session table name
        model_name = params.get('model_name', 'eog_rf')

        if max_d == 'None' or max_d is None: max_d = None
        else: max_d = int(max_d)
        
        test_size = float(params.get('test_size', 0.2))
        
        result = train_eog_model(n_estimators=n_est, max_depth=max_d, test_size=test_size, table_name=table_name, model_name=model_name)
        if "error" in result:
             return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@training_bp.route('/api/model/evaluate', methods=['POST'])
def api_eval_emg():
    params = request.get_json() or {}
    table_name = params.get('table_name') 
    model_name = params.get('model_name')
    # Default to EMG for backward compat on this endpoint if not specified
    res = evaluate_saved_model(sensor='EMG', table_name=table_name, model_name=model_name)
    if "error" in res:
        return jsonify(res), 400
    return jsonify(res)

@training_bp.route('/api/model/evaluate/eog', methods=['POST'])
def api_eval_eog():
    params = request.get_json() or {}
    table_name = params.get('table_name')
    model_name = params.get('model_name')
    res = evaluate_saved_eog_model(table_name=table_name, model_name=model_name)
    if "error" in res:
        return jsonify(res), 400
    return jsonify(res)

@training_bp.route('/api/models/emg', methods=['GET'])
def api_list_models():
    """List all saved EMG models (Inlined logic for stability)."""
    try:
        # models = list_saved_models()
        # Inline Listing Logic
        from pathlib import Path
        import json
        
        # Path: src/web/server/routes/training_routes.py -> root is 5 levels up?
        # root/src/web/server/routes
        # Actually simplest is to find 'data' from common anchor?
        # Let's rely on relative path from this file.
        # this_file = .../src/web/server/routes/training_routes.py
        # root is parents[4]
        PROJ_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
        MODELS_DIR = PROJ_ROOT / "frontend" / "public" / "data" / "EMG" / "models"
        
        # Get active model to mark it
        from src.utils.config import config_manager
        active_name = config_manager.get_active_model('EMG')
        
        models = []
        if MODELS_DIR.exists():
            all_files = list(MODELS_DIR.glob("*.joblib"))
            for p in all_files:
                if p.name.endswith("_scaler.joblib"): continue
                
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
                    "hyperparameters": {k:v for k,v in meta.items() if k not in ["created_at", "accuracy"]},
                    "active": (name == active_name)
                })
            models.sort(key=lambda x: x.get("created_at") or "", reverse=True)
            
        return jsonify(models)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[Training] ❌ Error listing EMG models: {tb}")
        return jsonify({"error": str(e), "traceback": tb}), 500

@training_bp.route('/api/models/eog', methods=['GET'])
def api_list_eog_models():
    """List all saved EOG models."""
    try:
        # Use existing EOG trainer which is known good
        models = list_saved_eog_models()
        return jsonify(models)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[Training] ❌ Error listing EOG models: {tb}")
        return jsonify({"error": str(e), "traceback": tb}), 500

@training_bp.route('/api/models/<sensor>', methods=['GET'])
def api_list_models_generic(sensor):
    """List all saved models for a sensor (Generic Route)."""
    try:
        if sensor.upper() == 'EMG':
            return api_list_models()
        elif sensor.upper() == 'EOG':
            return api_list_eog_models()
        else:
            return jsonify({"error": f"Unknown sensor type {sensor}"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@training_bp.route('/api/models/emg/<model_name>', methods=['DELETE'])
def api_delete_model(model_name):
    """Delete a specific EMG model."""
    try:
        result = delete_model('EMG', model_name)
        if "errors" in result and result["errors"]:
             return jsonify(result), 400 # Partial success or fail
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@training_bp.route('/api/models/eog/<model_name>', methods=['DELETE'])
def api_delete_eog_model(model_name):
    """Delete a specific EOG model."""
    try:
        result = delete_eog_model(model_name)
        if "errors" in result and result["errors"]:
             return jsonify(result), 400 
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@training_bp.route('/api/models/emg/load', methods=['POST'])
def api_load_model():
    """Load a specific EMG model to be active."""
    try:
        params = request.get_json() or {}
        model_name = params.get('model_name')
        if not model_name:
            return jsonify({"error": "model_name required"}), 400
            
        result = load_model('EMG', model_name)
        if "error" in result:
             return jsonify(result), 400
        
        # Update Real-time Detector
        if state.rps_detector:
            print(f"[Training] Reloading RPS Detector with {model_name}")
            state.rps_detector.load_model(model_name, verbose=False)
            
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@training_bp.route('/api/models/eog/load', methods=['POST'])
def api_load_eog_model():
    """Load a specific EOG model to be active."""
    try:
        params = request.get_json() or {}
        model_name = params.get('model_name')
        if not model_name:
            return jsonify({"error": "model_name required"}), 400
            
        result = load_eog_model(model_name)
        if "error" in result:
             return jsonify(result), 400
             
        # Update Persisted Config so Router sees it
        try:
             from src.utils.config import config_manager
             config_manager.set_active_model('EOG', model_name)
             print(f"[Training] Set active EOG model to {model_name}")
        except Exception as e:
             print(f"[Training] Warning: Failed to update config manager: {e}")
            
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@training_bp.route('/api/models/<sensor>/load', methods=['POST'])
def api_load_model_generic(sensor):
    """Load a specific model (Generic)."""
    try:
        params = request.get_json() or {}
        model_name = params.get('model_name')
        if not model_name:
            return jsonify({"error": "model_name required"}), 400

        result = load_model(sensor, model_name)
        if "error" in result:
             return jsonify(result), 400
        
        # Update Real-time Detector
        if sensor.upper() == 'EMG' and state.rps_detector:
             state.rps_detector.load_model(model_name, verbose=False)

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@training_bp.route('/api/model/tree', methods=['POST'])
def api_get_tree():
    """Get a specific tree structure."""
    try:
        params = request.get_json() or {}
        model_name = params.get('model_name')
        tree_index = int(params.get('tree_index', 0))
        # Infer sensor or pass it? For now, we iterate or try EMG default logic if model_name matches active
        # But cleaner to pass sensor if possible. Frontend should send it.
        # Fallback: Try all? 
        # Lets assume frontend sends sensor, or we default to EMG for backward compat.
        sensor = params.get('sensor', 'EMG')
        
        result = get_model_tree_structure(sensor=sensor, model_name=model_name, tree_index=tree_index)
        if "error" in result:
             return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@training_bp.route('/api/window', methods=['POST'])
def api_save_window():
    """Accept a recorded window, save as CSV/DB, compute features and update config thresholds."""
    try:
        from src.calibration.calibration_manager import calibration_manager
        
        payload = request.get_json()
        if not payload:
            return jsonify({"error": "No payload provided"}), 400

        sensor = payload.get('sensor')
        action = payload.get('action')
        samples = payload.get('samples')
        timestamps = payload.get('timestamps', None)

        if sensor is None or action is None or samples is None:
            return jsonify({"error": "Missing required fields: sensor, action, samples"}), 400

        # Compute features
        sr = state.config.get('sampling_rate', 512) if state.config else 512
        features = extract_features_wrapper(sensor, samples, sr)

        ts = time.time()

        # Load config and update thresholds
        cfg = state.config or load_config()
        cfg_features = cfg.setdefault('features', {})
        sensor_features = cfg_features.setdefault(sensor, {})
        
        # Session handling
        session_name = payload.get('session_name', 'Manual_Windows')
        if not session_name: session_name = 'Manual_Windows'
        
        table_name = db_manager.create_session_table(sensor, session_name)
        
        label_map = {
            'Rest': 0, 'Rock': 1, 'Paper': 2, 'Scissors': 3, 
            'SingleBlink': 1, 'DoubleBlink': 2, 
            'Concentration': 1, 'Relaxation': 2,
            'Target 1': 1, 'Target 2': 2, 'Target 3': 3,
            'Target 4': 4, 'Target 5': 5, 'Target 6': 6
        }
        label_int = label_map.get(action, -1)
        if label_int == -1 and action.isdigit():
             label_int = int(action)
        if label_int == -1: label_int = 0
        
        if sensor.upper() == 'EMG':
            db_manager.insert_window(features, label_int, session_id=str(int(ts)), table_name=table_name)
        elif sensor.upper() == 'EOG':
            db_manager.insert_eog_window(features, label_int, session_id=str(int(ts)), table_name=table_name)

        # Update Config Logic (Auto-Calibration on fly)
        action_entry = sensor_features.setdefault(action, {})
        updated = {}

        for k, val in features.items():
            old_range = action_entry.get(k)
            if isinstance(old_range, list) and len(old_range) == 2:
                lo, hi = float(old_range[0]), float(old_range[1])
                new_lo = min(lo, val)
                new_hi = max(hi, val)
                action_entry[k] = [new_lo, new_hi]
                updated[k] = [new_lo, new_hi]
            else:
                if val == 0:
                    new_lo, new_hi = 0.0, 0.0
                else:
                    new_lo = val * 0.9
                    new_hi = val * 1.1
                action_entry[k] = [new_lo, new_hi]
                updated[k] = [new_lo, new_hi]

        # Disable saving config to disk on EVERY window to prevent Continuous Reload loops
        # save_success = save_config(cfg)
        save_success = True
        
        # --- PREDICTION / DETECTION LOGIC ---
        detected = False
        predicted_label = "Unknown"
        
        # 1. Try ML Model first (Priority for EMG)
        if sensor.upper() == 'EMG' and state.rps_detector:
            try:
                # Use stateless prediction for test windows
                pred_label, pred_conf = state.rps_detector.predict_instant(features)
                
                # If confidence is reasonable, use it
                if pred_label != "Unknown" and pred_conf > 0.4:
                    predicted_label = pred_label
                    # Match if label matches action
                    detected = (predicted_label == action)
                else:
                    predicted_label = "Rest" if pred_label == "Rest" else "Unknown"
                    detected = False
                    
            except Exception as e:
                print(f"[Training] ML params prediction failed: {e}")
                
        # 2. Try Threshold Detection (Fallback or for EOG/EEG)
        # If we didn't get a confident ML prediction (or simpler sensor)
        if predicted_label == "Unknown" or sensor.upper() != 'EMG':
             is_det = calibration_manager.detect_signal(sensor, action, features, cfg)
             detected = is_det
             if detected:
                 predicted_label = action
             else:
                 # If we already have a prediction (e.g. from EMG low conf), keep it or overwrite?
                 # ideally for EOG/EEG if validation fails, it's "Rest" or "Miss"
                 if predicted_label == "Unknown": saved_pred = "Rest"
                 else: saved_pred = predicted_label
                 predicted_label = saved_pred

        result = {
            "status": "saved",
            "features": features,
            "config_updated": save_success,
            "db_table": table_name,
            "detected": detected,
            "predicted_label": predicted_label
        }

        try:
            socketio.emit('window_saved', {"sensor": sensor, "action": action, "features": features})
        except Exception:
            pass

        print(f"[Training] 💾 Window saved to DB: {table_name}. Prediction: {predicted_label} (Match: {detected})")
        return jsonify(result)

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[Training] ❌ Error saving window: {tb}")
        return jsonify({"error": str(e), "traceback": tb}), 500


@training_bp.route('/api/calibrate', methods=['POST'])
def api_calibrate():
    """Calibrate detection thresholds based on collected windows."""
    try:
        payload = request.get_json()
        if not payload:
            return jsonify({"error": "No payload provided"}), 400
        
        sensor = payload.get('sensor')
        windows = payload.get('windows', [])
        
        if not sensor or not windows:
            return jsonify({"error": "Missing sensor or windows"}), 400
        
        windows_by_action = {}
        for w in windows:
            action = w.get('action') or w.get('label') # Support both
            features = w.get('features', {})
            if action and features:
                if action not in windows_by_action:
                    windows_by_action[action] = []
                windows_by_action[action].append({
                    'features': features,
                    'status': w.get('status', 'unknown')
                })
        
        if not windows_by_action:
            return jsonify({"error": "No valid windows with features found"}), 400
        
        total_before = len(windows)
        correct_before = sum(1 for w in windows if w.get('status') == 'correct')
        accuracy_before = correct_before / total_before if total_before > 0 else 0
        
        updated_thresholds = {}
        samples_per_action = {}
        
        for action, action_windows in windows_by_action.items():
            samples_per_action[action] = len(action_windows)
            
            if len(action_windows) < 3:
                continue
            
            feature_values = {}
            for w in action_windows:
                for feat_name, feat_val in w['features'].items():
                    if isinstance(feat_val, (int, float)):
                        if feat_name not in feature_values:
                            feature_values[feat_name] = []
                        feature_values[feat_name].append(feat_val)
            
            action_thresholds = {}
            for feat_name, values in feature_values.items():
                if len(values) >= 3:
                    sorted_vals = sorted(values)
                    n = len(sorted_vals)
                    idx_lo = max(0, int(n * 0.05))
                    idx_hi = min(n - 1, int(n * 0.95))
                    
                    min_val = sorted_vals[idx_lo]
                    max_val = sorted_vals[idx_hi]
                    
                    margin = (max_val - min_val) * 0.05 if max_val != min_val else abs(min_val) * 0.1
                    action_thresholds[feat_name] = [
                        round(min_val - margin, 4),
                        round(max_val + margin, 4)
                    ]
            
            if action_thresholds:
                updated_thresholds[action] = action_thresholds
        
        cfg = state.config or load_config()
        cfg_features = cfg.setdefault('features', {})
        sensor_features = cfg_features.setdefault(sensor, {})
        
        for action, thresholds in updated_thresholds.items():
            if action not in sensor_features:
                sensor_features[action] = {}
            sensor_features[action].update(thresholds)
        
        # EOG Specific
        if sensor == 'EOG' and 'blink' in updated_thresholds:
            blink_thresh = updated_thresholds['blink']
            if 'duration_ms' in blink_thresh:
                sensor_features['min_duration_ms'] = blink_thresh['duration_ms'][0]
                sensor_features['max_duration_ms'] = blink_thresh['duration_ms'][1]
            if 'asymmetry' in blink_thresh:
                sensor_features['min_asymmetry'] = blink_thresh['asymmetry'][0]
                sensor_features['max_asymmetry'] = blink_thresh['asymmetry'][1]
            if 'kurtosis' in blink_thresh:
                sensor_features['min_kurtosis'] = blink_thresh['kurtosis'][0]
            if 'amplitude' in blink_thresh:
                sensor_features['amp_threshold'] = blink_thresh['amplitude'][0]
        
        save_success = save_config(cfg)
        
        # Simulate after accuracy
        correct_after = 0
        for w in windows:
            action = w.get('action') or w.get('label')
            features = w.get('features', {})
            if action in updated_thresholds:
                match_count = 0
                total_feats = 0
                for feat_name, range_val in updated_thresholds[action].items():
                    if feat_name in features:
                        total_feats += 1
                        if range_val[0] <= features[feat_name] <= range_val[1]:
                            match_count += 1
                if total_feats > 0 and (match_count / total_feats) >= 0.6:
                    correct_after += 1
        
        accuracy_after = correct_after / total_before if total_before > 0 else 0
        
        recommended_samples = {'EOG': 20, 'EMG': 30, 'EEG': 25}.get(sensor, 20)
        
        result = {
            "status": "calibrated",
            "updated_thresholds": updated_thresholds,
            "accuracy_before": round(accuracy_before, 4),
            "accuracy_after": round(accuracy_after, 4),
            "samples_per_action": samples_per_action,
            "recommended_samples": recommended_samples,
            "config_saved": save_success
        }
        
        try:
            socketio.emit('config_updated', {"sensor": sensor})
        except Exception:
            pass
        
        print(f"[Training] 🎯 Calibration complete: {sensor} | Acc: {accuracy_before:.1%} -> {accuracy_after:.1%}")
        return jsonify(result)
    
    except Exception as e:
        print(f"[Training] ❌ Calibration error: {e}")
        return jsonify({"error": str(e)}), 500
