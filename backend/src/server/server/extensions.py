from flask_socketio import SocketIO

# Initialize SocketIO with no arguments first. 
# We'll call init_app later in the factory.
#
# ping_timeout=60: Allow up to 60s for a pong reply before declaring client dead.
# This prevents disconnects during long-running HTTP handlers (training, emg/stop).
# ping_interval=25: Send heartbeat every 25s (standard Socket.IO default).
# max_http_buffer_size: Accommodate large batch window payloads from frontend.
socketio = SocketIO(
    cors_allowed_origins="*",
    ping_timeout=60,
    ping_interval=25,
    engineio_logger=False,
    logger=False,
    async_mode=None,
    always_connect=True,
    max_http_buffer_size=10 * 1024 * 1024,  # 10 MB
)
