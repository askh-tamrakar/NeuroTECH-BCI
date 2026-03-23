from flask import Blueprint, jsonify, request
from src.server.server.state import state
from src.server.server.config_manager import load_config, save_config
from src.server.server.extensions import socketio

config_bp = Blueprint('config', __name__)

def deep_update(target, source):
    for k, v in source.items():
        if isinstance(v, dict) and k in target and isinstance(target[k], dict):
            deep_update(target[k], v)
        else:
            target[k] = v

@config_bp.route('/api/config', methods=['GET'])
def api_get_config():
    """Get current configuration."""
    config = state.config or load_config()
    return jsonify(config)

@config_bp.route('/api/config', methods=['POST'])
def api_save_config():
    """Save configuration to disk."""
    try:
        new_config = request.get_json()
        if not new_config:
            return jsonify({"error": "No config provided"}), 400

        current_config = load_config()
        deep_update(current_config, new_config)

        # Save to disk
        success = save_config(current_config)
        
        # Broadcast to all connected clients
        socketio.emit('config_updated', {
            "status": "saved",
            "config": current_config
        })

        return jsonify({
            "status": "ok",
            "saved": success,
            "config": current_config
        })
    except Exception as e:
        print(f"❌ Error saving config: {e}")
        return jsonify({"error": str(e)}), 500

@config_bp.route('/api/config', methods=['DELETE'])
def api_delete_config():
    """Reset to default configuration."""
    try:
        defaults = load_config()
        save_config(defaults)
        socketio.emit('config_updated', {"status": "reset"})
        return jsonify({"status": "ok", "message": "Config reset to defaults"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
