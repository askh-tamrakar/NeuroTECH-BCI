from src.server.server.config_manager import build_default_config, load_config, save_config
from src.server.server.extensions import socketio
from src.server.server.state import state


def deep_update(target, source):
    for key, value in source.items():
        if isinstance(value, dict) and key in target and isinstance(target[key], dict):
            deep_update(target[key], value)
        else:
            target[key] = value


def get_config():
    return state.config or load_config()


def save_runtime_config(new_config):
    if not new_config:
        return {"error": "No config provided"}, 400

    current_config = load_config()
    deep_update(current_config, new_config)
    success = save_config(current_config)
    state.config = current_config
    socketio.emit("config_updated", {"status": "saved", "config": current_config})
    return {"status": "ok", "saved": success, "config": current_config}


def reset_runtime_config():
    defaults = build_default_config()
    save_config(defaults)
    state.config = defaults
    socketio.emit("config_updated", {"status": "reset"})
    return {"status": "ok", "message": "Config reset to defaults"}
