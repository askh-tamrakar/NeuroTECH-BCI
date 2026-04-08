import json
from pathlib import Path
from src.server.server.state import state

from src.utils.paths import get_config_dir

_CONFIG_DIR = get_config_dir()
CONFIG_PATH = _CONFIG_DIR / "sensor_config.json"
FILTER_CONFIG_PATH = _CONFIG_DIR / "filter_config.json"
FEATURE_CONFIG_PATH = _CONFIG_DIR / "feature_config.json"
DEFAULT_SR = 512

def load_config() -> dict:
    """Load config from sensor_config.json and filter_config.json, returning a merged view."""
    defaults = {
        "sampling_rate": DEFAULT_SR,
        "channel_mapping": {
            "ch0": {
                "sensor": "EMG", 
                "enabled": True,
                "label": "Fp1 / Oz (Ref: A1, A2)"
            },
            "ch1": {
                "sensor": "EOG", 
                "enabled": True,
                "label": "UNUSED"
            }
        },
        "active_models": {
            "EMG": "Neptune",
            "EOG": "dino-ml",
            "EEG": "Neo"
        },
        "adc_settings": {
            "resolution_bits": 14,
            "vref_mv": 3300
        },
        "ui_settings": {
            "showGrid": True,
            "timeWindowMs": 10000
        },
        "filters": {
            "EMG": {
                "notch_enabled": True,
                "notch_freq": 50,
                "notch_q": 30,
                "bandpass_enabled": True,
                "bandpass_high": 250,
                "bandpass_low": 70,
                "bandpass_order": 4,
                "envelope_enabled": True,
                "envelope_cutoff": 8,
                "envelope_order": 4
            },
            "EOG": {
                "notch_enabled": True,
                "notch_freq": 50,
                "notch_q": 5,
                "bandpass_enabled": True,
                "bandpass_high": 10,
                "bandpass_low": 0.4,
                "bandpass_order": 1
            },
            "EEG": {
                "notch_enabled": True,
                "notch_freq": 50,
                "notch_q": 30,
                "bandpass_enabled": True,
                "bandpass_high": 100,
                "bandpass_low": 1,
                "bandpass_order": 4,
                "cutoff": 1
            }
        },
        "display": {
            "timeWindowMs": 10000,
            "showGrid": True,
            "scannerX": 0
        },
        "num_channels": 2
    }

    merged = defaults.copy()

    # 1. Load Sensor Config
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH) as f:
                cfg = json.load(f)
            # Merge with defaults
            merged.update(cfg)
            # Deep merge channel_mapping if needed
            if 'channel_mapping' in cfg:
                merged['channel_mapping'] = {**defaults.get('channel_mapping', {}), **cfg['channel_mapping']}
        except Exception as e:
             print(f"[ConfigManager] ⚠️  Error loading sensor config: {e}")
    else:
        print(f"[ConfigManager] ℹ️  Config file not found at {CONFIG_PATH}")

    # 2. Load Filter Config (Overrides 'filters' key)
    if FILTER_CONFIG_PATH.exists():
        try:
             with open(FILTER_CONFIG_PATH) as f:
                filter_cfg = json.load(f)
             if 'filters' in filter_cfg:
                 merged['filters'] = filter_cfg['filters']
        except Exception as e:
            print(f"[ConfigManager] ⚠️  Error loading filter config: {e}")

    return merged


def save_config(config: dict) -> bool:
    """Save config to disk (Splits into sensor_config.json and filter_config.json)."""
    try:
        if not isinstance(config, dict):
            raise ValueError("Config must be dict")
        
        # Ensure directory exists
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        
        # 1. Save Filters to filter_config.json
        if 'filters' in config:
            filter_payload = {"filters": config['filters']}
            with open(FILTER_CONFIG_PATH, 'w') as f:
                json.dump(filter_payload, f, indent=2)
            print(f"[ConfigManager] 💾 Filters saved to {FILTER_CONFIG_PATH}")

        # 2. Save Features to feature_config.json
        if 'features' in config:
            feature_payload = config['features']
            with open(FEATURE_CONFIG_PATH, 'w') as f:
                json.dump(feature_payload, f, indent=2)
            print(f"[ConfigManager] 💾 Features saved to {FEATURE_CONFIG_PATH}")

        # 3. Save Sensor/Display Config to sensor_config.json (exclude modular sections)
        sensor_payload = config.copy()
        if 'filters' in sensor_payload:
            del sensor_payload['filters']
        if 'features' in sensor_payload:
            del sensor_payload['features']
        
        with open(CONFIG_PATH, 'w') as f:
            json.dump(sensor_payload, f, indent=2)
        
        print(f"[ConfigManager] 💾 Sensor config saved to {CONFIG_PATH}")
        state.config = config
        return True
    except Exception as e:
        print(f"[ConfigManager] ❌ Error saving config: {e}")
        return False

DETECTION_STATE_PATH = _CONFIG_DIR / "detection_state.json"

def get_detection_state() -> bool:
    """Read detection active state from file."""
    try:
        if DETECTION_STATE_PATH.exists():
            with open(DETECTION_STATE_PATH, 'r') as f:
                data = json.load(f)
                return data.get("active", False)
        return False
    except:
        return False

def set_detection_state(active: bool):
    """Write detection active state to file."""
    try:
        DETECTION_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(DETECTION_STATE_PATH, 'w') as f:
            json.dump({"active": active}, f)
    except Exception as e:
        print(f"[ConfigManager] ❌ Error saving detection state: {e}")
