import json
import os
import shutil
import sys
from copy import deepcopy
from pathlib import Path

# Try to find the project root dynamically, or fallback to the current file's ancestor
def get_project_root():
    # If we are running inside PyInstaller, sys._MEIPASS might exist, but usually we run from source
    
    # Start from this file's location: src/utils/paths.py
    current = Path(__file__).resolve()
    
    # Walk up until we find 'backend' and 'frontend' to identify root
    for parent in current.parents:
        if (parent / 'backend').exists() and (parent / 'frontend').exists():
            return parent
            
    # Fallback to pure relative (4 levels up from src/utils/paths.py)
    return current.parent.parent.parent.parent
    
PROJECT_ROOT = get_project_root()
FRONTEND_DIR = PROJECT_ROOT / "frontend"
RUNTIME_DATA_DIR = PROJECT_ROOT / "data"
RUNTIME_CONFIG_DIR = RUNTIME_DATA_DIR / "config"
RUNTIME_STATE_DIR = RUNTIME_DATA_DIR / "runtime"

_CONFIG_BOOTSTRAPPED = False
_LEGACY_WARNING_EMITTED = False

DEFAULT_SENSOR_CONFIG = {
    "sampling_rate": 1000,
    "channel_mapping": {
        "ch0": {"enabled": True, "sensor": "EMG"},
        "ch1": {"enabled": True, "sensor": "EEG"},
    },
    "display": {
        "timeWindowMs": 10000,
        "showGrid": True,
        "scannerX": 0,
    },
    "num_channels": 2,
    "active_models": {
        "EMG": "Neuro",
        "EOG": "SynThe",
        "EEG": "new",
    },
}

DEFAULT_FILTER_CONFIG = {
    "filters": {
        "EMG": {
            "notch_enabled": True,
            "notch_freq": 50,
            "bandpass_enabled": True,
            "bandpass_low": 70,
            "bandpass_high": 250,
            "bandpass_order": 4,
            "envelope_enabled": True,
            "envelope_cutoff": 8,
            "envelope_order": 4,
        },
        "EOG": {
            "notch_enabled": True,
            "notch_freq": 50,
            "bandpass_enabled": True,
            "bandpass_low": 0.4,
            "bandpass_high": 8,
            "bandpass_order": 4,
        },
        "EEG": {
            "cutoff": 1.0,
            "bandpass_enabled": True,
            "notch_enabled": True,
            "notch_freq": 50,
            "bandpass_low": 1,
            "bandpass_high": 30,
            "bandpass_order": 4,
        },
    }
}

DEFAULT_FEATURE_CONFIG = {
    "EMG": {},
    "EOG": {"detection_method": "ML"},
    "EEG": {
        "target_freqs": [3.5, 3.94, 5.25, 6.3, 7, 7.88],
        "targets": [
            {"controlType": "Keyboard", "divisor": 18, "enabled": True, "freq": 3.5, "id": 0, "isManual": False, "label": "Target 1", "mappedKey": "W", "mappedMouse": "Left Click", "source": "dynamic"},
            {"controlType": "Keyboard", "divisor": 16, "enabled": True, "freq": 3.94, "id": 1, "isManual": False, "label": "Target 2", "mappedKey": "A", "mappedMouse": "None", "source": "dynamic"},
            {"controlType": "Keyboard", "divisor": 12, "enabled": True, "freq": 5.25, "id": 2, "isManual": False, "label": "Target 3", "mappedKey": "S", "mappedMouse": "None", "source": "dynamic"},
            {"controlType": "Keyboard", "divisor": 10, "enabled": True, "freq": 6.3, "id": 3, "isManual": False, "label": "Target 4", "mappedKey": "D", "mappedMouse": "None", "source": "dynamic"},
            {"controlType": "Keyboard", "divisor": 9, "enabled": True, "freq": 7, "id": 4, "isManual": False, "label": "Target 5", "mappedKey": "Space", "mappedMouse": "None", "source": "dynamic"},
            {"controlType": "Keyboard", "divisor": 8, "enabled": True, "freq": 7.88, "id": 5, "isManual": False, "label": "Target 6", "mappedKey": "W", "mappedMouse": "None", "source": "dynamic"},
        ],
        "rest_threshold": 0.6,
        "window_len_sec": 1.5,
        "ratio_threshold": 1.2,
        "classifier": "fbcca",
        "num_harmonics": 4,
        "step_sec": 0.25,
        "smoothing_windows": 7,
        "refresh_rate": 63,
        "use_ml_pipeline": False,
    },
    "RPS": {
        "confidence_threshold": 0.68,
        "voting_window": 5,
        "stable_count": 3,
        "activation_count": 3,
        "release_count": 2,
        "min_episode_votes": 4,
        "min_episode_majority_ratio": 0.6,
        "confirmation_cooldown_sec": 0.65,
        "adaptive_confidence_threshold": 0.9,
        "adaptive_rate_limit_sec": 1.0,
        "online_adaptation_enabled": False,
    },
    "Servo": {"enabled": False},
}

