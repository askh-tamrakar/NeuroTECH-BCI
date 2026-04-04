from flask import Blueprint, jsonify, request
import json
import time
import numpy as np
import pandas as pd
from src.server.server.state import state
from src.server.server.config_manager import load_config, save_config
from src.server.server.extensions import socketio
from src.database.db_manager import db_manager
from src.server.server.lsl_service import extract_emg_features, extract_emg_features as extract_features_for_sensor
# Note: original code routed `extract_features_for_sensor` to specific functions.
# We need to reimplement that routing or import it.
# EOG features are also needed.
from src.server.server.lsl_service import extract_eog_features, extract_eeg_features
from scipy import stats as scipy_stats

# Imports for ML logic
from src.learning.emg_trainer import (
    train_emg_model,
    evaluate_saved_model, list_saved_models as list_saved_emg_models, 
    delete_model as delete_emg_model, 
    load_model as load_emg_model, 
    get_model_tree_structure
)
from src.learning.eog_trainer import (
    train_eog_model, 
    evaluate_saved_eog_model, 
    list_saved_models as list_saved_eog_models, 
    delete_model as delete_eog_model, 
    load_model as load_eog_model
)
from src.learning.eeg_lda_trainer import train_eeg_lda_model, evaluate_eeg_lda_model
from src.config.window_config import SESSION_CONFIG
from src.feature.extractors.rps_extractor import EMG_BASE_FEATURES, EMG_FEATURE_COLUMNS

training_bp = Blueprint('training', __name__)

def extract_features_wrapper(sensor: str, samples: list, sr: int = 1000) -> dict:
    """Route to sensor-specific feature extraction."""
    sensor = sensor.upper()
    if sensor == "EMG":
        return extract_emg_features(samples, sr)
    elif sensor == "EOG":
        return extract_eog_features(samples, sr)
    elif sensor == "EEG":
        return extract_eeg_features(samples, sr)
    else:
        return extract_emg_features(samples, sr)

@training_bp.route('/api/train-emg-rf', methods=['POST'])
def api_train_emg():
    try:
        params = request.get_json() or {}
        target_table = params.get('table_name', 'emg_windows')
        
        if target_table == 'ALL':
            target_table = 'emg_windows'

        n_est = int(params.get('n_estimators', 200))
        max_d = params.get('max_depth')
        if max_d == 'None' or max_d is None: max_d = 15
        else: max_d = int(max_d)
        
        # New parameters for splitting and folds
        train_split = float(params.get('train_split', 0.7))
        val_split = float(params.get('val_split', 0.15))
        test_split = float(params.get('test_split', 0.15))
        n_folds = int(params.get('n_folds', 1))
        
        min_impurity_decrease = float(params.get('min_impurity_decrease', 0.0))
        model_name = params.get('model_name', 'emg_rf_model')
        
        result = train_emg_model(
            n_estimators=n_est, 
            max_depth=max_d, 
            min_impurity_decrease=min_impurity_decrease,
            train_split=train_split,
            val_split=val_split,
            test_split=test_split,
            n_folds=n_folds,
            table_name=target_table, 
            model_name=model_name
        )
        if "error" in result:
             return jsonify(result), 400
             
        if state.rps_detector:
             state.rps_detector.load_model(model_name, verbose=False)
             
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@training_bp.route('/api/train-eog-rf', methods=['POST'])
def api_train_eog():
    try:
        params = request.get_json() or {}
        n_est = int(params.get('n_estimators', 100))
        max_d = params.get('max_depth')
        table_name = params.get('table_name') 
        if table_name == 'ALL': table_name = 'eog_windows'
        model_name = params.get('model_name', 'eog_rf')

        if max_d == 'None' or max_d is None: max_d = None
        else: max_d = int(max_d)
        
        train_split = float(params.get('train_split', 0.7))
        val_split = float(params.get('val_split', 0.15))
        test_split = float(params.get('test_split', 0.15))
        n_folds = int(params.get('n_folds', 1))
        
        min_impurity_decrease = float(params.get('min_impurity_decrease', 0.0))
        
        result = train_eog_model(
            n_estimators=n_est, 
            max_depth=max_d, 
            min_impurity_decrease=min_impurity_decrease,
            train_split=train_split,
            val_split=val_split,
            test_split=test_split,
            n_folds=n_folds,
            table_name=table_name or "eog_windows", 
            model_name=model_name
        )
        if "error" in result:
             return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@training_bp.route('/api/train-eeg-lda', methods=['POST'])
