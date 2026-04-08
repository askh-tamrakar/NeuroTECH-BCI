from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from src.server.server.services.file_service import (
    delete_audio_track,
    ensure_audio_dir,
    list_audio_tracks,
    resolve_audio_path,
    save_audio_track,
)


audio_bp = APIRouter()
ensure_audio_dir()


def _error_response(error: str, status_code: int = 500):
    return JSONResponse({"error": error}, status_code=status_code)


@audio_bp.get("/api/audio/tracks")
def list_tracks():
    try:
        return list_audio_tracks()
    except Exception as e:
        print(f"ERROR: Error listing audio tracks: {e}")
        return _error_response(str(e))


@audio_bp.post("/api/audio/upload")
async def upload_track(file: UploadFile | None = File(default=None)):
    try:
        if file is None:
            return _error_response("No file part", 400)

        class UploadedFileAdapter:
            def __init__(self, uploaded_file: UploadFile, content: bytes):
                self.filename = uploaded_file.filename or ""
                self._content = content

            def save(self, destination: str):
                from pathlib import Path
                Path(destination).write_bytes(self._content)

        adapted = UploadedFileAdapter(file, await file.read())
        result = save_audio_track(adapted)
        if isinstance(result, tuple):
            body, status_code = result
            return JSONResponse(body, status_code=status_code)
        return result
    except Exception as e:
        print(f"ERROR: Error uploading audio track: {e}")
        return _error_response(str(e))


@audio_bp.get("/api/audio/track/{filename:path}")
def get_audio_file(filename):
    try:
        resolved = resolve_audio_path(filename)
        if isinstance(resolved, tuple):
            body, status_code = resolved
            return JSONResponse(body, status_code=status_code)
        return FileResponse(resolved)
    except Exception as e:
        print(f"ERROR: [AudioAPI] Server error serving {filename}: {e}")
        return _error_response(str(e))


@audio_bp.delete("/api/audio/track/{filename}")
def delete_track(filename):
    try:
        result = delete_audio_track(filename)
        if "error" in result:
            return JSONResponse(result, status_code=404)
        return result
    except Exception as e:
        print(f"ERROR: Error deleting audio track: {e}")
        return _error_response(str(e))
