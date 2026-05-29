"""
Calibration Routes — wraps EMG/EOG/EEG recording start/stop with calibration-specific parameters.
Delegates to session_routes logic. Called by frontend CalibrationApi.
"""
from flask import Blueprint, jsonify, request
from src.server.server.state import state
from src.config.window_config import compute_sub_window_params, split_parent_into_sub_windows

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

            parent_size, sub_size, sub_step = compute_sub_window_params(
                sr, sub_window_ms=sub_window_ms, parent_window_ms=parent_window_ms, num_sub_windows=5
            )

            # No overlap between successive parent bursts (stride = full parent length)
            step_size = parent_size

            num_samples = len(raw_data)
            if num_samples < parent_size:
                continue

            print(f"[CalibrationRoutes] Windowing: parent={parent_window_ms}ms ({parent_size} samples), "
                  f"sub={sub_window_ms}ms ({sub_size} samples), 5 sub-windows/batch, stride={step_size} samples (no overlap)")

            for i in range(0, num_samples - parent_size + 1, step_size):
                parent_window = raw_data[i: i + parent_size]

                batch_id = f"{abs(hash(str(session_id) + str(label_int) + str(i))):06x}"[:6].zfill(6)

                for sub_window, sub_idx in split_parent_into_sub_windows(
                    parent_window, sub_size, sub_step, num_sub_windows=5
                ):
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


