import asyncio
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from src.database.db_manager import db_manager
from src.feature.detectors.rps_detector import RPSDetector
from src.server.server.config_manager import load_config
from src.server.server.extensions import socketio
from src.server.server.lsl_service import broadcast_data, broadcast_events
from src.server.server.routes.audio_routes import audio_bp
from src.server.server.routes.config_routes import config_bp
from src.server.server.routes.prediction_routes import prediction_bp
from src.server.server.routes.recording_routes import recording_bp
from src.server.server.routes.session_routes import session_bp
from src.server.server.routes.stream_routes import stream_bp
from src.server.server.routes.training_routes import training_bp
from src.server.server.services.prediction_store import initialize_prediction_store
from src.server.server.session_manager import SessionManager
from src.server.server.state import state
from src.utils.paths import PROJECT_ROOT, get_base_data_dir

TEMPLATES_DIR = PROJECT_ROOT / "frontend" / "dist"
_socket_handlers_registered = False


def _configure_stdout():
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def _register_socket_handlers():
    global _socket_handlers_registered
    if _socket_handlers_registered:
        return

    @socketio.on("connect")
    async def handle_connect(sid, environ, auth=None):
        del environ, auth
        state.clients += 1

    @socketio.on("disconnect")
    async def handle_disconnect(sid):
        del sid
        state.clients = max(0, state.clients - 1)

    @socketio.on("ping")
    async def handle_ping(sid):
        await socketio.emit_async("pong", room=sid)

    _socket_handlers_registered = True


async def _initialize_runtime():
    _configure_stdout()
    state.config = load_config()
    state.session = SessionManager()
    state.connected = False
    state.sample_count = 0
    state.clients = 0
    state.running = True
    db_manager.initialize_runtime()
    initialize_prediction_store()

    try:
        state.rps_detector = RPSDetector(state.config)
    except Exception as exc:
        state.rps_detector = None
        print(f"Warning: Failed to init RPSDetector: {exc}")

    state._background_tasks = [
        asyncio.create_task(broadcast_data(socketio), name="lsl-broadcast-data"),
        asyncio.create_task(broadcast_events(socketio), name="lsl-broadcast-events"),
    ]


async def _shutdown_runtime():
    state.running = False
    tasks = list(getattr(state, "_background_tasks", []))
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    state._background_tasks = []
    state.inlet = None
    state.event_inlet = None
    state.connected = False
    socketio.clear_event_loop()


@asynccontextmanager
async def _lifespan(app):
    del app
    socketio.set_event_loop(asyncio.get_running_loop())
    await _initialize_runtime()
    try:
        yield
    finally:
        await _shutdown_runtime()


def _build_fastapi_app():
    app = FastAPI(lifespan=_lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(session_bp)
    app.include_router(config_bp)
    app.include_router(stream_bp)
    app.include_router(recording_bp)
    app.include_router(training_bp)
    app.include_router(prediction_bp)
    app.include_router(audio_bp)

    assets_dir = TEMPLATES_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    data_dir = get_base_data_dir()
    if data_dir.exists():
        app.mount("/data", StaticFiles(directory=str(data_dir)), name="data")

    if os.environ.get("API_ONLY") == "1":
        @app.get("/")
        async def index():
            return {
                "status": "online",
                "mode": "headless",
                "message": "NeuroTECH API serving backend only.",
            }

        @app.get("/{path:path}")
        async def catch_all_api_only(path: str):
            return JSONResponse({"error": "API endpoint not found", "path": path}, status_code=404)

    else:
        @app.get("/")
        async def index():
            return FileResponse(TEMPLATES_DIR / "index.html")

        @app.get("/{path:path}")
        async def catch_all(path: str):
            if path.startswith("api/"):
                return JSONResponse({"error": "API endpoint not found"}, status_code=404)

            candidate = TEMPLATES_DIR / path
            if candidate.exists() and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(TEMPLATES_DIR / "index.html")

    return app


def create_app():
    _register_socket_handlers()
    fastapi_app = _build_fastapi_app()
    return socketio.create_asgi_app(other_asgi_app=fastapi_app)


def start_background_threads():
    return None
