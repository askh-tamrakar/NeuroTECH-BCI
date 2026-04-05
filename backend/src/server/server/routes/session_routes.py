import json
import uuid
import numpy as np
import time
from fastapi import APIRouter, Body, Query
from fastapi.responses import JSONResponse
from src.server.server.state import state
from src.database.db_manager import db_manager
from src.config.window_config import SESSION_CONFIG, get_window_samples
from src.feature.extractors.rps_extractor import EMG_FEATURE_COLUMNS
# from src.server.server.lsl_service import extract_emg_features # If needed for saving EMG buffer
# Import extract_emg_features from lsl_service to avoid duplication if possible, 
# but lsl_service.py has it.
from src.server.server.lsl_service import extract_emg_features, extract_eog_features, extract_eeg_features

session_bp = APIRouter()

EMG_COLLECTION_GAP_MS = 500.0
EMG_BURST_WINDOWS = 5
EMG_BURST_STRIDE_MS = 150.0


def _json(payload, status_code: int = 200):
    if status_code == 200:
        return payload
    return JSONResponse(content=payload, status_code=status_code)


def _normalize_eeg_label(label):
    raw = str(label).strip()
    lowered = raw.lower()
    mapping = {
        'rest': 0,
        '0': 0,
        't1': 1,
        'target 1': 1,
        '1': 1,
        't2': 2,
        'target 2': 2,
        '2': 2,
        't3': 3,
        'target 3': 3,
        '3': 3,
        't4': 4,
        'target 4': 4,
        '4': 4,
        't5': 5,
        'target 5': 5,
        '5': 5,
        't6': 6,
        'target 6': 6,
        '6': 6,
    }
    return mapping.get(lowered, 0)


def _emg_burst_sizes(sr: float, window_ms: float) -> tuple[int, int, int]:
    window_size = max(1, int((window_ms / 1000.0) * sr))
    stride_size = max(1, int((EMG_BURST_STRIDE_MS / 1000.0) * sr))
    capture_size = window_size + stride_size * (EMG_BURST_WINDOWS - 1)
    return window_size, stride_size, capture_size


def _resolve_sampling_rate():
    return float((state.config or {}).get('sampling_rate') or state.sr or SESSION_CONFIG["sampling_rate"])


def _normalize_collection_context(sensor_type, payload=None):
    payload = payload or {}
    sensor = str(sensor_type).upper()
    sampling_rate = float(payload.get('sampling_rate') or _resolve_sampling_rate())
    has_requested_window = any(key in payload for key in ('window_duration_ms', 'window_ms'))
    has_requested_overlap = 'overlap' in payload or 'session_overlap' in payload
    has_requested_gap = 'gap_duration_ms' in payload or 'gap_ms' in payload
    has_requested_stride = 'stride_ms' in payload or 'session_stride_ms' in payload

    requested_window_ms = float(payload.get('window_duration_ms') or payload.get('window_ms') or 0)
    requested_overlap = float(payload.get('overlap') if 'overlap' in payload else payload.get('session_overlap') or 0)
    requested_gap_ms = float(payload.get('gap_duration_ms') if 'gap_duration_ms' in payload else payload.get('gap_ms') or 0)
    requested_stride_ms = float(payload.get('stride_ms') if 'stride_ms' in payload else payload.get('session_stride_ms') or 0)

    if sensor == 'EMG':
        window_ms = requested_window_ms if has_requested_window and requested_window_ms > 0 else float(SESSION_CONFIG["window_ms"])
        overlap = requested_overlap if has_requested_overlap else float(SESSION_CONFIG.get("overlap", 0.0))
        gap_ms = requested_gap_ms if has_requested_gap else EMG_COLLECTION_GAP_MS
        stride_ms = requested_stride_ms if has_requested_stride else float(SESSION_CONFIG.get("stride_ms", 0.0) or 0.0)
    else:
        window_ms = requested_window_ms if has_requested_window else 0.0
        overlap = requested_overlap if has_requested_overlap else 0.0
        gap_ms = requested_gap_ms if has_requested_gap else 0.0
        stride_ms = requested_stride_ms if has_requested_stride else 0.0
    if stride_ms <= 0 and window_ms > 0:
        if overlap > 0:
            stride_ms = max(1.0, window_ms * (1.0 - overlap))
        elif gap_ms > 0:
            stride_ms = window_ms + gap_ms
        else:
            stride_ms = window_ms

    return {
        "mode": payload.get('mode', 'collection'),
        "label": payload.get('class_label') or payload.get('label'),
        "session_name": payload.get('session_name', 'Manual_Windows'),
        "sampling_rate": sampling_rate,
        "window_duration_ms": window_ms,
        "overlap": overlap,
        "stride_ms": stride_ms,
        "gap_ms": gap_ms,
        "time_window_ms": float(payload.get('time_window_ms') or payload.get('time_window') or 0),
        "channel_index": int(payload.get('channel_index', payload.get('channel', 0)) or 0),
        "target_frequency": float(payload.get('target_frequency') or payload.get('targetFrequency') or 0),
    }

