import eventlet
eventlet.monkey_patch()

import sys
from pathlib import Path

# Add project root to path to ensure imports work if run from this file
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.server.server import create_app, start_background_threads, socketio

app = create_app()

def main():
    start_background_threads()
    print("Starting Web Server...")
    # Eventlet is now patched; socketio.run will automatically pick it up.
    # We no longer need allow_unsafe_werkzeug as we're not using Werkzeug's server.
    socketio.run(app, host='0.0.0.0', port=5005, debug=False)

if __name__ == '__main__':
    main()
