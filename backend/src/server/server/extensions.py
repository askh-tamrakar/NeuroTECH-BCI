from flask_socketio import SocketIO

# Initialize SocketIO with no arguments first. 
# We'll call init_app later in the factory.
#
# ping_timeout=120: Allow up to 120s for a pong reply before declaring client dead.
# This prevents disconnects during long-running HTTP handlers (training, emg/stop).
# ping_interval=30: Send heartbeat every 30s to reduce unnecessary churn during long jobs.
# max_http_buffer_size: Accommodate large batch window payloads from frontend.
socketio = SocketIO(
    cors_allowed_origins="*",
    ping_timeout=120,
    ping_interval=30,
    engineio_logger=False,
    logger=False,
    async_mode=None,
    always_connect=True,
    max_http_buffer_size=10 * 1024 * 1024,  # 10 MB
)