@session_bp.get('/api/sessions/{sensor_type}')
def api_list_sessions(sensor_type):
    """List available session tables."""
    tables = db_manager.get_session_tables(sensor_type)
    
    # FIX: Frontend expects {"tables": ["table1", "table2", ...]}
    # Previously it returned just list of objects or strings, but frontend checked data.tables
    
    # We return the full table names as strings, as frontend parser handles `_session_` split.
    # We return the full table names as strings, as frontend parser handles `_session_` split.
    return {"tables": tables}


@session_bp.get('/api/sessions/{sensor_type}/{session_name}')
def api_get_session_data(
    sensor_type,
    session_name,
    limit: int | None = Query(default=None),
    offset: int = Query(default=0),
    sortBy: str = Query(default='id'),
    order: str = Query(default='ASC'),
    label: str | None = Query(default=None),
    row_from: str | None = Query(default=None, alias='from'),
    row_to: str | None = Query(default=None, alias='to'),
):
    """Get data rows for a specific session with optional pagination, sorting, and filtering."""
    try:
        # Pagination parameters
        sort_by = sortBy

        # Convert filters to appropriate types if provided
        l_filter = int(label) if label is not None and label != '' else None
        r_from = int(row_from) if row_from is not None and row_from != '' else None
        r_to = int(row_to) if row_to is not None and row_to != '' else None

        data = db_manager.get_session_data(
            sensor_type, session_name, 
            limit=limit, offset=offset,
            sort_by=sort_by, order=order,
            label_filter=l_filter, row_from=r_from, row_to=r_to
        )
        return data
    except ValueError:
        return _json({"error": "Invalid numeric parameters"}, 400)
    except Exception as e:
        return _json({"error": str(e)}, 500)


@session_bp.delete('/api/sessions/{sensor_type}/{session_name}')
def api_delete_session(sensor_type, session_name):
    """Delete a session table."""
    try:
        if db_manager.delete_session_table(sensor_type, session_name):
            # If active session was this one, reset it?
            # The UI should handle clearing local state, server state reset is tricky if it's currently recording.
            # We assume user won't delete ACTIVE recording session without stopping it first.
            return {"status": "deleted", "session": session_name}
        else:
            return _json({"error": "Failed to delete"}, 500)
    except Exception as e:
        return _json({"error": str(e)}, 500)

@session_bp.delete('/api/sessions/{sensor_type}/{session_name}/clear')
def api_clear_session(sensor_type, session_name):
    """Clear all rows from a session without deleting the table."""
    try:
        from src.server.server.state import state
        # If it's the active session, clear in-memory state too
        if getattr(state.session, 'current_table_name', None) == session_name:
            state.session.clear_data(sensor_type.upper())
            
        result = db_manager.clear_table(sensor_type, session_name)
        if result.get("status") == "success":
            return {"status": "cleared", "session": session_name}
        else:
            return _json({"error": result.get("error", "Failed to clear")}, 500)
    except Exception as e:
        return _json({"error": str(e)}, 500)

@session_bp.delete('/api/sessions/{sensor_type}/{session_name}/rows/{row_id}')
def api_delete_session_row(sensor_type, session_name, row_id):
    """Delete a specific row from a session."""
    try:
        # Convert row_id to int
        try:
            r_id = int(row_id)
        except ValueError:
            return _json({"error": "Invalid row ID"}, 400)

        if db_manager.delete_session_row(sensor_type, session_name, r_id):
            return {"status": "deleted", "row_id": r_id}
        else:
            return _json({"error": "Failed to delete row (not found or DB error)"}, 404)
    except Exception as e:
        return _json({"error": str(e)}, 500)

