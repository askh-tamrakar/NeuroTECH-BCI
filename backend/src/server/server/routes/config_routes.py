from flask import Blueprint, jsonify, request
from src.server.server.state import state
from src.server.server.config_manager import load_config, save_config
from src.server.server.extensions import socketio

config_bp = Blueprint('config', __name__)

@config_bp.route('/api/config', methods=['GET'])
def api_get_config():
    """Get current configuration."""
    config = state.config or load_config()
    return jsonify(config)

@config_bp.route('/api/config', methods=['POST'])
def api_save_config():
    """Save configuration to disk."""
    try:
        config = request.get_json()
        if not config:
            return jsonify({"error": "No config provided"}), 400

        # Validate critical numeric fields
        if "sampling_rate" in config:
            sr = config["sampling_rate"]
            if not isinstance(sr, (int, float)) or sr <= 0 or sr > 10000:
                return jsonify({"error": f"Invalid sampling_rate: {sr}"}), 400
            config["sampling_rate"] = int(sr)

        # Validate channel_mapping structure
        if "channel_mapping" not in config:
            config["channel_mapping"] = load_config().get("channel_mapping", {})
        elif not isinstance(config["channel_mapping"], dict):
            return jsonify({"error": "channel_mapping must be a dict"}), 400

        # Validate filter values
        if "filters" in config:
            for sensor_type, filt in config["filters"].items():
                if isinstance(filt, dict):
                    for key in ("notch_freq", "bandpass_low", "bandpass_high", "cutoff",
                                "envelope_cutoff", "bandpass_order", "order", "notch_q"):
                        if key in filt and not isinstance(filt[key], (int, float)):
                            return jsonify({"error": f"Invalid filter value: filters.{sensor_type}.{key}={filt[key]}"}), 400

        # Save to disk
        success = save_config(config)
        
        # Broadcast to all connected clients
        socketio.emit('config_updated', {
            "status": "saved",
            "config": config
        })

        return jsonify({
            "status": "ok",
            "saved": success,
            "config": config
        })
    except Exception as e:
        print(f"[Config_Routes] ❌ Error saving config: {e}")
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
