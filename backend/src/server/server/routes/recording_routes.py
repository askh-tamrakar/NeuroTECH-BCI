from flask import Blueprint, jsonify, request
from pathlib import Path
import json
import os

recording_bp = Blueprint('recording', __name__)

# Paths
from src.utils.paths import get_base_data_dir, get_config_dir
PROCESSED_DATA_DIR = get_base_data_dir() / "recordings"

@recording_bp.route('/api/record', methods=['POST'])
def api_record_session():
    """Save a recorded session to disk."""
    try:
        data = request.get_json()
        if not data or 'filename' not in data or 'payload' not in data:
            return jsonify({"error": "Invalid request payload"}), 400

        filename = data['filename']
        payload = data['payload']

        # Path protection: ensure filename is safe
        safe_filename = os.path.basename(filename)
        if not safe_filename.endswith('.json'):
            safe_filename += '.json'

        PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
        
        filepath = PROCESSED_DATA_DIR / safe_filename

        with open(filepath, 'w') as f:
            json.dump(payload, f, indent=2)

        print(f"[Recording_Routes] 💾 Session saved: {filepath}")
        return jsonify({
            "status": "success",
            "message": f"Session saved to {safe_filename}",
            "path": str(filepath)
        })
    except Exception as e:
        print(f"[Recording_Routes] ❌ Error recording session: {e}")
        return jsonify({"error": str(e)}), 500


@recording_bp.route('/api/recordings', methods=['GET'])
def api_list_recordings():
    """List all available recordings in data/processed."""
    try:
        print(f"[Recording_Routes] 🔍 Checking for recordings in: {PROCESSED_DATA_DIR}")
        if not PROCESSED_DATA_DIR.exists():
            print(f"[Recording_Routes] 📂 Directory not found: {PROCESSED_DATA_DIR}")
            return jsonify([])

        recordings = []
        for file in PROCESSED_DATA_DIR.glob('*.json'):
            stat = file.stat()
            recordings.append({
                "name": file.name,
                "size": stat.st_size,
                "created": stat.st_ctime,
                "type": file.name.split('__')[0]
            })
            
        # Sort by creation time (newest first)
        recordings.sort(key=lambda x: x['created'], reverse=True)
        return jsonify(recordings)
    except Exception as e:
        print(f"[Recording_Routes] ❌ Error listing recordings: {e}")
        return jsonify({"error": str(e)}), 500


@recording_bp.route('/api/recordings/<filename>', methods=['GET'])
def api_get_recording(filename):
    """Get the content of a specific recording."""
    try:
        # Path protection: ensure filename is safe
        safe_filename = os.path.basename(filename)
        filepath = PROCESSED_DATA_DIR / safe_filename

        if not filepath.exists():
            return jsonify({"error": "Recording not found"}), 404

        with open(filepath, 'r') as f:
            data = json.load(f)

        return jsonify(data)
    except Exception as e:
        print(f"[Recording_Routes] ❌ Error getting recording: {e}")
        return jsonify({"error": str(e)}), 500


# ======================================================================
#  Hybrid Recording API — server-side CSV + metadata.json
# ======================================================================

from src.server.server.state import state
from src.data.recording_service import RecordingService


def _load_filter_config() -> dict:
    """Load the current filter_config.json for metadata reference."""
    cfg_path = get_config_dir() / "filter_config.json"
    if cfg_path.exists():
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _build_channel_list(channel_indices: list) -> list:
    """Build a channel descriptor list from state.config + requested indices."""
    mapping = state.config.get("channel_mapping", {})
    channels = []
    for idx in channel_indices:
        key = f"ch{idx}"
        info = mapping.get(key, {})
        channels.append({
            "index": idx,
            "label": info.get("label", key),
            "sensor": info.get("sensor", "UNKNOWN"),
            "unit": "\u00b5V",
        })
    return channels


def _start_recorder_for_group(sensor_type, channels, sample_rate, filter_config, data_type):
    """Create + start a fresh HybridRecorder for one sensor group."""
    from src.data.hybrid_recorder import HybridRecorder
    rec = HybridRecorder()
    rec.start(
        sensor_type=sensor_type,
        channels=channels,
        sample_rate=sample_rate,
        filter_config=filter_config,
        data_type=data_type,
    )
    return rec