@session_bp.post('/api/sessions/{sensor_type}/{session_name}/rename')
def api_rename_session(sensor_type, session_name, payload: dict | None = Body(default=None)):
    """Rename a session."""
    data = payload or {}
    new_name = data.get('new_name')
    if not new_name:
        return _json({"error": "new_name is required"}, 400)
        
    try:
        if db_manager.rename_session_table(sensor_type, session_name, new_name):
            return {"status": "renamed", "new_name": new_name}
        else:
            return _json({"error": "Failed to rename session"}, 500)
    except Exception as e:
        return _json({"error": str(e)}, 500)

@session_bp.post('/api/sessions/{sensor_type}/merge_multiple')
def api_merge_multiple_sessions(sensor_type, payload: dict | None = Body(default=None)):
    """Merge multiple sessions into a new session."""
    data = payload or {}
    source_sessions = data.get('source_sessions', [])
    target_session = data.get('target_session')
    
    if not source_sessions or not target_session:
        return _json({"error": "source_sessions (list) and target_session are required"}, 400)
        
    try:
        if db_manager.merge_multiple_sessions(sensor_type, source_sessions, target_session):
            return {"status": "merged", "sources": source_sessions, "target": target_session}
        else:
            return _json({"error": "Failed to merge sessions"}, 500)
    except Exception as e:
        return _json({"error": str(e)}, 500)


@session_bp.post('/api/calibration/start')
def api_start_collection(payload: dict | None = Body(default=None)):
    payload = payload or {}
    sensor = str(payload.get('sensor', '')).upper()
    if sensor not in {'EMG', 'EOG', 'EEG'}:
        return _json({"error": "Valid sensor is required"}, 400)

    context = _normalize_collection_context(sensor, payload)
    state.session.start_collection_context(sensor, **context)
    return {"status": "started", "sensor": sensor, "collection_context": context}


@session_bp.post('/api/calibration/stop')
def api_stop_collection(payload: dict | None = Body(default=None)):
    payload = payload or {}
    sensor = str(payload.get('sensor', '')).upper()
    if sensor not in {'EMG', 'EOG', 'EEG'}:
        return _json({"error": "Valid sensor is required"}, 400)

    context = state.session.get_collection_context(sensor)
    state.session.stop_collection_context(sensor)
    return {"status": "stopped", "sensor": sensor, "collection_context": context}

# --- EMG ENDPOINTS ---

@session_bp.post('/api/emg/start')
def api_emg_start(payload: dict | None = Body(default=None)):
    try:
        data = payload or {}
        label = data.get('label', 0) # Default to Rest (0)
        session_name = data.get('session_name', 'DefaultSession')
        
        label_map = {0: 'Rest', 1: 'Rock', 2: 'Paper', 3: 'Scissors'}
        label_str = label_map.get(int(label), f"Unknown_{label}")
        
        state.session.start_recording('EMG', label_str, session_name=session_name)
        return {"status": "started", "label": label_str, "table": state.session.current_table_name}
    except Exception as e:
        return _json({"error": str(e)}, 500)

