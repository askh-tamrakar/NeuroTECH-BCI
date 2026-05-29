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
import json
import time
import pylsl

manual_event_outlet = None

def get_manual_event_outlet():
    global manual_event_outlet
    if manual_event_outlet is None:
        try:
            info = pylsl.StreamInfo('BioSignals-Events', 'Markers', 1, 0, 'string', 'BioSignals-Events-Manual')
            manual_event_outlet = pylsl.StreamOutlet(info)
            print("[StreamRoutes] Created manual event LSL outlet.")
        except Exception as e:
            print(f"[StreamRoutes] Error creating LSL outlet: {e}")
    return manual_event_outlet

servo_angle = 97

@stream_bp.route('/api/servo/manual', methods=['POST'])
def api_servo_manual():
    global servo_angle
    payload = request.get_json() or {}
    action = payload.get('action')
    
    # Map actions to canonical BCI event names if needed
    mapped_action = action
    if action == "Close Claw":
        mapped_action = "Rock"
    elif action == "Open Claw":
        mapped_action = "Paper"
        
    if mapped_action == "Rock": 
        servo_angle = 97
    elif mapped_action == "Paper": 
        servo_angle = 1
    elif mapped_action == "Scissors": 
        servo_angle = 48
    elif mapped_action == "SingleBlink": 
        servo_angle = min(97, servo_angle + 5)
    elif mapped_action == "DoubleBlink": 
        servo_angle = max(1, servo_angle - 5)
    elif mapped_action.startswith("TARGET_"):
        try:
            freq = float(mapped_action.replace("TARGET_", "").replace("HZ", "").replace("_", "."))
            default_freqs = [8.0, 10.0, 12.0, 15.0, 18.0, 20.0]
            preset_angles = [97, 82, 66, 48, 24, 1]
            for index, f in enumerate(default_freqs):
                if abs(f - freq) < 0.1:
                    servo_angle = preset_angles[min(index, len(preset_angles) - 1)]
                    break
        except Exception as e:
            print("[StreamRoutes] Error parsing manual target frequency:", e)
            
    # 1. Push to LSL stream BioSignals-Events so that it updates action log, virtual claw, and moves servo
    outlet = get_manual_event_outlet()
    if outlet:
        try:
            event_data = {
                "event": mapped_action,
                "channel": "manual",
                "timestamp": time.time(),
                "features": {}
            }
            outlet.push_sample([json.dumps(event_data)])
            print(f"[StreamRoutes] Pushed manual event to LSL: {mapped_action}")
        except Exception as e:
            print(f"[StreamRoutes] Error pushing manual event to LSL: {e}")
            
    # 2. Also send TCP DEG command to stream manager on Port 6002 directly to guarantee movement
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1)
        s.connect(('127.0.0.1', 6002))
        s.sendall(f"DEG {servo_angle}\n".encode())
        s.close()
    except Exception as e:
        print("[StreamRoutes] Direct TCP manual relay error:", e)
        
    return jsonify({"status": "sent", "angle": servo_angle, "event": mapped_action})
