from fastapi import APIRouter

from src.server.server.state import state


stream_bp = APIRouter()

RAW_STREAM_NAME = "BioSignals-Processed"


@stream_bp.get("/api/status")
def api_status():
    return {
        "status": "ok" if state.connected else "disconnected",
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
        "channel_mapping": state.channel_mapping,
    }


@stream_bp.get("/api/channels")
def api_channels():
    return {
        "count": state.num_channels,
        "rate": state.sr,
        "mapping": state.channel_mapping,
    }
