from flask import Blueprint, jsonify, request
import json
import time
import threading
import uuid
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
    evaluate_saved_model, list_saved_models, delete_model, load_model, get_model_tree_structure
)
from src.learning.eog_trainer import (
    train_eog_model, evaluate_saved_eog_model, 
    list_saved_models as list_saved_eog_models, 
    delete_model as delete_eog_model, 
    load_model as load_eog_model
)
from src.learning.eeg_lda_trainer import train_eeg_lda_model, evaluate_eeg_lda_model
from src.config.window_config import SESSION_CONFIG
from src.feature.extractors.rps_extractor import EMG_BASE_FEATURES, EMG_FEATURE_COLUMNS
from src.utils.trial_utils import get_next_trial_id

training_bp = Blueprint('training', __name__)
TRAINING_JOBS = {}
TRAINING_JOBS_LOCK = threading.Lock()


def _safe_int(value, default=None):
    if value in (None, "", "None", "null", "undefined"):
        return default
    return int(value)


def _safe_float(value, default=None):
    if value in (None, "", "None", "null", "undefined"):
        return default
    return float(value)


def _resolve_eeg_target_frequency(label_value, metadata=None):
    metadata = metadata or {}
    explicit = (
        metadata.get('targetFrequency')
        or metadata.get('target_frequency')
        or metadata.get('frequency')
    )
    if explicit not in (None, "", "None", "null", "undefined"):
        return float(explicit)

    cfg = state.config or load_config()
    eeg_cfg = cfg.get('features', {}).get('EEG', {})
    target_freqs = [float(freq) for freq in eeg_cfg.get('target_freqs', [8, 9, 12, 14.4, 16, 18])]

    if label_value in (None, "", "Rest", "rest", 0, "0"):
        return 0.0

    try:
        label_int = int(label_value)
    except Exception:
        label_str = str(label_value).strip().lower()
        if label_str.startswith('target '):
            try:
                label_int = int(label_str.split()[-1])
            except Exception:
                return 0.0
        else:
            return 0.0

    if 0 < label_int <= len(target_freqs):
        return float(target_freqs[label_int - 1])
    return 0.0


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


def _update_training_job(job_id: str, **fields):
    with TRAINING_JOBS_LOCK:
        job = TRAINING_JOBS.get(job_id)
        if not job:
            return
        
        history_item = fields.pop("history_item", None)
        if history_item:
            if "history" not in job:
                job["history"] = []
            job["history"].append(history_item)
            
        job.update(fields)
        if "progress" in fields:
            job["updated_at"] = time.time()


def _launch_training_job(sensor: str, params: dict, trainer_fn):
    sensor = sensor.upper()
    job_id = str(uuid.uuid4())
    with TRAINING_JOBS_LOCK:
        TRAINING_JOBS[job_id] = {
            "job_id": job_id,
            "sensor": sensor,
            "status": "running",
            "stage": "queued",
            "progress": 0.0,
            "completed_steps": 0,
            "total_steps": 0,
            "candidate_index": 0,
            "total_candidates": 0,
            "fold_index": 0,
            "total_folds": int(params.get("k_folds", 5) or 5),
            "started_at": time.time(),
            "updated_at": time.time(),
            "result": None,
            "error": None,
            "history": [],
        }

    def progress_callback(payload):
        _update_training_job(job_id, **payload)

    def runner():
        try:
            result = trainer_fn(progress_callback=progress_callback, **params)
            if "error" in result:
                _update_training_job(job_id, status="error", error=result["error"], result=result, progress=1.0)
                return
            if sensor == "EMG" and state.rps_detector:
                state.rps_detector.load_model(result.get("model_name"), verbose=False)
            _update_training_job(job_id, status="completed", stage="completed", progress=1.0, result=result)
        except Exception as exc:
            _update_training_job(job_id, status="error", error=str(exc), progress=1.0)

    thread = threading.Thread(target=runner, daemon=True)
    thread.start()
    return {"status": "started", "job_id": job_id, "sensor": sensor}