DEFAULT_CALIBRATION_CONFIG = {}
DEFAULT_DETECTION_STATE = {"active": False, "target": None}
DEFAULT_SENSOR_PRESETS = {
    "visual_eeg_oz": {"mode": "visual", "active": "Oz", "reference": "A1", "ground": "A2"},
    "frontal_fp1": {"mode": "frontal", "active": "FP1", "reference": "A1", "ground": "A2"},
    "frontal_fp2": {"mode": "frontal", "active": "FP2", "reference": "A1", "ground": "A2"},
}

CONFIG_DEFAULTS = {
    "sensor_config.json": DEFAULT_SENSOR_CONFIG,
    "filter_config.json": DEFAULT_FILTER_CONFIG,
    "feature_config.json": DEFAULT_FEATURE_CONFIG,
    "calibration_config.json": DEFAULT_CALIBRATION_CONFIG,
    "detection_state.json": DEFAULT_DETECTION_STATE,
    "sensor_presets.json": DEFAULT_SENSOR_PRESETS,
}


def _legacy_config_dirs():
    return [PROJECT_ROOT / "config", PROJECT_ROOT / "backend" / "config"]


def _emit_legacy_config_warning():
    global _LEGACY_WARNING_EMITTED
    if _LEGACY_WARNING_EMITTED:
        return

    duplicates = [str(path) for path in _legacy_config_dirs() if path.exists()]
    if duplicates:
        joined = ", ".join(duplicates)
        print(f"[Config] Legacy config directories detected: {joined}. Runtime config now lives in {RUNTIME_CONFIG_DIR}")
        _LEGACY_WARNING_EMITTED = True


def _write_default_config(target_path: Path, filename: str):
    payload = deepcopy(CONFIG_DEFAULTS[filename])
    with open(target_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def ensure_runtime_config_dir() -> Path:
    global _CONFIG_BOOTSTRAPPED

    RUNTIME_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    _emit_legacy_config_warning()

    if _CONFIG_BOOTSTRAPPED:
        return RUNTIME_CONFIG_DIR

    for filename in CONFIG_DEFAULTS:
        target_path = RUNTIME_CONFIG_DIR / filename
        if target_path.exists():
            continue

        copied = False
        for legacy_dir in _legacy_config_dirs():
            source_path = legacy_dir / filename
            if source_path.exists():
                shutil.copy2(source_path, target_path)
                copied = True
                break

        if not copied:
            _write_default_config(target_path, filename)

    _CONFIG_BOOTSTRAPPED = True
    return RUNTIME_CONFIG_DIR

def get_base_data_dir() -> Path:
    """
    Get the base directory for storing BCI data, models, and databases.
    In development, this defaults to 'frontend/public/data' for easy access by the dev server.
    In production, it checks the BCI_DATA_DIR environment variable, or defaults to a 'bci_data' folder next to the project root.
    """
    env_dir = os.environ.get("BCI_DATA_DIR")
    if env_dir:
        path = Path(env_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path
        
    # Check if we are likely in production (cPanel usually sets specific env vars, or we can check for node_modules)
    # A simple heuristical check: if frontend/public doesn't exist, we might be in a built environment
    public_dir = FRONTEND_DIR / "public"
    if public_dir.exists() and not os.environ.get("FLASK_ENV") == "production":
        # Development mode
        return public_dir / "data"
    else:
        # Production mode - store data outside the frontend folder to avoid serving raw DBs
        # Default to a 'bci_data' folder in the project root
        prod_data = PROJECT_ROOT / "bci_data"
        prod_data.mkdir(parents=True, exist_ok=True)
        return prod_data

def get_db_path(sensor_type: str) -> Path:
    base = get_base_data_dir()
    path = base / sensor_type.upper() / "processed" / f"{sensor_type.lower()}_data.db"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path

def get_models_dir(sensor_type: str) -> Path:
    base = get_base_data_dir()
    path = base / sensor_type.upper() / "models"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path

def get_config_dir() -> Path:
    return ensure_runtime_config_dir()


def get_runtime_state_dir() -> Path:
    RUNTIME_STATE_DIR.mkdir(parents=True, exist_ok=True)
    return RUNTIME_STATE_DIR
