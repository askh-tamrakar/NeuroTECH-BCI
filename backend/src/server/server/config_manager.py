import json
from src.server.server.state import state

from src.utils.paths import ensure_runtime_config_files, get_config_dir

# Paths - Adjusted to use centralized utility
CONFIG_DIR = get_config_dir()
CONFIG_PATH = CONFIG_DIR / "sensor_config.json"
FILTER_CONFIG_PATH = CONFIG_DIR / "filter_config.json"
FEATURE_CONFIG_PATH = CONFIG_DIR / "feature_config.json"
CALIBRATION_CONFIG_PATH = CONFIG_DIR / "calibration_config.json"
DETECTION_STATE_PATH = CONFIG_DIR / "detection_state.json"
SENSOR_PRESETS_PATH = CONFIG_DIR / "sensor_presets.json"
DEFAULT_SR = 1000


def build_default_config() -> dict:
    return {
        "sampling_rate": DEFAULT_SR,
        "channel_mapping": {
            "ch0": {
                "sensor": "EMG",
                "enabled": True,
                "label": "EMG_0",
            },
            "ch1": {
                "sensor": "EEG",
                "enabled": True,
                "label": "EEG_1",
            },
        },
        "active_models": {
            "EMG": None,
            "EOG": None,
            "EEG": None,
        },
        "adc_settings": {
            "resolution_bits": 14,
            "vref_mv": 3300,
        },
        "ui_settings": {
            "showGrid": True,
            "timeWindowMs": 10000,
        },
        "filters": {
            "EMG": {
                "notch_enabled": True,
                "notch_freq": 50,
                "bandpass_enabled": True,
                "bandpass_low": 20,
                "bandpass_high": 250,
                "bandpass_order": 4,
                "envelope_enabled": True,
                "envelope_cutoff": 8,
                "envelope_order": 4,
            },
            "EOG": {
                "notch_enabled": False,
                "notch_freq": 50,
                "bandpass_enabled": True,
                "bandpass_low": 0.5,
                "bandpass_high": 10,
                "bandpass_order": 4,
            },
            "EEG": {
                "cutoff": 1.0,
                "notch_enabled": True,
                "notch_freq": 50,
                "notch_q": 30,
                "bandpass_enabled": True,
                "bandpass_low": 0.5,
                "bandpass_high": 45,
                "bandpass_order": 4,
            },
        },
        "display": {
            "timeWindowMs": 10000,
            "showGrid": True,
            "scannerX": 0,
        },
        "num_channels": 2,
    }


def build_default_feature_config() -> dict:
    return {
        "EMG": {},
        "EOG": {},
        "EEG": {
            "target_freqs": [8, 9, 12, 14.4, 16, 18],
            "window_len_sec": 1.5,
            "step_sec": 0.25,
            "num_harmonics": 4,
        },
    }


def build_default_calibration_config() -> dict:
    return {}


def load_calibration_config() -> dict:
    ensure_runtime_config()
    try:
        if CALIBRATION_CONFIG_PATH.exists():
            with open(CALIBRATION_CONFIG_PATH, "r") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
    except Exception as exc:
        print(f"Warning: error loading calibration config: {exc}")
    return build_default_calibration_config()


def save_calibration_config(config: dict) -> bool:
    try:
        ensure_runtime_config()
        CALIBRATION_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(CALIBRATION_CONFIG_PATH, "w") as f:
            json.dump(config if isinstance(config, dict) else {}, f, indent=2)
        return True
    except Exception as exc:
        print(f"Error saving calibration config: {exc}")
        return False


def build_default_detection_config() -> dict:
    return {"active": False, "target": None}


def build_default_sensor_presets() -> dict:
    return {
        "presets": [
            {
                "id": "default-emg-eeg",
                "name": "Default EMG + EEG",
                "sampling_rate": DEFAULT_SR,
                "channel_mapping": {
                    "ch0": {"sensor": "EMG", "enabled": True, "label": "EMG_0"},
                    "ch1": {"sensor": "EEG", "enabled": True, "label": "EEG_1"},
                },
            }
        ]
    }


def ensure_runtime_config():
    ensure_runtime_config_files(
        {
            "sensor_config.json": build_default_config(),
            "filter_config.json": {"filters": build_default_config()["filters"]},
            "feature_config.json": build_default_feature_config(),
            "calibration_config.json": build_default_calibration_config(),
            "detection_state.json": build_default_detection_config(),
            "sensor_presets.json": build_default_sensor_presets(),
        }
    )


