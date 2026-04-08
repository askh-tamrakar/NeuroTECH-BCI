from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from src.server.server.services.config_service import get_config, reset_runtime_config, save_runtime_config
from src.server.server.state import state


config_bp = APIRouter()


def _error_response(error: str, status_code: int = 500):
    return JSONResponse({"error": error}, status_code=status_code)


@config_bp.get("/api/config")
def api_get_config():
    return get_config()


@config_bp.post("/api/config")
def api_save_config(payload: dict | None = Body(default=None)):
    try:
        return save_runtime_config(payload)
    except Exception as e:
        print(f"Error saving config: {e}")
        return _error_response(str(e))


@config_bp.post("/api/mode")
def api_set_mode(payload: dict | None = Body(default=None)):
    try:
        data = payload or {}
        preset = data.get("preset")
        view = data.get("view")
        state.mode_manager.set_preset_and_view(preset, view)
        return {"status": "ok", "preset": preset, "view": view}
    except Exception as e:
        return _error_response(str(e))


@config_bp.delete("/api/config")
def api_delete_config():
    try:
        return reset_runtime_config()
    except Exception as e:
        return _error_response(str(e))