@session_bp.post('/api/emg/stop')
def api_emg_stop():
    # Capture table name BEFORE stopping
    target_table = state.session.stop_recording() or "emg_windows"
    # We allow processing the buffer now
    # Process and save collected data to DB
    try:
        session_id = str(uuid.uuid4())
        data_store = state.session.data_store['EMG']
        collection_context = state.session.get_collection_context('EMG') or {}
        sr = state.sr or SESSION_CONFIG["sampling_rate"]
        window_ms = float(collection_context.get('window_duration_ms') or SESSION_CONFIG["window_ms"])
        overlap = float(collection_context.get('overlap') or SESSION_CONFIG["overlap"])
        gap_ms = float(collection_context.get('gap_ms') or 0)
        window_size, step_size, capture_size = _emg_burst_sizes(sr, window_ms)

        db_manager.save_session_metadata('EMG', target_table, {
            "sensor": "EMG",
            "table_name": target_table,
            "session_name": state.session.current_session_name,
            "storage_format": "compact_emg_v2",
            "feature_columns": EMG_FEATURE_COLUMNS,
            "training_window_ms": float(window_ms),
            "capture_window_ms": float((capture_size / sr) * 1000.0),
            "sampling_rate": float(sr),
            "overlap": float(overlap),
            "stride_ms": float((step_size / sr) * 1000.0),
            "gap_ms": float(gap_ms),
            "channel_index": int(collection_context.get('channel_index', 0) or 0),
            "source": "backend_session_buffer",
        })
        
        saved_count = 0
        
        for label_str, samples in data_store.items():
            # Paranoid check: ensure we don't do 'if samples'
            if samples is None:
                continue
            if len(samples) < 64:  # Relaxed from 100 to 64 (~0.125s) just to capture *something*
                continue
                
            # Convert label string to int if possible (for DB efficiency/schema)
            label_map = {'Rest': 0, 'Rock': 1, 'Paper': 2, 'Scissors': 3}
            label_int = label_map.get(label_str, -1)
            
            if label_int == -1:
                # 1. Try case-insensitive matching
                label_map_lower = {k.lower(): v for k, v in label_map.items()}
                label_int = label_map_lower.get(label_str.lower(), -1)
                
            if label_int == -1:
                try:
                    label_int = int(label_str)
                except:
                    label_int = -1
                    
            # Convert samples to numpy array
            raw_data = np.array(samples)
            if raw_data.ndim > 1 and raw_data.shape[1] == 1:
                raw_data = raw_data.flatten()
            
            num_samples = len(raw_data)
            if num_samples < capture_size:
                continue
                
            for burst_start in range(0, num_samples - capture_size + 1, capture_size):
                burst = raw_data[burst_start: burst_start + capture_size]
                trial_id = db_manager.next_trial_id('EMG', target_table)
                prev_features = None
                for offset in range(0, capture_size - window_size + 1, step_size):
                    window = burst[offset: offset + window_size]
                    feats = extract_emg_features(window, sr, prev_features=prev_features)
                    feats['trial'] = trial_id
                    feats['timestamp'] = time.time()
                    feats['channel_index'] = int(collection_context.get('channel_index', 0) or 0)
                    feats['sample_count'] = int(len(window))
                    feats['window_ms'] = float((len(window) / sr) * 1000.0)
                    feats['capture_window_ms'] = float((capture_size / sr) * 1000.0)
                    feats['sampling_rate'] = float(sr)
                    feats['session_window_ms'] = float(window_ms)
                    feats['session_overlap'] = float(overlap)
                    feats['session_stride_ms'] = float((step_size / sr) * 1000.0)
                    feats['gap_ms'] = float(gap_ms)
                    feats['source'] = "backend_session_buffer"
                    feats['metadata_json'] = json.dumps({
                        "source": "backend_session_buffer",
                        "mode": collection_context.get('mode', 'buffer_recording'),
                        "label": label_str,
                        "session_name": state.session.current_session_name,
                        "collection_context": collection_context,
                        "trial": trial_id,
                    })
                    prev_features = feats.copy()

                    if db_manager.insert_emg_window(feats, label_int, session_id, table_name=target_table):
                        saved_count += 1
                        if "merge" not in target_table.lower():
                            db_manager.insert_emg_window(feats, label_int, session_id, table_name="emg_windows")
                    
        print(f"💾 Saved {saved_count} EMG windows to {target_table}")
        
        # Finally reset session state
        state.session.reset_recording_state()
        state.session.stop_collection_context('EMG')
        
    except Exception as e:
        import traceback
        tb_str = traceback.format_exc()
        state.session.stop_collection_context('EMG')
        print(f"❌ Error processing EMG session: {tb_str}")
        return _json({"status": "stopped", "error": str(e), "traceback": tb_str, "saved_windows": 0}, 500)

    return {"status": "stopped", "saved_windows": saved_count if 'saved_count' in locals() else 0}

@session_bp.get('/api/emg/status')
def api_emg_status():
    status = state.session.get_status('EMG')
    
    # Remap counts to frontend keys
    label_map_inv = {'Rest': '0', 'Rock': '1', 'Paper': '2', 'Scissors': '3'}
    mapped_counts = {}
    for k, v in status['counts'].items():
        if k in label_map_inv:
            mapped_counts[label_map_inv[k]] = v
        else:
            mapped_counts[k] = v 
            
    # Also map current_label
    curr = status['current_label']
    if curr in label_map_inv:
        status['current_label'] = int(label_map_inv[curr])
        
    status['counts'] = mapped_counts
    return status