def api_train_eeg_lda():
    try:
        params = request.get_json() or {}
        table_name = params.get('table_name', 'eeg_windows')
        if table_name == 'ALL':
            table_name = 'eeg_windows'
        
        train_split = float(params.get('train_split', 0.7))
        val_split = float(params.get('val_split', 0.15))
        test_split = float(params.get('test_split', 0.15))
        n_folds = int(params.get('n_folds', 1))

        model_name = params.get('model_name', 'eeg_lda')
        solver = params.get('solver', 'eigen')
        shrinkage = params.get('shrinkage', 'auto')

        result = train_eeg_lda_model(
            table_name=table_name,
            train_split=train_split,
            val_split=val_split,
            test_split=test_split,
            n_folds=n_folds,
            model_name=model_name,
            solver=solver,
            shrinkage=shrinkage,
        )
        if "error" in result:
            return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@training_bp.route('/api/model/evaluate', methods=['POST'])
def api_eval_emg():
    params = request.get_json() or {}
    table_name = params.get('table_name') or 'emg_windows'
    model_name = params.get('model_name')
    res = evaluate_saved_model(sensor='EMG', table_name=table_name, model_name=model_name)
    if "error" in res:
        return jsonify(res), 200
    return jsonify(res)

@training_bp.route('/api/model/evaluate/eog', methods=['POST'])
def api_eval_eog():
    params = request.get_json() or {}
    table_name = params.get('table_name') or 'eog_windows'
    model_name = params.get('model_name')
    res = evaluate_saved_eog_model(table_name=table_name, model_name=model_name)
    if "error" in res:
        return jsonify(res), 200
    return jsonify(res)

@training_bp.route('/api/model/evaluate/eeg', methods=['POST'])
def api_eval_eeg():
    params = request.get_json() or {}
    table_name = params.get('table_name') or 'eeg_windows'
    model_name = params.get('model_name')
    res = evaluate_eeg_lda_model(table_name=table_name, model_name=model_name)
    if "error" in res:
        return jsonify(res), 200
    return jsonify(res)

@training_bp.route('/api/models/emg', methods=['GET'])
def api_list_emg_models():
    """List all saved EMG models."""
    try:
        models = list_saved_emg_models()
        return jsonify(models)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

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
        print(f"❌ Error listing EOG models: {tb}")
        return jsonify({"error": str(e), "traceback": tb}), 500

