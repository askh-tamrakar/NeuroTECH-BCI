from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from pathlib import Path
from src.server.server.extensions import socketio
from src.server.server.state import state
from src.server.server.session_manager import SessionManager
from src.server.server.lsl_service import resolve_lsl_stream, resolve_event_stream, broadcast_data, broadcast_events
from src.server.server.config_manager import load_config
from src.feature.detectors.rps_detector import RPSDetector
import sys

# Import blueprints
from src.server.server.routes.session_routes import session_bp
from src.server.server.routes.config_routes import config_bp
from src.server.server.routes.stream_routes import stream_bp
from src.server.server.routes.recording_routes import recording_bp
from src.server.server.routes.training_routes import training_bp
from src.server.server.routes.prediction_routes import prediction_bp

# Define Project Root for template folder
# src/web/server/__init__.py -> ../../../ = root or ../../../../ depending on structure
# Structure: src/web/server/__init__.py
# Root: src is parent.parent.parent?
# file: .../src/web/server/__init__.py
# parent: .../src/web/server
# parent.parent: .../src/web
# parent.parent.parent: .../src
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
TEMPLATES_DIR = PROJECT_ROOT / "frontend" / "dist"

def create_app():
    app = Flask(__name__, 
                template_folder=str(TEMPLATES_DIR) if TEMPLATES_DIR.exists() else None,
                static_folder=str(TEMPLATES_DIR) if TEMPLATES_DIR.exists() else None,
                static_url_path="")
    
    CORS(app, resources={r"/*": {"origins": "*"}})
    
    # Init SocketIO
    socketio.init_app(app)
    
    @socketio.on('ping')
    def handle_ping():
        from flask_socketio import emit
        emit('pong')
    
    # Encoding fix
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
    except: pass

    # Initialize State
    state.config = load_config()
    state.session = SessionManager()
    
    # Initialize Detector
    try:
        # Load config to get detector settings if needed, or default
        state.rps_detector = RPSDetector(state.config) 
    except Exception as e:
        print(f"Warning: Failed to init RPSDetector: {e}")
    
    # Register Blueprints
    app.register_blueprint(session_bp)
    app.register_blueprint(config_bp)
    app.register_blueprint(stream_bp)
    app.register_blueprint(recording_bp)
    app.register_blueprint(training_bp)
    app.register_blueprint(prediction_bp)
    
    # Index Route
    @app.route('/')
    def index():
        return render_template('index.html')
        
    @app.route('/<path:path>')
    def catch_all(path):
        if path.startswith('api/'):
             return jsonify({"error": "API endpoint not found"}), 404
        return render_template('index.html')
        
    return app

def start_background_threads():
    # Start LSL Threads
    if not state.running:
        state.running = True
        resolve_lsl_stream()
        resolve_event_stream()
        
        t1 = socketio.start_background_task(target=broadcast_data, socketio=socketio)
        
        t2 = socketio.start_background_task(target=broadcast_events, socketio=socketio)