@recording_bp.route('/api/hybrid/start', methods=['POST'])
def api_hybrid_start():
    """Start a hybrid server-side recording session.

    Body JSON:
        channels     — list of channel indices, e.g. [0, 1]
        data_type    — "raw" (default) or "filtered"

    Routing logic:
        Case 1 — both channels enabled, same sensor  → one folder under that sensor
        Case 2 — both channels enabled, diff sensors → two folders, one per sensor
        Case 3 — one channel enabled                 → one folder under that sensor
    """
    service = state.recording_service
    if state.hybrid_recorder is None or service is None:
        return jsonify({"error": "Hybrid recorder not initialised"}), 500

    try:
        body = request.get_json(force=True) or {}
        channel_indices = sorted(body.get("channels", [0, 1]))
        data_type = body.get("data_type", "raw")

        if data_type not in ("raw", "filtered"):
            return jsonify({"error": "data_type must be 'raw' or 'filtered'"}), 400

        # Verify LSL stream availability via tpool (non-blocking for eventlet hub)
        try:
            import eventlet.tpool as _tpool
            stream_ok = _tpool.execute(RecordingService.check_stream_available, data_type, 2.0)
        except Exception:
            stream_ok = RecordingService.check_stream_available(data_type, timeout=2.0)
        if not stream_ok:
            stream_name = "BioSignals-Raw-uV" if data_type == "raw" else "BioSignals-Processed"
            return jsonify({
                "error": f"LSL stream '{stream_name}' not available. Is the pipeline running?"
            }), 503

        # Build per-channel descriptors from config
        all_channels = _build_channel_list(channel_indices)
        sample_rate = state.config.get("sampling_rate", state.sr or 512)
        filter_config = _load_filter_config()

        # Group channels by sensor type
        from collections import defaultdict
        channel_groups: dict = defaultdict(list)
        for ch in all_channels:
            channel_groups[ch["sensor"]].append(ch)

        sensor_list = list(channel_groups.keys())

        if len(sensor_list) == 1:
            # ── Case 1 / 3: single sensor type ────────────────────────────
            sensor_type = sensor_list[0]
            recorder = state.hybrid_recorder
            state.extra_recorders = []

            result = recorder.start(
                sensor_type=sensor_type,
                channels=all_channels,
                sample_rate=sample_rate,
                filter_config=filter_config,
                data_type=data_type,
            )

            service.start(
                data_type=data_type,
                channel_indices=[ch["index"] for ch in all_channels],
            )

            print(f"[Hybrid] ● Recording started — Case {'1' if len(channel_indices) > 1 else '3'}: "
                  f"{sensor_type} ch{channel_indices}")

        else:
            # ── Case 2: two different sensor types ─────────────────────────
            # Stop any leftover extra recorders first
            for old in getattr(state, "extra_recorders", []):
                try:
                    old.stop()
                except Exception:
                    pass

            # First group → primary recorder (state.hybrid_recorder)
            groups_items = list(channel_groups.items())  # [(sensor, [ch_dicts]), ...]
            first_sensor, first_chs = groups_items[0]
            second_sensor, second_chs = groups_items[1]

            primary = state.hybrid_recorder
            primary.start(
                sensor_type=first_sensor,
                channels=first_chs,
                sample_rate=sample_rate,
                filter_config=filter_config,
                data_type=data_type,
            )

            extra = _start_recorder_for_group(
                second_sensor, second_chs, sample_rate, filter_config, data_type
            )
            state.extra_recorders = [extra]

            recorder_groups = [
                (primary, [ch["index"] for ch in first_chs]),
                (extra,   [ch["index"] for ch in second_chs]),
            ]
            service.start(data_type=data_type, recorder_groups=recorder_groups)

            result = {
                "status": "recording",
                "split": True,
                "data_type": data_type,
                "sessions": [
                    {"session": primary.metadata["session"]["name"], "path": str(primary.session_dir),
                     "sensor_type": first_sensor, "channels": [f"ch{ch['index']}" for ch in first_chs]},
                    {"session": extra.metadata["session"]["name"],   "path": str(extra.session_dir),
                     "sensor_type": second_sensor, "channels": [f"ch{ch['index']}" for ch in second_chs]},
                ],
            }

            print(f"[Hybrid] ● Recording started — Case 2: "
                  f"{first_sensor} ch{[c['index'] for c in first_chs]} | "
                  f"{second_sensor} ch{[c['index'] for c in second_chs]}")

        return jsonify(result)

    except RuntimeError as e:
        return jsonify({"error": str(e)}), 409
    except Exception as e:
        import traceback; traceback.print_exc()
        print(f"[Hybrid] ❌ Start error: {e}")
        return jsonify({"error": str(e)}), 500