@session_bp.delete('/api/emg/data')
def api_emg_clear():
    state.session.clear_data('EMG')
    try:
        conn = db_manager.connect('EMG')
        try:
            conn.execute("DELETE FROM emg_windows")
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        print(f"Failed to clear DB: {e}")
    return {"status": "cleared"}

@session_bp.post('/api/emg/predict/{action}')
def api_emg_predict_toggle(action):
    from src.server.server.config_manager import set_detection_state, get_detection_target
    
    if action == 'start':
        state.session.prediction_active['EMG'] = True
        set_detection_state(True, 'EMG')
    elif action == 'stop':
        state.session.prediction_active['EMG'] = False
        if get_detection_target() == 'EMG':
            set_detection_state(False, None)
        
    return {"status": "ok", "predicting": state.session.prediction_active['EMG']}


# --- EOG ENDPOINTS ---

@session_bp.post('/api/eog/start')
def api_eog_start(payload: dict | None = Body(default=None)):
    try:
        data = payload or {}
        label = data.get('label', 0)
        session_name = data.get('session_name', 'DefaultSession')
        
        state.session.start_recording('EOG', str(label), session_name=session_name)
        return {"status": "started", "label": label, "table": state.session.current_table_name}
    except Exception as e:
        return _json({"error": str(e)}, 500)

@session_bp.post('/api/eog/stop')
def api_eog_stop():
    target_table = state.session.stop_recording() or "eog_windows"
    
    # Process and save EOG data
    try:
        session_id = str(uuid.uuid4())
        data_store = state.session.data_store['EOG']
        saved_count = 0
        
        for label_str, samples in data_store.items():
            if len(samples) < 50:
                continue

            try:
                label_int = int(label_str)
            except:
                continue
                
            raw_data = np.array(samples)
            if raw_data.ndim > 1:
                raw_data = raw_data.flatten()
                
            sr = state.sr or 1000
            window_size = int(sr * 0.6) # 600ms to capture full blink
            step_size = int(window_size * 0.5)
            serial_id = db_manager.next_serial_id(target_table)
            
            for i in range(0, len(raw_data) - window_size + 1, step_size):
                window = raw_data[i : i + window_size]
                
                # Extract
                feats = extract_eog_features(window, sr)
                feats['timestamp'] = time.time()
                feats['serial_id'] = serial_id
                
                if db_manager.insert_eog_window(feats, label_int, session_id, table_name=target_table):
                    saved_count += 1
                    # Also append to global table if not a merged session
                    if "merge" not in target_table.lower():
                        db_manager.insert_eog_window(feats, label_int, session_id, table_name="eog_windows")

        print(f"💾 Saved {saved_count} EOG windows to {target_table}")
        state.session.reset_recording_state()
        
    except Exception as e:
        print(f"❌ Error processing EOG session: {e}")

    return {"status": "stopped", "saved_windows": saved_count if 'saved_count' in locals() else 0}

@session_bp.get('/api/eog/status')
def api_eog_status():
    return state.session.get_status('EOG')

@session_bp.delete('/api/eog/data')
def api_eog_clear():
    state.session.clear_data('EOG')
    return {"status": "cleared"}

@session_bp.post('/api/eog/predict/{action}')
def api_eog_predict_toggle(action):
    from src.server.server.config_manager import set_detection_state, get_detection_target

    if action == 'start':
        state.session.prediction_active['EOG'] = True
        set_detection_state(True, 'EOG')
    elif action == 'stop':
        state.session.prediction_active['EOG'] = False
        if get_detection_target() == 'EOG':
            set_detection_state(False, None)
    return {"status": "ok", "predicting": state.session.prediction_active['EOG']}


# --- EEG ENDPOINTS ---

@session_bp.post('/api/eeg/start')
def api_eeg_start(payload: dict | None = Body(default=None)):
    try:
        data = payload or {}
        label = data.get('label', 0)
        session_name = data.get('session_name', 'DefaultSession')
        
        state.session.start_recording('EEG', str(label), session_name=session_name)
        return {"status": "started", "label": label, "table": state.session.current_table_name}
    except Exception as e:
        return _json({"error": str(e)}, 500)

