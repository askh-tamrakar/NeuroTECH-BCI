from flask import Blueprint, jsonify, request
import uuid
import numpy as np
import time
from src.server.server.state import state
from src.database.db_manager import db_manager
# from src.server.server.lsl_service import extract_emg_features # If needed for saving EMG buffer
# Import extract_emg_features from lsl_service to avoid duplication if possible, 
# but lsl_service.py has it.
from src.server.server.lsl_service import extract_emg_features, extract_eog_features # Assume we export this
from src.config.window_config import compute_sub_window_params, split_parent_into_sub_windows

session_bp = Blueprint('session', __name__)

@session_bp.route('/api/sessions/<sensor_type>', methods=['GET'])
def api_list_sessions(sensor_type):
    """List available session tables."""
    tables = db_manager.get_session_tables(sensor_type)
    
    # FIX: Frontend expects {"tables": ["table1", "table2", ...]}
    # Previously it returned just list of objects or strings, but frontend checked data.tables
    
    # We return the full table names as strings, as frontend parser handles `_session_` split.
    # We return the full table names as strings, as frontend parser handles `_session_` split.
    return jsonify({"tables": tables})


@session_bp.route('/api/sessions/<sensor_type>/<session_name>', methods=['GET'])
def api_get_session_data(sensor_type, session_name):
    """Get data rows for a specific session with optional pagination."""
    try:
        # Pagement parameters
        limit_arg = request.args.get('limit')
        offset_arg = request.args.get('offset', 0)
        sort_by = request.args.get('sortBy', 'id')
        order = request.args.get('order', 'asc')
        label_arg = request.args.get('label')
        from_arg = request.args.get('from')
        to_arg = request.args.get('to')
        
        limit = int(limit_arg) if limit_arg is not None else None
        offset = int(offset_arg)
        label = int(label_arg) if label_arg not in (None, '', 'ALL', 'all') else None
        row_from = int(from_arg) if from_arg not in (None, '') else None
        row_to = int(to_arg) if to_arg not in (None, '') else None

        data = db_manager.get_session_data(
            sensor_type,
            session_name,
            limit=limit, # type: ignore
            offset=offset,
            sort_by=sort_by,
            order=order,
            label=label,
            row_from=row_from,
            row_to=row_to,
        )
        return jsonify(data)
    except ValueError:
        return jsonify({"error": "Invalid limit or offset"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@session_bp.route('/api/sessions/<sensor_type>/<session_name>', methods=['DELETE'])
def api_delete_session(sensor_type, session_name):
    """Delete a session table."""
    try:
        if db_manager.delete_session_table(sensor_type, session_name):
            # If active session was this one, reset it?
            # The UI should handle clearing local state, server state reset is tricky if it's currently recording.
            # We assume user won't delete ACTIVE recording session without stopping it first.
            return jsonify({"status": "deleted", "session": session_name})
        else:
            return jsonify({"error": "Failed to delete"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@session_bp.route('/api/sessions/<sensor_type>/<session_name>/rows/<row_id>', methods=['DELETE'])
def api_delete_session_row(sensor_type, session_name, row_id):
    """Delete a specific row from a session."""
    try:
        # Convert row_id to int
        try:
            r_id = int(row_id)
        except ValueError:
            return jsonify({"error": "Invalid row ID"}), 400

        if db_manager.delete_session_row(sensor_type, session_name, r_id):
            return jsonify({"status": "deleted", "row_id": r_id})
        else:
            return jsonify({"error": "Failed to delete row (not found or DB error)"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@session_bp.route('/api/sessions/<sensor_type>/<session_name>/rename', methods=['POST'])
def api_rename_session(sensor_type, session_name):
    """Rename a session."""
    data = request.get_json()
    new_name = data.get('new_name')
    if not new_name:
        return jsonify({"error": "new_name is required"}), 400
        
    try:
        if db_manager.rename_session_table(sensor_type, session_name, new_name):
            return jsonify({"status": "renamed", "new_name": new_name})
        else:
            return jsonify({"error": "Failed to rename session"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@session_bp.route('/api/sessions/<sensor_type>/<session_name>/clear', methods=['DELETE'])
def api_clear_session_data(sensor_type, session_name):
    """Clear all rows from a session table without deleting the table."""
    try:
        result = db_manager.clear_table(sensor_type, session_name)
        if "error" in result:
            return jsonify({"error": result["error"]}), 500
        return jsonify({"status": "cleared", "session": session_name})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@session_bp.route('/api/sessions/<sensor_type>/merge_multiple', methods=['POST'])
def api_merge_multiple_sessions(sensor_type):
    """Merge multiple sessions into a new session."""
    data = request.get_json()
    source_sessions = data.get('source_sessions', [])
    target_session = data.get('target_session')
    
    if not source_sessions or not target_session:
        return jsonify({"error": "source_sessions (list) and target_session are required"}), 400
        
    try:
        if db_manager.merge_multiple_sessions(sensor_type, source_sessions, target_session):
            return jsonify({"status": "merged", "sources": source_sessions, "target": target_session})
        else:
            return jsonify({"error": "Failed to merge sessions"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- EMG ENDPOINTS ---

@session_bp.route('/api/emg/start', methods=['POST'])
def api_emg_start():
    try:
        data = request.get_json()
        label = data.get('label', 0) # Default to Rest (0)
        session_name = data.get('session_name', 'DefaultSession')
        
        label_map = {0: 'Rest', 1: 'Rock', 2: 'Paper', 3: 'Scissors'}
        label_str = label_map.get(int(label), f"Unknown_{label}")
        
        state.session.start_recording('EMG', label_str, session_name=session_name)
        return jsonify({"status": "started", "label": label_str, "table": state.session.current_table_name})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@session_bp.route('/api/emg/stop', methods=['POST'])
def api_emg_stop():
    # Capture table name BEFORE stopping
    target_table = state.session.current_table_name or "emg_windows"
    
    # Accept window_size_ms from request (default 900ms)
    data = request.get_json(silent=True) or {}
    configured_window_ms = int(data.get('window_size_ms', 900))
    
    state.session.is_recording = False # Stop adding samples
    
    try:
        session_id = str(uuid.uuid4())
        data_store = state.session.data_store['EMG']
        
        saved_count = 0
        
        # Ensure batch_id column exists (migration for older tables)
        _ensure_batch_id_column(target_table)
        if "merge" not in target_table.lower():
            _ensure_batch_id_column("emg_windows")
        
        for label_str, samples in data_store.items():
            if samples is None:
                continue
            if len(samples) < 64:
                continue
                
            # Convert label string to int
            label_map = {'Rest': 0, 'Rock': 1, 'Paper': 2, 'Scissors': 3}
            label_int = label_map.get(label_str, -1)
            
            if label_int == -1:
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

            # Windowing parameters (unified via window_config)
            sr = state.sr or 512

            # Parent window = always 1500ms, produces exactly 5 sub-windows of configured size
            parent_window_ms = 1500
            sub_window_ms = configured_window_ms

            parent_size, sub_size, sub_step = compute_sub_window_params(
                sr, sub_window_ms=sub_window_ms, parent_window_ms=parent_window_ms, num_sub_windows=5
            )

            # No overlap between successive parent bursts (stride = full parent length)
            step_size = parent_size

            num_samples = len(raw_data)
            if num_samples < parent_size:
                continue

            print(f"[Session_Routes] 📊 Windowing: parent={parent_window_ms}ms ({parent_size} samples), "
                  f"sub={sub_window_ms}ms ({sub_size} samples), 5 sub-windows/batch, stride={step_size} samples (no overlap)")

            for i in range(0, num_samples - parent_size + 1, step_size):
                parent_window = raw_data[i : i + parent_size]

                # Generate 6-digit hex batch ID for this parent window
                batch_id = f"{abs(hash(str(session_id) + str(label_int) + str(i))):06x}"[:6].zfill(6)

                # Split parent into 5 overlapping sub-windows
                for sub_window, sub_idx in split_parent_into_sub_windows(
                    parent_window, sub_size, sub_step, num_sub_windows=5
                ):
                    # Extract features from sub-window
                    feats = extract_emg_features(sub_window.tolist(), sr)
                    feats['timestamp'] = time.time()
                    
                    # Save to DB with batch_id
                    if db_manager.insert_window(feats, label_int, session_id, table_name=target_table, batch_id=batch_id):
                        saved_count += 1
                        if "merge" not in target_table.lower():
                            db_manager.insert_window(feats, label_int, session_id, table_name="emg_windows", batch_id=batch_id)
                    
        print(f"[Session_Routes] 💾 Saved {saved_count} EMG windows to {target_table}")
        
        state.session.reset_recording_state()
        
    except Exception as e:
        import traceback
        tb_str = traceback.format_exc()
        print(f"[Session_Routes] ❌ Error processing EMG session: {tb_str}")
        return jsonify({"status": "stopped", "error": str(e), "traceback": tb_str, "saved_windows": 0})

    return jsonify({"status": "stopped", "saved_windows": saved_count if 'saved_count' in locals() else 0})


def _ensure_batch_id_column(table_name: str):
    """Add batch_id column to existing EMG tables that lack it (idempotent)."""
    try:
        conn = db_manager.connect('EMG')
        cursor = conn.cursor()
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [row[1] for row in cursor.fetchall()]
        if 'batch_id' not in columns:
            cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN batch_id TEXT")
            conn.commit()
            print(f"[DB] ✅ Added batch_id column to {table_name}")
        conn.close()
    except Exception as e:
        print(f"[DB] ⚠️ Could not add batch_id to {table_name}: {e}")

@session_bp.route('/api/emg/status', methods=['GET'])
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
    return jsonify(status)

@session_bp.route('/api/emg/data', methods=['DELETE'])
def api_emg_clear():
    state.session.clear_data('EMG')
    try:
        db_manager.connect('EMG').execute("DELETE FROM emg_windows").connection.commit()
    except Exception as e:
        print(f"Failed to clear DB: {e}")
    return jsonify({"status": "cleared"})

def update_detection_active_file(sensor_type, is_active):
    from src.server.server.config_manager import set_detection_state_map, get_detection_state
    
    current = get_detection_state()
    state_map = {sensor_type: is_active}
    
    if is_active:
        state_map["active"] = True
    else:
        # Check if other sensors are still active
        other_active = False
        for k, v in current.items():
            if k in ["EMG", "EOG", "EEG"] and k != sensor_type:
                if v:
                    other_active = True
        if not other_active:
            state_map["active"] = False
            
    set_detection_state_map(state_map)

@session_bp.route('/api/emg/predict/<action>', methods=['POST'])
def api_emg_predict_toggle(action):
    is_active = (action == 'start')
    state.session.prediction_active['EMG'] = is_active
    update_detection_active_file('EMG', is_active)
    return jsonify({"status": "ok", "predicting": state.session.prediction_active['EMG']})


# --- EOG ENDPOINTS ---

@session_bp.route('/api/eog/start', methods=['POST'])
def api_eog_start():
    try:
        data = request.get_json()
        label = data.get('label', 0)
        session_name = data.get('session_name', 'DefaultSession')
        
        state.session.start_recording('EOG', str(label), session_name=session_name)
        return jsonify({"status": "started", "label": label, "table": state.session.current_table_name})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@session_bp.route('/api/eog/stop', methods=['POST'])
def api_eog_stop():
    target_table = state.session.current_table_name or "eog_windows"
    state.session.is_recording = False 
    saved_count = 0

    # Process and save EOG data
    try:
        session_id = str(uuid.uuid4())
        data_store = state.session.data_store['EOG']

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
                
            sr = state.sr or 512
            window_size = int(sr * 0.6) # 600ms to capture full blink
            step_size = int(window_size * 0.5)
            
            for i in range(0, len(raw_data) - window_size + 1, step_size):
                window = raw_data[i : i + window_size]
                
                # Extract
                feats = extract_eog_features(window.tolist(), sr)
                feats['timestamp'] = time.time()
                
                if db_manager.insert_eog_window(feats, label_int, session_id, table_name=target_table):
                    saved_count += 1
                    # Also append to global table if not a merged session
                    if "merge" not in target_table.lower():
                        db_manager.insert_eog_window(feats, label_int, session_id, table_name="eog_windows")

        print(f"[Session_Routes] 💾 Saved {saved_count} EOG windows to {target_table}")
        state.session.reset_recording_state()
        
    except Exception as e:
        print(f"[Session_Routes] ❌ Error processing EOG session: {e}")

    return jsonify({"status": "stopped", "saved_windows": saved_count if 'saved_count' in locals() else 0})

@session_bp.route('/api/eog/status', methods=['GET'])
def api_eog_status():
    return jsonify(state.session.get_status('EOG'))

@session_bp.route('/api/eog/data', methods=['DELETE'])
def api_eog_clear():
    state.session.clear_data('EOG')
    return jsonify({"status": "cleared"})

@session_bp.route('/api/eog/predict/<action>', methods=['POST'])
def api_eog_predict_toggle(action):
    is_active = (action == 'start')
    state.session.prediction_active['EOG'] = is_active
    update_detection_active_file('EOG', is_active)
    return jsonify({"status": "ok", "predicting": state.session.prediction_active['EOG']})

@session_bp.route('/api/eeg/predict/<action>', methods=['POST'])
def api_eeg_predict_toggle(action):
    is_active = (action == 'start')
    if 'EEG' not in state.session.prediction_active:
        state.session.prediction_active['EEG'] = False
    state.session.prediction_active['EEG'] = is_active
    update_detection_active_file('EEG', is_active)
    return jsonify({"status": "ok", "predicting": state.session.prediction_active['EEG']})

@session_bp.route('/api/detectors/predict/<action>', methods=['POST'])
def api_detectors_predict_toggle(action):
    from src.server.server.config_manager import set_detection_state_map
    is_active = (action == 'start')
    state.session.prediction_active['EMG'] = is_active
    state.session.prediction_active['EOG'] = is_active
    if 'EEG' not in state.session.prediction_active:
        state.session.prediction_active['EEG'] = False
    state.session.prediction_active['EEG'] = is_active
    set_detection_state_map({
        "active": is_active,
        "EMG": is_active,
        "EOG": is_active,
        "EEG": is_active
    })
    return jsonify({"status": "ok", "predicting": is_active})

@session_bp.route('/api/detectors/predict/status', methods=['GET'])
def api_detectors_predict_status():
    from src.server.server.config_manager import get_detection_state
    current = get_detection_state()
    # Sync in-memory states
    for k in ["EMG", "EOG", "EEG"]:
        if k in current:
            state.session.prediction_active[k] = current[k]
    return jsonify(current)