@recording_bp.route('/api/hybrid/stop', methods=['POST'])
def api_hybrid_stop():
    """Stop the current hybrid recording(s) and finalise files."""
    recorder = state.hybrid_recorder
    service = state.recording_service
    if recorder is None:
        return jsonify({"error": "Hybrid recorder not initialised"}), 500

    try:
        # Stop pull thread first — no more writes after this
        if service:
            service.stop()

        extra_recorders = getattr(state, "extra_recorders", [])

        if not extra_recorders:
            # Case 1 / 3 — single recorder
            result = recorder.stop()
        else:
            # Case 2 — stop both recorders; produce a normalised response so
            # the existing frontend display logic works unchanged
            r1 = recorder.stop()
            r2 = extra_recorders[0].stop()
            state.extra_recorders = []

            # Merge totals for the summary banner
            total_rows = (r1.get("total_rows") or 0) + (r2.get("total_rows") or 0)
            dur = max(r1.get("duration_seconds") or 0, r2.get("duration_seconds") or 0)
            intg = "valid" if r1.get("integrity") == "valid" and r2.get("integrity") == "valid" else "warning"

            result = {
                "status": "stopped",
                "split": True,
                "data_type": r1.get("data_type", "raw"),
                "duration_seconds": dur,
                "total_rows": total_rows,
                "integrity": intg,
                "sessions": [
                    {"session": r1.get("session"), "path": r1.get("path"),
                     "total_rows": r1.get("total_rows"), "integrity": r1.get("integrity")},
                    {"session": r2.get("session"), "path": r2.get("path"),
                     "total_rows": r2.get("total_rows"), "integrity": r2.get("integrity")},
                ],
            }

        return jsonify(result)

    except Exception as e:
        print(f"[Hybrid] ❌ Stop error: {e}")
        return jsonify({"error": str(e)}), 500


@recording_bp.route('/api/hybrid/pause', methods=['POST'])
def api_hybrid_pause():
    """Pause the current recording(s)."""
    recorder = state.hybrid_recorder
    if recorder is None:
        return jsonify({"error": "Hybrid recorder not initialised"}), 500
    result = recorder.pause()
    for extra in getattr(state, "extra_recorders", []):
        extra.pause()
    return jsonify(result)


@recording_bp.route('/api/hybrid/resume', methods=['POST'])
def api_hybrid_resume():
    """Resume paused recording(s)."""
    recorder = state.hybrid_recorder
    if recorder is None:
        return jsonify({"error": "Hybrid recorder not initialised"}), 500
    result = recorder.resume()
    for extra in getattr(state, "extra_recorders", []):
        extra.resume()
    return jsonify(result)


@recording_bp.route('/api/hybrid/status', methods=['GET'])
def api_hybrid_status():
    """Get current hybrid recording status."""
    recorder = state.hybrid_recorder
    if recorder is None:
        return jsonify({"is_recording": False})
    status = recorder.get_status()
    extra_count = len(getattr(state, "extra_recorders", []))
    if extra_count:
        status["split_sessions"] = extra_count + 1
    return jsonify(status)


@recording_bp.route('/api/hybrid/recordings', methods=['GET'])
def api_hybrid_list():
    """List all hybrid recordings across sensor types."""
    recorder = state.hybrid_recorder
    if recorder is None:
        return jsonify([])
    return jsonify(recorder.list_recordings())


@recording_bp.route('/api/hybrid/recordings/<path:session_path>', methods=['DELETE'])
def api_hybrid_delete(session_path):
    """Delete a hybrid recording session folder."""
    recorder = state.hybrid_recorder
    if recorder is None:
        return jsonify({"error": "Hybrid recorder not initialised"}), 500

    # Reconstruct full path safely — session_path is relative to data dir
    full_path = recorder.base_dir / session_path
    safe = False
    try:
        full_path.resolve().relative_to(recorder.base_dir.resolve())
        safe = True
    except ValueError:
        pass

    if not safe:
        return jsonify({"error": "Invalid path"}), 400

    if recorder.delete_session(str(full_path)):
        return jsonify({"status": "deleted", "path": session_path})
    return jsonify({"error": "Session not found"}), 404


