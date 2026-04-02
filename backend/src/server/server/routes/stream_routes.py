from flask import Blueprint, jsonify
import json
import time
from src.utils.paths import get_runtime_state_dir
from src.server.server.state import state

stream_bp = Blueprint('stream', __name__)

RAW_STREAM_NAME = "BioSignals-Processed"


def _read_stream_manager_status():
    status_path = get_runtime_state_dir() / "stream_manager_status.json"
    try:
        if status_path.exists():
            with open(status_path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
                if isinstance(payload, dict):
                    return payload
    except json.JSONDecodeError:
        return {}
    except Exception as exc:
        print(f"[Status] Failed to read stream manager runtime status: {exc}")
    return {}

@stream_bp.route('/api/status')
def api_status():
    """Get server status."""
    now = time.time()
    last_sample_age_ms = None
    if state.last_sample_ts:
        last_sample_age_ms = max(0, int((now - state.last_sample_ts) * 1000))

    stream_active = bool(state.connected and last_sample_age_ms is not None and last_sample_age_ms <= 2000)
    ingress_status = _read_stream_manager_status()

    return jsonify({
        "status": "streaming" if stream_active else ("ok" if state.connected else "disconnected"),
        "connected": state.connected,
        "api_up": True,
        "socket_up": True,
        "lsl_connected": state.connected,
        "stream_active": stream_active,
        "last_sample_age_ms": last_sample_age_ms,
        "stream_name": RAW_STREAM_NAME,
        "channels": state.num_channels,
        "sample_rate": state.sr,
        "samples_broadcast": state.sample_count,
        "connected_clients": state.clients,
        "socket_client_count": state.clients,
        "raw_ingress_client_count": int(ingress_status.get("raw_ingress_client_count", 0) or 0),
        "channel_mapping": state.channel_mapping
    })

@stream_bp.route('/api/channels')
def api_channels():
    """Get channel information."""
    return jsonify({
        "count": state.num_channels,
        "rate": state.sr,
        "mapping": state.channel_mapping
    })