@training_bp.route('/api/train-jobs/<job_id>', methods=['GET'])
def api_get_training_job(job_id):
    with TRAINING_JOBS_LOCK:
        job = TRAINING_JOBS.get(job_id)
        if not job:
            return jsonify({"error": "Training job not found"}), 404
        payload = dict(job)
    elapsed = max(0.0, time.time() - payload.get("started_at", time.time()))
    progress = float(payload.get("progress") or 0.0)
    eta_seconds = None
    if progress > 0 and progress < 1:
        eta_seconds = max(0.0, (elapsed / progress) - elapsed)
    payload["elapsed_seconds"] = elapsed
    payload["eta_seconds"] = eta_seconds
    return jsonify(payload)

@training_bp.route('/api/train-emg-rf', methods=['POST'])
def api_train_emg():
    try:
        params = request.get_json() or {}
        max_d = params.get('max_depth')
        launch_payload = {
            "n_estimators": _safe_int(params.get('n_estimators', 200), 200),
            "max_depth": _safe_int(max_d, 15),
            "min_impurity_decrease": _safe_float(params.get('min_impurity_decrease', 0.0), 0.0),
            "table_name": params.get('table_name', 'emg_windows'),
            "model_name": params.get('model_name', 'emg_rf_model'),
            "train_ratio": _safe_float(params.get('train_ratio', 0.7), 0.7),
            "val_ratio": _safe_float(params.get('val_ratio', 0.15), 0.15),
            "test_ratio": _safe_float(params.get('test_ratio', 0.15), 0.15),
            "k_folds": _safe_int(params.get('k_folds', 5), 5),
            "random_state": _safe_int(params.get('random_state', 42), 42),
            "n_estimators_min": _safe_int(params.get('n_estimators_min')),
            "n_estimators_max": _safe_int(params.get('n_estimators_max')),
            "max_depth_min": _safe_int(params.get('max_depth_min')),
            "max_depth_max": _safe_int(params.get('max_depth_max')),
            "min_impurity_decrease_min": _safe_float(params.get('min_impurity_decrease_min')),
            "min_impurity_decrease_max": _safe_float(params.get('min_impurity_decrease_max')),
            "criterion": params.get('criterion', 'gini'),
            "max_features": params.get('max_features', 'sqrt'),
            "search_resolution": _safe_int(params.get('search_resolution', 3), 3),
        }
        return jsonify(_launch_training_job('EMG', launch_payload, train_emg_model)), 202
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@training_bp.route('/api/train-eog-rf', methods=['POST'])
def api_train_eog():
    try:
        params = request.get_json() or {}
        max_d = params.get('max_depth')
        launch_payload = {
            "n_estimators": _safe_int(params.get('n_estimators', 100), 100),
            "max_depth": _safe_int(max_d, None),
            "min_impurity_decrease": _safe_float(params.get('min_impurity_decrease', 0.0), 0.0),
            "table_name": params.get('table_name', 'eog_windows'),
            "model_name": params.get('model_name', 'eog_rf'),
            "train_ratio": _safe_float(params.get('train_ratio', 0.7), 0.7),
            "val_ratio": _safe_float(params.get('val_ratio', 0.15), 0.15),
            "test_ratio": _safe_float(params.get('test_ratio', 0.15), 0.15),
            "k_folds": _safe_int(params.get('k_folds', 5), 5),
            "random_state": _safe_int(params.get('random_state', 42), 42),
            "n_estimators_min": _safe_int(params.get('n_estimators_min')),
            "n_estimators_max": _safe_int(params.get('n_estimators_max')),
            "max_depth_min": _safe_int(params.get('max_depth_min')),
            "max_depth_max": _safe_int(params.get('max_depth_max')),
            "min_impurity_decrease_min": _safe_float(params.get('min_impurity_decrease_min')),
            "min_impurity_decrease_max": _safe_float(params.get('min_impurity_decrease_max')),
            "criterion": params.get('criterion', 'gini'),
            "max_features": params.get('max_features', 'sqrt'),
            "search_resolution": _safe_int(params.get('search_resolution', 3), 3),
        }
        return jsonify(_launch_training_job('EOG', launch_payload, train_eog_model)), 202
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@training_bp.route('/api/train-eeg-lda', methods=['POST'])
def api_train_eeg_lda():
    try:
        params = request.get_json() or {}
        launch_payload = {
            "table_name": params.get('table_name', 'eeg_windows'),
            "model_name": params.get('model_name', 'eeg_lda'),
            "solver": params.get('solver', 'eigen'),
            "shrinkage": params.get('shrinkage', 'auto'),
            "train_ratio": _safe_float(params.get('train_ratio', 0.7), 0.7),
            "val_ratio": _safe_float(params.get('val_ratio', 0.15), 0.15),
            "test_ratio": _safe_float(params.get('test_ratio', 0.15), 0.15),
            "k_folds": _safe_int(params.get('k_folds', 5), 5),
            "random_state": _safe_int(params.get('random_state', 42), 42),
            "tol": _safe_float(params.get('tol', 0.0001), 0.0001),
            "tol_min": _safe_float(params.get('tol_min')),
            "tol_max": _safe_float(params.get('tol_max')),
            "search_resolution": _safe_int(params.get('search_resolution', 3), 3),
        }
        return jsonify(_launch_training_job('EEG', launch_payload, train_eeg_lda_model)), 202
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
        # Return 200 for evaluation errors (like "no model") to avoid console spam.
        # The frontend handles the 'error' key in the JSON payload.
        return jsonify(res), 200
    return jsonify(res)

