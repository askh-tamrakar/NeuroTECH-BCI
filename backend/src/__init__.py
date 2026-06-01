# Keep __init__.py minimal so eventlet.monkey_patch() in web_server.py
# runs before any standard-library modules (threading, socket) are imported.
__all__: list = []
