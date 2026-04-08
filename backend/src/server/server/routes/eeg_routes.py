"""
EEG Routes
Handles EEG mode switching, meditation session control, and sensor status.
"""

from flask import Blueprint, request, jsonify
from src.server.server.state import state
from src.server.server.config_manager import load_config
import logging

log = logging.getLogger(__name__)

eeg_bp = Blueprint('eeg', __name__)

# Lazy-init: the ModeManager is created on first mode request
_mode_manager = None


def _get_mode_manager():
    global _mode_manager
    if _mode_manager is None:
        from src.core.mode_manager import ModeManager
        sr = getattr(state, 'sr', 512)
        _mode_manager = ModeManager(sr=sr)
    return _mode_manager


@eeg_bp.route('/api/mode', methods=['POST'])
def set_eeg_mode():
    """Switch EEG processing mode (preset + view)."""
    data = request.get_json(silent=True) or {}
    preset = data.get('preset', 'frontal_fp1')
    view = data.get('view', 'overview')

    mm = _get_mode_manager()
    mm.set_preset_and_view(preset, view)

    return jsonify({
        "status": "ok",
        "preset": preset,
        "view": view,
        "eeg_mapped": mm.has_eeg_channel(),
        "mode": mm.mode,
        "channel_index": mm.channel_index,
    })


@eeg_bp.route('/api/eeg/status', methods=['GET'])
def eeg_status():
    """Check if any channel is mapped to an EEG sensor."""
    config = load_config()
    mapping = config.get('channel_mapping', {})
    eeg_channels = []
    for ch_key, info in mapping.items():
        if str(info.get('sensor', '')).upper() == 'EEG' and info.get('enabled', True):
            eeg_channels.append({
                "channel": ch_key,
                "label": info.get('label', ch_key),
            })
    return jsonify({
        "eeg_mapped": len(eeg_channels) > 0,
        "eeg_channels": eeg_channels,
    })


@eeg_bp.route('/api/meditation/session/start', methods=['POST'])
def start_meditation_session():
    """Start a timed meditation session."""
    data = request.get_json(silent=True) or {}
    duration_sec = data.get('duration_sec', 300)
    mm = _get_mode_manager()
    mm.start_meditation_session(duration_sec)
    return jsonify({"status": "started", "duration_sec": duration_sec})


@eeg_bp.route('/api/meditation/session/stop', methods=['POST'])
def stop_meditation_session():
    """Stop meditation and return detailed results."""
    mm = _get_mode_manager()
    results = mm.stop_meditation_session()
    return jsonify(results)