@training_bp.route('/api/model/evaluate/eog', methods=['POST'])
def api_eval_eog():
    params = request.get_json() or {}
    table_name = params.get('table_name')
    model_name = params.get('model_name')
    res = evaluate_saved_eog_model(table_name=table_name, model_name=model_name)
    if "error" in res:
        return jsonify(res), 200
    return jsonify(res)

@training_bp.route('/api/model/evaluate/eeg', methods=['POST'])
def api_eval_eeg():
    params = request.get_json() or {}
    table_name = params.get('table_name')
    model_name = params.get('model_name')
    res = evaluate_eeg_lda_model(table_name=table_name, model_name=model_name)
    if "error" in res:
        return jsonify(res), 200
    return jsonify(res)

@training_bp.route('/api/models/emg', methods=['GET'])
def api_list_models():
    """List all saved EMG models (Inlined logic for stability)."""
    try:
        # models = list_saved_models()
        # Inline Listing Logic
        import json
        from src.utils.paths import get_models_dir
        
        MODELS_DIR = get_models_dir('EMG')
        
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
                    "accuracy": meta.get("test_accuracy", meta.get("accuracy")),
                    "hyperparameters": {k:v for k,v in meta.items() if k not in ["created_at", "accuracy"]},
                    "training_duration_seconds": meta.get("training_duration_seconds"),
                    "total_candidates": meta.get("total_candidates"),
                    "total_models": meta.get("total_models"),
                    "k_folds": meta.get("k_folds"),
                    "active": (name == active_name)
                })
            models.sort(key=lambda x: x.get("created_at") or "", reverse=True)
            
        return jsonify(models)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"❌ Error listing EMG models: {tb}")
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
        print(f"❌ Error listing EOG models: {tb}")
        return jsonify({"error": str(e), "traceback": tb}), 500

@training_bp.route('/api/models/<sensor>', methods=['GET'])
def api_list_models_generic(sensor):
    """List all saved models for a sensor (Generic Route)."""
    try:
        if sensor.upper() == 'EMG':
            return api_list_models()
        elif sensor.upper() == 'EOG':
            return api_list_eog_models()
        elif sensor.upper() == 'EEG':
            return jsonify(list_saved_models('EEG'))
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
        else:
            result = delete_model(sensor_upper, model_name)
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