@training_bp.route('/api/models/<sensor>', methods=['GET'])
def api_list_models_generic(sensor):
    """List all saved models for a sensor (Generic Route)."""
    try:
        sensor_upper = sensor.upper()
        if sensor_upper == 'EMG':
            return api_list_emg_models()
        elif sensor_upper == 'EOG':
            return api_list_eog_models()
        elif sensor_upper == 'EEG':
            # EEG models are managed via emg_trainer.list_saved_models('EEG') or similar
            # Actually, emg_trainer.py has a generic list_saved_models(sensor)
            return jsonify(list_saved_emg_models('EEG'))
        else:
            return jsonify({"error": f"Unknown sensor type {sensor}"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@training_bp.route('/api/models/emg/<model_name>', methods=['DELETE'])
def api_delete_emg_model_endpoint(model_name):
    """Delete a specific EMG model."""
    try:
        result = delete_emg_model('EMG', model_name)
        if "errors" in result and result["errors"]:
             return jsonify(result), 400 
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


@training_bp.route('/api/emg/calibrate-scaler', methods=['POST'])
def api_calibrate_emg_scaler():
    try:
        from src.calibration.calibration_manager import calibration_manager
        params = request.get_json() or {}
        table_name = params.get('table_name', 'emg_windows')
        model_name = params.get('model_name', 'emg_rf_model')
        if table_name == 'ALL':
            table_name = 'emg_windows'

        conn = db_manager.connect('EMG')
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({"error": f"Table {table_name} not found"}), 404

        rows = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
        conn.close()

        if rows.empty:
            return jsonify({"error": "No EMG rows available for scaler calibration"}), 400

        feature_rows = rows.to_dict(orient='records')
        scaler_path = calibration_manager.calibrate_emg_scaler(feature_rows, model_name=model_name)
        try:
            from src.utils.config import config_manager
            config_manager.set_active_model('EMG', model_name)
            if state.rps_detector:
                state.rps_detector.load_model(model_name, verbose=False)
        except Exception:
            pass
        return jsonify({"status": "success", "table_name": table_name, "scaler_path": scaler_path, "samples": len(feature_rows)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@training_bp.route('/api/eog/calibrate-scaler', methods=['POST'])
def api_calibrate_eog_scaler():
    try:
        from src.calibration.calibration_manager import calibration_manager
        params = request.get_json() or {}
        table_name = params.get('table_name', 'eog_windows')
        model_name = params.get('model_name', 'eog_rf')
        if table_name == 'ALL':
            table_name = 'eog_windows'

        conn = db_manager.connect('EOG')
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({"error": f"Table {table_name} not found"}), 404

        rows = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
        conn.close()

        if rows.empty:
            return jsonify({"error": "No EOG rows available for scaler calibration"}), 400

        feature_rows = rows.to_dict(orient='records')
        scaler_path = calibration_manager.calibrate_eog_scaler(feature_rows, model_name=model_name)
        try:
            from src.utils.config import config_manager
            config_manager.set_active_model('EOG', model_name)
        except Exception:
            pass
        return jsonify({"status": "success", "table_name": table_name, "scaler_path": scaler_path, "samples": len(feature_rows)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@training_bp.route('/api/models/<sensor>/<model_name>', methods=['DELETE'])
def api_delete_model_generic(sensor, model_name):
    """Delete a specific model for any supported sensor."""
    try:
        sensor_upper = sensor.upper()
        if sensor_upper == 'EOG':
            result = delete_eog_model(model_name)
        elif sensor_upper == 'EMG':
            result = delete_emg_model('EMG', model_name)
        elif sensor_upper == 'EEG':
            result = delete_emg_model('EEG', model_name)
        else:
            return jsonify({"error": f"Unsupported sensor {sensor}"}), 400

        if "errors" in result and result["errors"]:
            return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@training_bp.route('/api/models/emg/load', methods=['POST'])
def api_load_emg_model_endpoint():
    """Load a specific EMG model to be active."""
    try:
        params = request.get_json() or {}
        model_name = params.get('model_name')
        if not model_name:
            return jsonify({"error": "model_name required"}), 400
            
        result = load_emg_model('EMG', model_name)
        if "error" in result:
             return jsonify(result), 400
        
        # Update Real-time Detector
        if state.rps_detector:
            print(f"Reloading RPS Detector with {model_name}")
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
             print(f"Set active EOG model to {model_name}")
        except Exception as e:
             print(f"Warning: Failed to update config manager: {e}")
            
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

        sensor_upper = sensor.upper()
        if sensor_upper == 'EOG':
            result = load_eog_model(model_name)
        else:
            result = load_emg_model(sensor_upper, model_name)

        if "error" in result:
             return jsonify(result), 400
        
        # Update Real-time Detector
        if sensor_upper == 'EMG' and state.rps_detector:
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


def _save_window_payload(payload):
    try:
        if not payload:
            return {"error": "No payload provided"}, 400

        sensor = payload.get('sensor')
        action = payload.get('action')
        samples = payload.get('samples')
        metadata = payload.get('metadata', {}) or {}

        if sensor is None or action is None or samples is None:
            return {"error": "Missing required fields: sensor, action, samples"}, 400

        sr = state.config.get('sampling_rate', 1000) if state.config else 1000
        sensor_upper = str(sensor).upper()
        
        # Trial ID management
        trial_id = metadata.get('trial') or f"trial_{int(time.time() * 1000)}"
        
        # EEG Label Mapping (T1-T6)
        if sensor_upper == 'EEG':
            # Map labels like "Target 1" or "Concentration" to "T1", "T2" etc.
            # Frontend should ideally send T1-T6, but we'll try to map common names.
            if action in ["Target 1", "Concentration"]: action = "T1"
            elif action in ["Target 2", "Relaxation"]: action = "T2"
            elif action in ["Target 3"]: action = "T3"
            elif action in ["Target 4"]: action = "T4"
            elif action in ["Target 5"]: action = "T5"
            elif action in ["Target 6"]: action = "T6"
            # If it's already T1-T6, it stays same.

        # Special logic for EMG 1500ms burst (5 overlapping windows)
        sub_windows = []
        if sensor_upper == 'EMG' and len(samples) >= 1500:
            window_len = 900
            stride = 150
            for i in range(5):
                start_idx = i * stride
                end_idx = start_idx + window_len
                sub_samples = samples[start_idx:end_idx]
                sub_windows.append(sub_samples)
        else:
            sub_windows.append(samples)

        session_name = payload.get('session_name', 'Manual_Windows')
        table_name = db_manager.create_session_table(sensor, session_name)
        
        last_result = None
        for i, current_samples in enumerate(sub_windows):
            # Compute features for each sub-window
            if sensor_upper == 'EMG':
                # Use incremental logic for stride? Or just fresh?
                features = extract_emg_features(current_samples, sr)
                features['trial'] = trial_id
                features['window_ms'] = 900.0
                features['session_window_ms'] = 900.0
                features['session_stride_ms'] = 150.0
            elif sensor_upper == 'EEG':
                features = extract_eeg_features(current_samples, sr)
                features['trial'] = trial_id
                features['target_frequency'] = float(metadata.get('targetFrequency', metadata.get('frequency', 0)) or 0)
            else:
                features = extract_features_wrapper(sensor, current_samples, sr)
                if sensor_upper == 'EOG':
                    features['serial_id'] = int(metadata.get('serial_id', 0))

            ts = time.time()
            features['timestamp'] = ts
            features['metadata_json'] = json.dumps(metadata)

            # Insert into DB
            if sensor_upper == 'EMG':
                db_manager.insert_emg_window(features, action, session_id=str(int(ts)), table_name=table_name)
                if "merge" not in table_name.lower():
                    db_manager.insert_emg_window(features, action, session_id=str(int(ts)), table_name="emg_windows")
            elif sensor_upper == 'EOG':
                db_manager.insert_eog_window(features, action, session_id=str(int(ts)), table_name=table_name)
                if "merge" not in table_name.lower():
                    db_manager.insert_eog_window(features, action, session_id=str(int(ts)), table_name="eog_windows")
            elif sensor_upper == 'EEG':
                db_manager.insert_eeg_window(features, action, session_id=str(int(ts)), table_name=table_name)
                if "merge" not in table_name.lower():
                    db_manager.insert_eeg_window(features, action, session_id=str(int(ts)), table_name="eeg_windows")

        final_response = {
            "status": "saved",
            "sensor": sensor_upper,
            "table": table_name,
            "windows_saved": len(sub_windows),
            "trial": trial_id,
        }
        if last_result:
            final_response["features"] = last_result["features"]
            
        return jsonify(final_response)

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"❌ Error saving window: {tb}")
        return jsonify({"error": str(e), "traceback": tb}), 500


@training_bp.route('/api/window', methods=['POST'])
def api_save_window():
    """Accept a recorded window, save as CSV/DB, compute features and update config thresholds."""
    payload = request.get_json()
    response = _save_window_payload(payload)
    if isinstance(response, tuple):
        result, status = response
        return jsonify(result), status
    return response


@training_bp.route('/api/windows/batch', methods=['POST'])
def api_save_windows_batch():
    """Persist multiple windows in one request to reduce collection/save latency."""
    try:
        payload = request.get_json() or {}
        windows = payload.get('windows') or []
        if not windows:
            return jsonify({"error": "No windows provided"}), 400

        shared_sensor = payload.get('sensor')
        shared_session_name = payload.get('session_name') or payload.get('sessionName')
        shared_mode = payload.get('mode')

        results = []
        saved_count = 0
        error_count = 0

        for index, window in enumerate(windows):
            window_payload = dict(window or {})
            if shared_sensor and not window_payload.get('sensor'):
                window_payload['sensor'] = shared_sensor
            if shared_session_name and not (window_payload.get('session_name') or window_payload.get('sessionName')):
                window_payload['session_name'] = shared_session_name
            if shared_mode and not window_payload.get('mode'):
                window_payload['mode'] = shared_mode

            response = _save_window_payload(window_payload)
            if isinstance(response, tuple):
                result, status = response
            else:
                result = response.get_json() if hasattr(response, "get_json") else {"error": "Unknown save response"}
                status = getattr(response, "status_code", 200)
            results.append({
                "index": index,
                "id": window_payload.get('id'),
                **result,
            })
            if status >= 400:
                error_count += 1
            else:
                saved_count += 1

        response_status = 200 if error_count == 0 else (207 if saved_count > 0 else 400)
        response_state = "success" if error_count == 0 else ("partial_success" if saved_count > 0 else "error")
        return jsonify({
            "status": response_state,
            "saved_count": saved_count,
            "error_count": error_count,
            "results": results,
        }), response_status
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        return {"error": str(e), "traceback": tb}, 500


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
        
        print(f"🎯 Calibration complete: {sensor} | Acc: {accuracy_before:.1%} -> {accuracy_after:.1%}")
        return jsonify(result)
    
    except Exception as e:
        print(f"❌ Calibration error: {e}")
        return jsonify({"error": str(e)}), 500
