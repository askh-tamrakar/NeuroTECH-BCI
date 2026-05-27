"""
Calibration Routes — wraps EMG/EOG/EEG recording start/stop with calibration-specific parameters.
Delegates to session_routes logic. Called by frontend CalibrationApi.
"""
from flask import Blueprint, jsonify, request
from src.server.server.state import state

calibration_bp = Blueprint('calibration', __name__)


@calibration_bp.route('/api/calibration/start', methods=['POST'])
def api_calibration_start():
    """Start a calibration recording session. Delegates to EMG/EOG start."""
    try:
        data = request.get_json()
        sensor = (data.get('sensor') or 'EMG').upper()
        label = data.get('class_label', 'Rest')
        session_name = data.get('session_name', f'Calib_{sensor}')
        # Store window_duration_ms for when stop is called
        state._calib_window_ms = int(data.get('window_duration_ms', 900))

        state.session.start_recording(sensor, str(label), session_name=session_name)
        return jsonify({
            "status": "started",
            "sensor": sensor,
            "label": str(label),
            "table": state.session.current_table_name,
            "window_duration_ms": state._calib_window_ms,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@calibration_bp.route('/api/calibration/stop', methods=['POST'])
def api_calibration_stop():
    """Stop calibration recording and process windows with the stored window size."""
    try:
        target_table = state.session.current_table_name or "emg_windows"
        # Use the window size that was set at calibration start
        configured_window_ms = getattr(state, '_calib_window_ms', 900)

        state.session.is_recording = False

        import uuid, numpy as np, time
        session_id = str(uuid.uuid4())
        data_store = state.session.data_store.get('EMG', {})

        saved_count = 0
        # Ensure batch_id column exists
        from src.server.server.routes.session_routes import _ensure_batch_id_column
        _ensure_batch_id_column(target_table)
        if "merge" not in target_table.lower():
            _ensure_batch_id_column("emg_windows")

        for label_str, samples in data_store.items():
            if samples is None or len(samples) < 64:
                continue

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

            raw_data = np.array(samples)
            if raw_data.ndim > 1 and raw_data.shape[1] == 1:
                raw_data = raw_data.flatten()

            sr = state.sr or 512

            # Parent window = always 1500ms, produces exactly 5 sub-windows
            parent_window_ms = 1500
            sub_window_ms = configured_window_ms

            parent_size = int(sr * parent_window_ms / 1000)
            sub_size = int(sr * sub_window_ms / 1000)
            num_sub_windows = 5
            sub_step = (parent_size - sub_size) // (num_sub_windows - 1) if num_sub_windows > 1 else 0

            step_size = int(parent_size * 0.5)

            num_samples = len(raw_data)
            if num_samples < parent_size:
                continue

            print(f"[CalibrationRoutes] Windowing: parent={parent_window_ms}ms ({parent_size} samples), "
                  f"sub={sub_window_ms}ms ({sub_size} samples), {num_sub_windows} sub-windows/batch")

            for i in range(0, num_samples - parent_size, step_size):
                parent_window = raw_data[i: i + parent_size]

                batch_id = f"{abs(hash(str(session_id) + str(label_int) + str(i))):06x}"[:6].zfill(6)

                for sub_idx in range(num_sub_windows):
                    sub_start = sub_idx * sub_step
                    sub_end = sub_start + sub_size
                    if sub_end > len(parent_window):
                        sub_end = len(parent_window)
                        sub_start = max(0, sub_end - sub_size)
                    sub_window = parent_window[sub_start:sub_end]

                    if len(sub_window) < sub_size * 0.8:
                        continue

                    from src.server.server.lsl_service import extract_emg_features
                    from src.database.db_manager import db_manager

                    feats = extract_emg_features(sub_window, sr)
                    feats['timestamp'] = time.time()

                    if db_manager.insert_window(feats, label_int, session_id, table_name=target_table, batch_id=batch_id):
                        saved_count += 1
                        if "merge" not in target_table.lower():
                            db_manager.insert_window(feats, label_int, session_id, table_name="emg_windows", batch_id=batch_id)

        print(f"[CalibrationRoutes] Saved {saved_count} EMG windows to {target_table}")
        state.session.reset_recording_state()

        return jsonify({"status": "stopped", "saved_windows": saved_count})
    except Exception as e:
        import traceback
        tb_str = traceback.format_exc()
        print(f"[CalibrationRoutes] Error: {tb_str}")
        return jsonify({"status": "error", "error": str(e), "saved_windows": 0}), 500
