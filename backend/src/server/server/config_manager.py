import json
from pathlib import Path
from src.server.server.state import state

from src.utils.paths import get_config_dir

# Paths - Adjusted to use centralized utility
CONFIG_DIR = get_config_dir()
CONFIG_PATH = CONFIG_DIR / "sensor_config.json"
FILTER_CONFIG_PATH = CONFIG_DIR / "filter_config.json"
FEATURE_CONFIG_PATH = CONFIG_DIR / "feature_config.json"
DEFAULT_SR = 1000


def build_default_config() -> dict:
    return {
        "sampling_rate": DEFAULT_SR,
        "channel_mapping": {
            "ch0": {
                "sensor": "EEG",
                "label": "Fp1",
                "enabled": True
            },
            "ch1": {
                "sensor": "EEG",
                "label": "Oz",
                "enabled": True
            }
        },
        "filters": {
            "EMG": {"cutoff": 20.0, "order": 4, "notch_enabled": True, "notch_freq": 50, "bandpass_enabled": True, "bandpass_low": 20, "bandpass_high": 250},
            "EOG": {
                "type": "low_pass",
                "cutoff": 10.0,
                "order": 4
            },
            "EEG": {
                "filters": [
                    {
                        "type": "notch",
                        "freq": 50,
                        "Q": 30
                    },
                    {
                        "type": "bandpass",
                        "low": 0.5,
                        "high": 45,
                        "order": 4
                    }
                ]
            }
        },
        "display": {
            "timeWindowMs": 10000,
            "showGrid": True,
            "scannerX": 0
        },
        "num_channels": 2
    }

def load_config() -> dict:
    """Load config from sensor, filter, and feature JSON files."""
    defaults = build_default_config()

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
             print(f"Warning: error loading sensor config: {e}")
    else:
        print(f"Info: config file not found at {CONFIG_PATH}")

    # 2. Load Filter Config (Overrides 'filters' key)
    if FILTER_CONFIG_PATH.exists():
        try:
             with open(FILTER_CONFIG_PATH) as f:
                filter_cfg = json.load(f)
             if 'filters' in filter_cfg:
                 merged['filters'] = filter_cfg['filters']
        except Exception as e:
            print(f"Warning: error loading filter config: {e}")

    # 3. Load Feature Config
    if FEATURE_CONFIG_PATH.exists():
        try:
            with open(FEATURE_CONFIG_PATH) as f:
                feature_cfg = json.load(f)
            if isinstance(feature_cfg, dict):
                merged['features'] = feature_cfg
        except Exception as e:
            print(f"Error loading feature config: {e}")

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
            print(f"Saved filters to {FILTER_CONFIG_PATH}")
        elif FILTER_CONFIG_PATH.exists():
            FILTER_CONFIG_PATH.unlink()

        # 2. Save Features to feature_config.json
        if 'features' in config:
            feature_payload = config['features']
            with open(FEATURE_CONFIG_PATH, 'w') as f:
                json.dump(feature_payload, f, indent=2)
            print(f"Saved features to {FEATURE_CONFIG_PATH}")
        elif FEATURE_CONFIG_PATH.exists():
            FEATURE_CONFIG_PATH.unlink()

        # 3. Save Sensor/Display Config to sensor_config.json (exclude modular sections)
        sensor_payload = config.copy()
        if 'filters' in sensor_payload:
            del sensor_payload['filters']
        if 'features' in sensor_payload:
            del sensor_payload['features']
        
        with open(CONFIG_PATH, 'w') as f:
            json.dump(sensor_payload, f, indent=2)
        
        print(f"Saved sensor config to {CONFIG_PATH}")
        state.config = config
        return True
    except Exception as e:
        print(f"Error saving config: {e}")
        return False

DETECTION_STATE_PATH = CONFIG_DIR / "detection_state.json"

def get_detection_config() -> dict:
    """Read full detection routing config from file."""
    try:
        if DETECTION_STATE_PATH.exists():
            with open(DETECTION_STATE_PATH, 'r') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return {
                        "active": bool(data.get("active", False)),
                        "target": data.get("target")
                    }
        return {"active": False, "target": None}
    except:
        return {"active": False, "target": None}

def get_detection_state() -> bool:
    """Read detection active state from file."""
    return get_detection_config().get("active", False)

def get_detection_target() -> str | None:
    """Read which detector target is currently active."""
    target = get_detection_config().get("target")
    return str(target).upper() if target else None

def set_detection_state(active: bool, target: str | None = None):
    """Write detection active state and routed target to file."""
    try:
        DETECTION_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(DETECTION_STATE_PATH, 'w') as f:
            json.dump({
                "active": bool(active),
                "target": (str(target).upper() if target and active else None)
            }, f)
    except Exception as e:
        print(f"Error saving detection state: {e}")