def _save_window_payload(payload):
    try:
        if not payload:
            return {"error": "No payload provided"}, 400

        sensor = payload.get('sensor')
        action = payload.get('action')
        samples = payload.get('samples')
        timestamps = payload.get('timestamps', None)
        metadata = payload.get('metadata', {}) or {}

        if sensor is None or action is None or samples is None:
            return {"error": "Missing required fields: sensor, action, samples"}, 400

        sr = state.config.get('sampling_rate', 1000) if state.config else 1000
        sensor_upper = str(sensor).upper()
        collection_context = state.session.get_collection_context(sensor_upper) if hasattr(state.session, 'get_collection_context') else None
        effective_metadata = dict(collection_context or {})
        effective_metadata.update(metadata)
        if sensor_upper in {'EMG', 'EEG'} and not effective_metadata.get('trial_id'):
            effective_metadata['trial_id'] = payload.get('trial_id') or payload.get('trial_group_id') or get_next_trial_id()
        collection_mode = str(
            effective_metadata.get('collectionMode')
            or effective_metadata.get('mode')
            or 'collection'
        ).lower()

        # Compute features
        if sensor_upper == 'EMG':
            prev_features = None
            if hasattr(state.session, 'get_collection_runtime_value') and collection_mode == 'collection':
                prev_features = state.session.get_collection_runtime_value('EMG', 'prev_features')
            features = extract_emg_features(samples, sr, prev_features=prev_features)
            if features and hasattr(state.session, 'set_collection_runtime_value') and collection_mode == 'collection':
                state.session.set_collection_runtime_value(
                    'EMG',
                    'prev_features',
                    {key: features.get(key, 0.0) for key in EMG_BASE_FEATURES}
                )
        else:
            features = extract_features_wrapper(sensor, samples, sr)

        if not features:
            return {"error": "Feature extraction failed"}, 400

        if sensor_upper == 'EMG':
            window_ms = float(effective_metadata.get('windowMs', effective_metadata.get('window_duration_ms', SESSION_CONFIG["window_ms"])) or SESSION_CONFIG["window_ms"])
            overlap = float(effective_metadata.get('sessionOverlap', effective_metadata.get('overlap', 0.0)) or 0.0)
            stride_ms = float(
                effective_metadata.get('strideMs', effective_metadata.get('session_stride_ms', 0)) or 0
            )
            gap_ms = float(effective_metadata.get('gapMs', effective_metadata.get('gap_ms', 500.0)) or 500.0)
            if stride_ms <= 0:
                stride_ms = window_ms * (1.0 - overlap) if overlap > 0 else window_ms + gap_ms

            features['channel_index'] = int(effective_metadata.get('channelIndex', effective_metadata.get('channel_index', payload.get('channel', 0))) or 0)
            features['sample_count'] = int(effective_metadata.get('sampleCount', len(samples)) or len(samples))
            features['window_ms'] = float(window_ms)
            features['sampling_rate'] = float(effective_metadata.get('samplingRate', effective_metadata.get('sampling_rate', sr)) or sr)
            features['session_window_ms'] = float(effective_metadata.get('sessionWindowMs', effective_metadata.get('window_duration_ms', window_ms)) or window_ms)
            features['session_overlap'] = float(overlap)
            features['session_stride_ms'] = float(stride_ms)
            features['gap_ms'] = float(gap_ms)
            features['metadata_json'] = json.dumps(effective_metadata)
            features['source'] = str(effective_metadata.get('source', 'manual_window'))
            features['trial_id'] = str(effective_metadata.get('trial_id', ''))
        elif sensor_upper == 'EEG':
            features['target_frequency'] = _resolve_eeg_target_frequency(action, effective_metadata)
            features['channel_index'] = int(effective_metadata.get('channelIndex', payload.get('channel', 0)) or 0)
            features['sample_count'] = int(effective_metadata.get('sampleCount', len(samples)) or len(samples))
            features['window_ms'] = float(effective_metadata.get('windowMs', (len(samples) / sr) * 1000.0) or 0)
            effective_metadata['target_frequency'] = float(features['target_frequency'])
            features['metadata_json'] = json.dumps(effective_metadata)
            features['trial_id'] = str(effective_metadata.get('trial_id', ''))

        ts = time.time()
        features['timestamp'] = ts

        # Load config and update thresholds
        cfg = state.config or load_config()
        cfg_features = cfg.setdefault('features', {})
        sensor_features = cfg_features.setdefault(sensor, {})
        
        # Session handling
        session_name = payload.get('session_name', 'Manual_Windows')
        if not session_name: session_name = 'Manual_Windows'
        
        table_name = db_manager.create_session_table(sensor, session_name)
        if sensor_upper == 'EMG':
            db_manager.save_session_metadata('EMG', table_name, {
                "sensor": "EMG",
                "table_name": table_name,
                "session_name": session_name,
                "storage_format": "compact_emg_v2",
                "feature_columns": EMG_FEATURE_COLUMNS,
                "training_window_ms": float(features.get('session_window_ms', SESSION_CONFIG["window_ms"])),
                "capture_window_ms": float(features.get('window_ms', SESSION_CONFIG["window_ms"])),
                "sampling_rate": float(features.get('sampling_rate', sr)),
                "overlap": float(features.get('session_overlap', 0.0)),
                "stride_ms": float(features.get('session_stride_ms', 0.0)),
                "gap_ms": float(features.get('gap_ms', 0.0)),
                "channel_index": int(features.get('channel_index', 0) or 0),
                "source": str(effective_metadata.get('source', 'frontend_auto_window')),
            })
        elif sensor_upper == 'EOG':
            window_ms = float(effective_metadata.get('windowMs', (len(samples) / sr) * 1000.0) or 0)
            db_manager.save_session_metadata('EOG', table_name, {
                "sensor": "EOG",
                "table_name": table_name,
                "session_name": session_name,
                "window_ms": window_ms,
                "stride_ms": window_ms,
                "overlap": 0.0,
                "sampling_rate": float(effective_metadata.get('samplingRate', effective_metadata.get('sampling_rate', sr)) or sr),
                "channel_index": int(effective_metadata.get('channelIndex', effective_metadata.get('channel_index', payload.get('channel', 0))) or 0),
                "source": str(effective_metadata.get('source', 'frontend_auto_window')),
            })
        elif sensor_upper == 'EEG':
            db_manager.save_session_metadata('EEG', table_name, {
                "sensor": "EEG",
                "table_name": table_name,
                "session_name": session_name,
                "window_ms": float(features.get('window_ms', 0.0)),
                "stride_ms": float(features.get('window_ms', 0.0)),
                "sampling_rate": float(effective_metadata.get('samplingRate', effective_metadata.get('sampling_rate', sr)) or sr),
                "channel_index": int(features.get('channel_index', 0) or 0),
                "target_frequency": float(features.get('target_frequency', 0.0) or 0.0),
                "source": str(effective_metadata.get('source', 'frontend_auto_window')),
            })
        
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
        
        if sensor_upper == 'EMG':
            db_manager.insert_window(features, label_int, session_id=str(int(ts)), table_name=table_name)
            # Also insert into the global evaluation table (skip if merged session)
            if "merge" not in table_name.lower():
                db_manager.insert_window(features, label_int, session_id=str(int(ts)), table_name="emg_windows")
        elif sensor_upper == 'EOG':
            db_manager.insert_eog_window(features, label_int, session_id=str(int(ts)), table_name=table_name)
            # Also insert into the global evaluation table (skip if merged session)
            if "merge" not in table_name.lower():
                db_manager.insert_eog_window(features, label_int, session_id=str(int(ts)), table_name="eog_windows")
        elif sensor_upper == 'EEG':
            db_manager.insert_eeg_window(features, label_int, session_id=str(int(ts)), table_name=table_name)
            if "merge" not in table_name.lower():
                db_manager.insert_eeg_window(features, label_int, session_id=str(int(ts)), table_name="eeg_windows")

        # Update Config Logic (Auto-Calibration on fly)
        if sensor_upper != 'EEG':
            action_entry = sensor_features.setdefault(action, {})
            updated = {}

            for k, val in features.items():
                if not isinstance(val, (int, float)):
                    continue
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
        if sensor_upper == 'EMG' and state.rps_detector:
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
                print(f"ML params prediction failed: {e}")
                
        # 2. Try Threshold Detection (Fallback or for EOG/EEG)
        # If we didn't get a confident ML prediction (or simpler sensor)
        if sensor_upper == 'EEG':
            detected = True
            predicted_label = action
        elif predicted_label == "Unknown" or sensor_upper != 'EMG':
             from src.calibration.calibration_manager import calibration_manager
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

        print(f"💾 Window saved to DB: {table_name}. Prediction: {predicted_label} (Match: {detected})")
        return jsonify(result)

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
        shared_trial_id = None
        if str(shared_sensor or '').upper() in {'EMG', 'EEG'}:
            shared_trial_id = payload.get('trial_id') or payload.get('trial_group_id') or get_next_trial_id()

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
            if shared_trial_id and not (window_payload.get('trial_id') or window_payload.get('trial_group_id')):
                window_payload['trial_id'] = shared_trial_id

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
