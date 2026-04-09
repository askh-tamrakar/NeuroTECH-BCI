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


@recording_bp.route('/api/hybrid/start', methods=['POST'])
def api_hybrid_start():
    """Start a hybrid server-side recording session.

    Body JSON:
        channels     — list of channel indices, e.g. [0, 1]
        data_type    — "raw" (default) or "filtered"
    """
    recorder = state.hybrid_recorder
    service = state.recording_service
    if recorder is None or service is None:
        return jsonify({"error": "Hybrid recorder not initialised"}), 500

    try:
        body = request.get_json(force=True) or {}
        channel_indices = body.get("channels", [0, 1])
        data_type = body.get("data_type", "raw")

        if data_type not in ("raw", "filtered"):
            return jsonify({"error": "data_type must be 'raw' or 'filtered'"}), 400

        # Verify the LSL stream is available *before* creating files
        if not RecordingService.check_stream_available(data_type, timeout=2.0):
            stream_name = "BioSignals-Raw-uV" if data_type == "raw" else "BioSignals-Processed"
            return jsonify({
                "error": f"LSL stream '{stream_name}' not available. Is the pipeline running?"
            }), 503

        # Derive dominant sensor type for the folder name
        channels = _build_channel_list(channel_indices)
        sensor_types = list(set(ch["sensor"] for ch in channels))
        sensor_type = sensor_types[0] if len(sensor_types) == 1 else "MULTI"

        sample_rate = state.config.get("sampling_rate", state.sr or 512)
        filter_config = _load_filter_config()

        result = recorder.start(
            sensor_type=sensor_type,
            channels=channels,
            sample_rate=sample_rate,
            filter_config=filter_config,
            data_type=data_type,
            recording_channels=channel_indices,
        )

        # Spin up the dedicated LSL pull thread
        service.start(data_type=data_type, channel_indices=channel_indices)

        return jsonify(result)

    except RuntimeError as e:
        return jsonify({"error": str(e)}), 409
    except Exception as e:
        print(f"[Hybrid] ❌ Start error: {e}")
        return jsonify({"error": str(e)}), 500


@recording_bp.route('/api/hybrid/stop', methods=['POST'])
def api_hybrid_stop():
    """Stop the current hybrid recording and finalise files."""
    recorder = state.hybrid_recorder
    service = state.recording_service
    if recorder is None:
        return jsonify({"error": "Hybrid recorder not initialised"}), 500

    try:
        # Stop the pull thread first so no more writes happen
        if service:
            service.stop()

        result = recorder.stop()
        return jsonify(result)

    except Exception as e:
        print(f"[Hybrid] ❌ Stop error: {e}")
        return jsonify({"error": str(e)}), 500


@recording_bp.route('/api/hybrid/pause', methods=['POST'])
def api_hybrid_pause():
    """Pause the current recording (samples are discarded)."""
    recorder = state.hybrid_recorder
    if recorder is None:
        return jsonify({"error": "Hybrid recorder not initialised"}), 500
    return jsonify(recorder.pause())


@recording_bp.route('/api/hybrid/resume', methods=['POST'])
def api_hybrid_resume():
    """Resume a paused recording."""
    recorder = state.hybrid_recorder
    if recorder is None:
        return jsonify({"error": "Hybrid recorder not initialised"}), 500
    return jsonify(recorder.resume())


@recording_bp.route('/api/hybrid/status', methods=['GET'])
def api_hybrid_status():
    """Get current hybrid recording status."""
    recorder = state.hybrid_recorder
    if recorder is None:
        return jsonify({"is_recording": False})
    return jsonify(recorder.get_status())


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
