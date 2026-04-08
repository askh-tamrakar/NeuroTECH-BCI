from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from src.server.server.services.file_service import list_recordings, load_recording, save_recording_session


recording_bp = APIRouter()


def _error_response(error: str, status_code: int = 500):
    return JSONResponse({"error": error}, status_code=status_code)


@recording_bp.post("/api/record")
def api_record_session(payload: dict | None = Body(default=None)):
    try:
        result = save_recording_session(payload)
        if isinstance(result, tuple):
            body, status_code = result
            return JSONResponse(body, status_code=status_code)
        return result
    except Exception as e:
        print(f"Error recording session: {e}")
        return _error_response(str(e))


@recording_bp.get("/api/recordings")
def api_list_recordings():
    try:
        return list_recordings()
    except Exception as e:
        print(f"Error listing recordings: {e}")
        return _error_response(str(e))


@recording_bp.get("/api/recordings/{filepath:path}")
def api_get_recording(filepath):
    try:
        result = load_recording(filepath)
        if isinstance(result, tuple):
            body, status_code = result
            return JSONResponse(body, status_code=status_code)
        return result
    except Exception as e:
        print(f"Error getting recording: {e}")
        return _error_response(str(e))
