import os
import sys
import json
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
DATA_DIR = PROJECT_ROOT / "data"

def get_base_data_dir() -> Path:
    """
    Get the base directory for storing BCI data, models, and databases.
    Always uses the centralized 'data/' folder at project root.
    Can be overridden via BCI_DATA_DIR environment variable.
    """
    env_dir = os.environ.get("BCI_DATA_DIR")
    if env_dir:
        path = Path(env_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR

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
    path = DATA_DIR / "config"
    path.mkdir(parents=True, exist_ok=True)
    return path

def get_runtime_state_dir() -> Path:
    path = DATA_DIR / "runtime"
    path.mkdir(parents=True, exist_ok=True)
    return path



def ensure_runtime_config_files(default_payloads: dict[str, object] | None = None) -> Path:
    """Ensure all config files exist in data/config/, writing defaults if missing."""
    config_dir = get_config_dir()

    if default_payloads is None:
        default_payloads = _DEFAULT_CONFIG_PAYLOADS

    for filename, payload in default_payloads.items():
        destination = config_dir / filename
        if destination.exists():
            continue

        destination.parent.mkdir(parents=True, exist_ok=True)
        with open(destination, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)

    return config_dir


_DEFAULT_CONFIG_PAYLOADS = {
    "sensor_config.json": {
        "sampling_rate": 512,
        "channel_mapping": {
            "ch0": {"enabled": True, "sensor": "EMG", "label": "Fp1 / Oz (Ref: A1, A2)"},
            "ch1": {"enabled": True, "sensor": "EOG", "label": "UNUSED"}
        },
        "active_models": {"EMG": "Neptune", "EOG": "dino-ml", "EEG": "Neo"},
        "adc_settings": {"resolution_bits": 14, "vref_mv": 3300},
        "ui_settings": {"showGrid": True, "timeWindowMs": 10000},
        "display": {"timeWindowMs": 10000, "showGrid": True, "scannerX": 0},
        "num_channels": 2
    },
    "filter_config.json": {
        "filters": {
            "EMG": {"notch_enabled": True, "notch_freq": 50, "notch_q": 30, "bandpass_enabled": True, "bandpass_high": 250, "bandpass_low": 70, "bandpass_order": 4, "envelope_enabled": True, "envelope_cutoff": 8, "envelope_order": 4},
            "EOG": {"notch_enabled": True, "notch_freq": 50, "notch_q": 5, "bandpass_enabled": True, "bandpass_high": 10, "bandpass_low": 0.4, "bandpass_order": 1},
            "EEG": {"notch_enabled": True, "notch_freq": 50, "notch_q": 30, "bandpass_enabled": True, "bandpass_high": 100, "bandpass_low": 1, "bandpass_order": 4, "cutoff": 1}
        }
    },
    "feature_config.json": {
        "RPS": {"confidence_threshold": 0.68, "voting_window": 5, "stable_count": 3, "activation_count": 3, "release_count": 2, "min_episode_votes": 4, "min_episode_majority_ratio": 0.6, "confirmation_cooldown_sec": 0.65}
    },
    "calibration_config.json": {},
    "detection_state.json": {"active": False},
    "sensor_presets.json": {}
}


# Auto-migrate on first import
ensure_runtime_config_files()