def _normalize_filters(filters: dict | None) -> dict:
    filters = dict(filters or {})

    emg = dict(filters.get("EMG") or {})
    if "order" in emg and "bandpass_order" not in emg:
        emg["bandpass_order"] = emg["order"]
    emg.pop("cutoff", None)
    emg.setdefault("notch_enabled", True)
    emg.setdefault("notch_freq", 50.0)
    emg.setdefault("bandpass_enabled", True)
    emg.setdefault("bandpass_low", 20.0)
    emg.setdefault("bandpass_high", 250.0)
    emg.setdefault("bandpass_order", 4)
    emg.setdefault("envelope_enabled", True)
    emg.setdefault("envelope_cutoff", 8.0)
    emg.setdefault("envelope_order", 4)

    eog = dict(filters.get("EOG") or {})
    if eog.get("type") == "low_pass" and "bandpass_high" not in eog and "cutoff" in eog:
        eog["bandpass_high"] = float(eog["cutoff"])
    if "order" in eog and "bandpass_order" not in eog:
        eog["bandpass_order"] = eog["order"]
    eog.pop("type", None)
    eog.pop("cutoff", None)
    eog.setdefault("notch_enabled", False)
    eog.setdefault("notch_freq", 50.0)
    eog.setdefault("bandpass_enabled", True)
    eog.setdefault("bandpass_low", 0.5)
    eog.setdefault("bandpass_high", 10.0)
    eog.setdefault("bandpass_order", 4)

    eeg = dict(filters.get("EEG") or {})
    legacy_chain = eeg.pop("filters", None)
    if legacy_chain:
        for stage in legacy_chain:
            stage_type = str((stage or {}).get("type", "")).lower()
            if stage_type == "notch":
                eeg["notch_enabled"] = True
                eeg["notch_freq"] = float(stage.get("freq", eeg.get("notch_freq", 50.0)))
                eeg["notch_q"] = float(stage.get("Q", eeg.get("notch_q", 30.0)))
            elif stage_type == "bandpass":
                eeg["bandpass_enabled"] = True
                eeg["bandpass_low"] = float(stage.get("low", eeg.get("bandpass_low", 0.5)))
                eeg["bandpass_high"] = float(stage.get("high", eeg.get("bandpass_high", 45.0)))
                eeg["bandpass_order"] = int(stage.get("order", eeg.get("bandpass_order", 4)))
    eeg.setdefault("cutoff", 1.0)
    eeg.setdefault("notch_enabled", True)
    eeg.setdefault("notch_freq", 50.0)
    eeg.setdefault("notch_q", 30.0)
    eeg.setdefault("bandpass_enabled", True)
    eeg.setdefault("bandpass_low", 0.5)
    eeg.setdefault("bandpass_high", 45.0)
    eeg.setdefault("bandpass_order", 4)

    return {"EMG": emg, "EOG": eog, "EEG": eeg}


def load_config() -> dict:
    """Load config from sensor, filter, and feature JSON files."""
    ensure_runtime_config()
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
                 merged['filters'] = _normalize_filters(filter_cfg['filters'])
        except Exception as e:
            print(f"Warning: error loading filter config: {e}")
    else:
        merged["filters"] = _normalize_filters(merged.get("filters"))

    # 3. Load Feature Config
    if FEATURE_CONFIG_PATH.exists():
        try:
            with open(FEATURE_CONFIG_PATH) as f:
                feature_cfg = json.load(f)
            if isinstance(feature_cfg, dict):
                merged['features'] = feature_cfg
        except Exception as e:
            print(f"Error loading feature config: {e}")
    else:
        merged["features"] = build_default_feature_config()

    merged["filters"] = _normalize_filters(merged.get("filters"))

    return merged


def save_config(config: dict) -> bool:
    """Save config to disk (Splits into sensor_config.json and filter_config.json)."""
    try:
        if not isinstance(config, dict):
            raise ValueError("Config must be dict")

        ensure_runtime_config()
        
        # Ensure directory exists
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        
        # 1. Save Filters to filter_config.json
        if 'filters' in config:
            filter_payload = {"filters": _normalize_filters(config['filters'])}
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
    ensure_runtime_config()
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
        ensure_runtime_config()
        DETECTION_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(DETECTION_STATE_PATH, 'w') as f:
            json.dump({
                "active": bool(active),
                "target": (str(target).upper() if target and active else None)
            }, f)
    except Exception as e:
        print(f"Error saving detection state: {e}")
