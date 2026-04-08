import sys
from pathlib import Path

# Add project root to path to ensure imports work if run from this file
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.server.server import create_app, start_background_threads, socketio

app = create_app()

# Always start LSL broadcast threads when the module loads (pipeline or standalone).
# This ensures the stream manager connects as soon as the server port is up.
start_background_threads()

if __name__ == '__main__':
    print("Starting Web Server...")
    socketio.run(app, host='0.0.0.0', port=5005, allow_unsafe_werkzeug=True)