@session_bp.post('/api/eeg/stop')
def api_eeg_stop():
    target_table = state.session.stop_recording() or "eeg_windows"
    
    # Process and save EEG data
    try:
        session_id = str(uuid.uuid4())
        data_store = state.session.data_store['EEG']
        saved_count = 0
        eeg_cfg = (state.config or {}).get('features', {}).get('EEG', {})
        channel_mapping = (state.config or {}).get('channel_mapping', {})
        collection_context = state.session.get_collection_context('EEG') or {}
        session_target_frequency = float(collection_context.get('target_frequency') or 0)
        eeg_channel_index = 0
        for channel_key, channel_info in channel_mapping.items():
            if str(channel_info.get('sensor', '')).upper() == 'EEG':
                try:
                    eeg_channel_index = int(str(channel_key).replace('ch', ''))
                except Exception:
                    eeg_channel_index = 0
                break
        
        for label_str, samples in data_store.items():
            if len(samples) < 50:
                continue

            label_int = _normalize_eeg_label(label_str)
                
            raw_data = np.array(samples)
            
            sr = state.sr or 1000
            window_size = max(1, int(sr * float(eeg_cfg.get('window_len_sec', 1.5))))
            step_size = max(1, int(sr * float(eeg_cfg.get('step_sec', 0.25))))
            trial_id = db_manager.next_trial_id('EEG', target_table)
            db_manager.save_session_metadata('EEG', target_table, {
                "sensor": "EEG",
                "table_name": target_table,
                "session_name": target_table,
                "storage_format": "compact_eeg_v1",
                "channel_index": eeg_channel_index,
                "sample_count": window_size,
                "sampling_rate": float(sr),
                "window_ms": float((window_size / sr) * 1000.0),
                "target_frequency": session_target_frequency,
                "source": "session_stop",
            })
            
            for i in range(0, len(raw_data) - window_size + 1, step_size):
                window = raw_data[i : i + window_size]
                
                # Extract
                feats = extract_eeg_features(window, sr)
                feats['trial'] = trial_id
                feats['timestamp'] = time.time()
                feats['sample_count'] = int(len(window))
                feats['window_ms'] = float((len(window) / sr) * 1000.0)
                feats['channel_index'] = eeg_channel_index
                feats['target_frequency'] = session_target_frequency
                
                if db_manager.insert_eeg_window(feats, label_int, session_id, table_name=target_table):
                    saved_count += 1
                    # Also append to global table if not a merged session
                    if "merge" not in target_table.lower():
                        db_manager.insert_eeg_window(feats, label_int, session_id, table_name="eeg_windows")

        print(f"💾 Saved {saved_count} EEG windows to {target_table}")
        state.session.reset_recording_state()
        
    except Exception as e:
        print(f"❌ Error processing EEG session: {e}")

    return {"status": "stopped", "saved_windows": saved_count if 'saved_count' in locals() else 0}

@session_bp.get('/api/eeg/status')
def api_eeg_status():
    return state.session.get_status('EEG')

@session_bp.delete('/api/eeg/data')
def api_eeg_clear():
    state.session.clear_data('EEG')
    return {"status": "cleared"}


@session_bp.post('/api/eeg/predict/{action}')
def api_eeg_predict_toggle(action):
    from src.server.server.config_manager import set_detection_state, get_detection_target

    if action == 'start':
        state.session.prediction_active['EEG'] = True
        set_detection_state(True, 'EEG')
    elif action == 'stop':
        state.session.prediction_active['EEG'] = False
        if get_detection_target() == 'EEG':
            set_detection_state(False, None)
    return {"status": "ok", "predicting": state.session.prediction_active['EEG']}


@session_bp.post('/api/detectors/predict/{action}')
def api_all_predict_toggle(action):
    from src.server.server.config_manager import set_detection_state, get_detection_target

    if action == 'start':
        state.session.prediction_active['EMG'] = True
        state.session.prediction_active['EOG'] = True
        state.session.prediction_active['EEG'] = True
        set_detection_state(True, 'ALL')
    elif action == 'stop':
        state.session.prediction_active['EMG'] = False
        state.session.prediction_active['EOG'] = False
        state.session.prediction_active['EEG'] = False
        if get_detection_target() == 'ALL':
            set_detection_state(False, None)

    return {
        "status": "ok",
        "predicting": {
            "EMG": state.session.prediction_active['EMG'],
            "EOG": state.session.prediction_active['EOG'],
            "EEG": state.session.prediction_active['EEG'],
        },
        "target": "ALL" if action == 'start' else None,
    }
