from flask import Blueprint, jsonify
from src.server.server.state import state

stream_bp = Blueprint('stream', __name__)

RAW_STREAM_NAME = "BioSignals-Processed"

@stream_bp.route('/api/status')
def api_status():
    """Get server status."""
    return jsonify({
        "status": "ok" if state.connected else "disconnected",
        "connected": state.connected,
        "api_up": True,
        "stream_active": state.connected and state.sample_count > 0,
        "lsl_connected": state.connected,
        "stream_name": RAW_STREAM_NAME,
        "channels": state.num_channels,
        "sample_rate": state.sr,
        "samples_broadcast": state.sample_count,
        "connected_clients": state.clients,
        "channel_mapping": state.channel_mapping
    })

@stream_bp.route('/api/channels')
def api_channels():
    """Get channel information."""
    return jsonify({
        "count": state.num_channels,
        "rate": state.sr,
        "mapping": state.channel_mapping
    })

import socket
from flask import request

servo_angle = 97

@stream_bp.route('/api/servo/manual', methods=['POST'])
def api_servo_manual():
    global servo_angle
    payload = request.get_json() or {}
    action = payload.get('action')
    
    if action == "Rock" or action == "Close Claw": 
        servo_angle = 97
    elif action == "Paper" or action == "Open Claw": 
        servo_angle = 1
    elif action == "Scissors": 
        servo_angle = 48
    elif action == "SingleBlink": 
        servo_angle = min(97, servo_angle + 5)
    elif action == "DoubleBlink": 
        servo_angle = max(1, servo_angle - 5)
    
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1)
        s.connect(('127.0.0.1', 6002))
        s.sendall(f"DEG {servo_angle}\n".encode())
        s.close()
    except Exception as e:
        print("Manual servo error:", e)
        return jsonify({"error": str(e)}), 500
        
    return jsonify({"status": "sent", "angle": servo_angle})
