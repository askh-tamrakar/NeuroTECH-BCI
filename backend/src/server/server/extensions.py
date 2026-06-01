from flask_socketio import SocketIO

# Threading mode: each HTTP request runs in its own OS thread so CPU-heavy
# save/train routes never block the socket.io broadcast thread.
socketio = SocketIO(cors_allowed_origins="*", ping_timeout=20, ping_interval=5, engineio_logger=False, logger=False, async_mode='threading')