@calibration_bp.route('/api/emg/runtime-calibrate', methods=['POST'])
def api_emg_runtime_calibrate():
    """Runtime calibration: compute REST Z-Score + MVC normalization parameters from emg_calibration."""
    try:
        data = request.get_json() or {}
        # 1. Resolve which model to calibrate
        from src.utils.config import config_manager
        model_name = data.get('model_name') or config_manager.get_active_model('EMG')

        if not model_name:
            return jsonify({"error": "No model specified and no active EMG model found."}), 400

        # 2. Fetch calibration data
        import pandas as pd
        import numpy as np
        from src.database.db_manager import db_manager
        conn = db_manager.connect('EMG')
        try:
            calib_df = pd.read_sql_query("SELECT * FROM emg_calibration", conn)
        finally:
            conn.close()

        if calib_df.empty or len(calib_df) < 4:
            return jsonify({"error": "Calibration table 'emg_calibration' is empty or has too few samples (need at least 4)."}), 400

        from src.learning.emg_trainer import _read_metadata, get_model_paths, _save_json, get_feature_cols
        feature_cols = get_feature_cols('EMG')

        # 3. Separate REST (label=0) from gesture rows
        LABEL_MAP = {0: 'Rest', 1: 'Rock', 2: 'Paper', 3: 'Scissors'}
        rest_df = calib_df[calib_df['label'] == 0]
        gesture_df = calib_df[calib_df['label'] != 0]

        if rest_df.empty:
            return jsonify({"error": "No REST samples found in emg_calibration. Record REST windows during calibration."}), 400
        if gesture_df.empty:
            return jsonify({"error": "No gesture samples found in emg_calibration. Record gesture windows during calibration."}), 400

        # 4. Compute REST Z-Score parameters
        rest_mean_features = {}
        rest_std_features = {}
        for col in feature_cols:
            if col in rest_df.columns:
                rest_mean_features[col] = float(rest_df[col].mean())
                rest_std_features[col] = float(max(rest_df[col].std(), 1e-6))
            else:
                rest_mean_features[col] = 0.0
                rest_std_features[col] = 1e-6

        # 5. Compute MVC parameters (max abs value across all gesture rows per feature)
        mvc_features = {}
        for col in feature_cols:
            if col in gesture_df.columns:
                mvc_features[col] = float(max(gesture_df[col].abs().max(), 1e-6))
            else:
                mvc_features[col] = 1e-6

        # 6. Build quality report
        windows_per_class = {}
        for label_int, label_name in LABEL_MAP.items():
            count = int((calib_df['label'] == label_int).sum())
            if count > 0:
                windows_per_class[label_name] = count

        key_features = [c for c in ['rms', 'mav', 'wl'] if c in rest_df.columns]

        # REST stability: 1 / (1 + mean_CV)
        rest_cvs = []
        for col in key_features:
            mean_val = abs(rest_mean_features.get(col, 1.0))
            std_val = rest_std_features.get(col, 1e-6)
            if mean_val > 1e-9:
                rest_cvs.append(std_val / mean_val)
        rest_stability_score = float(1.0 / (1.0 + (np.mean(rest_cvs) if rest_cvs else 0.5)))

        # Gesture strength: raw MVC mean / 1000 clamped to [0,1]
        gesture_mvc_vals = [mvc_features.get(col, 0.0) for col in key_features]
        raw_mvc_mean = float(np.mean(gesture_mvc_vals)) if gesture_mvc_vals else 0.0
        gesture_strength_score = float(min(1.0, raw_mvc_mean / 1000.0))

        # Class balance: min / max count ratio
        class_counts = list(windows_per_class.values())
        class_balance_score = float(min(class_counts) / max(class_counts)) if len(class_counts) > 1 else 1.0

        overall_score = int(round(
            (rest_stability_score * 0.4 + gesture_strength_score * 0.3 + class_balance_score * 0.3) * 100
        ))

        # Optional: compare REST mean against training REST baseline
        drift_from_training_pct = None
        try:
            meta_check = _read_metadata('EMG', model_name) or {}
            base_table = meta_check.get("table_name") or "emg_windows"
            conn = db_manager.connect('EMG')
            try:
                base_rest = pd.read_sql_query(
                    f"SELECT * FROM {base_table} WHERE label = 0", conn
                )
            finally:
                conn.close()
            if not base_rest.empty:
                drifts = []
                for col in key_features:
                    if col in base_rest.columns:
                        base_val = float(base_rest[col].mean())
                        calib_val = rest_mean_features.get(col, 0.0)
                        if abs(base_val) > 1e-9:
                            drifts.append(abs(calib_val - base_val) / abs(base_val) * 100.0)
                if drifts:
                    drift_from_training_pct = round(float(np.mean(drifts)), 1)
        except Exception:
            pass  # drift info is optional

        recommendations = []
        if rest_stability_score < 0.7:
            recommendations.append("REST was unstable — try relaxing your hand more during REST recording")
        if gesture_strength_score < 0.4:
            recommendations.append("Gestures were weak — contract muscles more firmly during calibration")
        if class_balance_score < 0.75:
            recommendations.append("Unequal samples per class — consider re-running calibration with equal counts")
        if drift_from_training_pct is not None and drift_from_training_pct > 50:
            recommendations.append(
                f"Large REST drift detected ({drift_from_training_pct:.0f}% from training) — electrode placement may have changed"
            )
        if not recommendations:
            recommendations.append("Calibration quality is good!")

        quality_report = {
            "windows_per_class": windows_per_class,
            "rest_stability_score": round(rest_stability_score, 3),
            "gesture_strength_score": round(gesture_strength_score, 3),
            "class_balance_score": round(class_balance_score, 3),
            "overall_score": overall_score,
            "drift_from_training_pct": drift_from_training_pct,
            "recommendations": recommendations,
            "normalization_type": "rest_zscore_mvc",
        }

        # 7. Save new normalization params to model metadata
        meta = _read_metadata('EMG', model_name) or {}
        meta['rest_mean_features'] = rest_mean_features
        meta['rest_std_features'] = rest_std_features
        meta['mvc_features'] = mvc_features
        meta.pop('calibration_shifts', None)  # Remove old shift-based params

        paths = get_model_paths('EMG', model_name)
        _save_json(paths['meta'], meta)

        # 8. Reload active model so new params apply instantly
        if state.rps_detector:
            state.rps_detector.load_model(model_name)

        return jsonify({
            "status": "success",
            "model_name": model_name,
            "calibration_table": "emg_calibration",
            "quality_report": quality_report,
        })
    except Exception as e:
        import traceback
        print(f"[CalibrationRoutes] Runtime calibration error: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