# ======================================================================
#  Hybrid Recording — file content endpoints
# ======================================================================

def _resolve_session_path(recorder, sensor_type: str, session_name: str):
    """Resolve and path-traverse-guard a session directory."""
    import re
    # Sanitise each path segment individually
    if not re.match(r'^[A-Za-z0-9_\-]+$', sensor_type) or not re.match(r'^[A-Za-z0-9_\-\.]+$', session_name):
        return None, "Invalid path components"

    session_dir = recorder.base_dir / sensor_type / "recording" / session_name
    try:
        session_dir.resolve().relative_to(recorder.base_dir.resolve())
    except ValueError:
        return None, "Path traversal detected"

    if not session_dir.is_dir():
        return None, "Session not found"

    return session_dir, None


@recording_bp.route('/api/hybrid/recording/<sensor_type>/<session_name>/metadata', methods=['GET'])
def api_hybrid_get_metadata(sensor_type, session_name):
    """Return the metadata.json for a specific recording session."""
    recorder = state.hybrid_recorder
    if recorder is None:
        return jsonify({"error": "Hybrid recorder not initialised"}), 500

    session_dir, err = _resolve_session_path(recorder, sensor_type, session_name)
    if err:
        return jsonify({"error": err}), 400 if "traversal" in err or "Invalid" in err else 404

    meta_path = session_dir / "metadata.json"
    if not meta_path.exists():
        return jsonify({"error": "metadata.json not found"}), 404

    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        return jsonify(meta)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@recording_bp.route('/api/hybrid/recording/<sensor_type>/<session_name>/data', methods=['GET'])
def api_hybrid_get_data(sensor_type, session_name):
    """Return a paginated slice of data.csv for a single channel.

    Query params:
        channel  (int, default 0)  — channel index matching metadata.acquisition.channels[*].index
        offset   (int, default 0)  — number of data rows to skip
        limit    (int, default 10000) — max rows to return
    """
    recorder = state.hybrid_recorder
    if recorder is None:
        return jsonify({"error": "Hybrid recorder not initialised"}), 500

    # Validate query params
    try:
        channel = int(request.args.get("channel", 0))
        offset = int(request.args.get("offset", 0))
        limit = int(request.args.get("limit", 10000))
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid query parameters"}), 400

    if offset < 0 or limit < 1 or limit > 50000 or channel < 0:
        return jsonify({"error": "Query parameters out of range"}), 400

    session_dir, err = _resolve_session_path(recorder, sensor_type, session_name)
    if err:
        return jsonify({"error": err}), 400 if "traversal" in err or "Invalid" in err else 404

    csv_path = session_dir / "data.csv"
    if not csv_path.exists():
        return jsonify({"error": "data.csv not found"}), 404

    try:
        import csv as csv_module
        values = []
        total_rows = 0
        col_index = None  # CSV column index for the requested channel

        with open(csv_path, "r", encoding="utf-8", newline="") as f:
            reader = csv_module.reader(f)
            headers = next(reader)  # e.g. ["timestamp", "ch0", "ch1"]

            # Find the column whose header matches "ch<channel>"
            target_header = f"ch{channel}"
            for i, h in enumerate(headers):
                if h.strip() == target_header:
                    col_index = i
                    break

            if col_index is None:
                return jsonify({"error": f"Channel {channel} not found in CSV headers {headers}"}), 404

            row_num = 0
            for row in reader:
                if row_num >= offset and row_num < offset + limit:
                    try:
                        values.append(float(row[col_index]))
                    except (IndexError, ValueError):
                        values.append(0.0)
                row_num += 1

            total_rows = row_num

        return jsonify({
            "channel": channel,
            "offset": offset,
            "limit": limit,
            "total_rows": total_rows,
            "headers": headers,
            "values": values,
        })
    except Exception as e:
        print(f"[Hybrid] ❌ Data read error: {e}")
        return jsonify({"error": str(e)}), 500
