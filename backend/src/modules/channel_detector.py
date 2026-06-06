"""
Channel Detector
Auto-detects the EEG/EMG channel from sensor_config.json for meditation use.
Scans channel_mapping for sensor type "EEG" first, falls back to "EMG".
Returns (channel_index, channel_key, label, sensor_type).
"""
import json
import logging
from pathlib import Path

log = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path("data/config/sensor_config.json")


class ChannelDetector:
    """Reads sensor_config.json to find the best channel for EEG/meditation."""

    def __init__(self, config_path: Path = None):
        self.config_path = config_path or DEFAULT_CONFIG_PATH
        self._cached = None
        self._cache_mtime = None

    def _read_config(self) -> dict:
        """Read and parse sensor_config.json."""
        try:
            with open(self.config_path, "r") as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            log.warning(f"ChannelDetector: cannot read config — {e}")
            return {}

    def _config_changed(self) -> bool:
        """Check if config file has been modified since last read."""
        try:
            mtime = self.config_path.stat().st_mtime
            return self._cache_mtime != mtime
        except OSError:
            return True

    def detect(self, force_refresh: bool = False) -> dict:
        """
        Returns the best channel for EEG/meditation processing.

        Priority:
          1. sensor == "EEG" (explicit EEG mapping)
          2. sensor == "EMG"  (fallback — single-channel forehead setup)
          3. First enabled channel (last resort)

        Returns dict with keys: channel_index, channel_key, label, sensor_type, found
        """
        if not force_refresh and self._cached is not None and not self._config_changed():
            return self._cached

        config = self._read_config()
        mapping = config.get("channel_mapping", {})

        eeg_candidates = []
        emg_candidates = []
        any_candidates = []

        for ch_key, info in mapping.items():
            if not info.get("enabled", True):
                continue
            try:
                ch_idx = int(str(ch_key).replace("ch", ""))
            except (ValueError, AttributeError):
                continue

            sensor = str(info.get("sensor", "")).upper()
            entry = {
                "channel_index": ch_idx,
                "channel_key": ch_key,
                "label": info.get("label", ch_key),
                "sensor_type": sensor,
            }

            if sensor == "EEG":
                eeg_candidates.append(entry)
            elif sensor == "EMG":
                emg_candidates.append(entry)
            any_candidates.append(entry)

        # Priority selection
        if eeg_candidates:
            result = eeg_candidates[0]
            result["found"] = True
            result["source"] = "eeg_explicit"
        elif emg_candidates:
            result = emg_candidates[0]
            result["found"] = True
            result["source"] = "emg_fallback"
        elif any_candidates:
            result = any_candidates[0]
            result["found"] = True
            result["source"] = "first_enabled"
        else:
            result = {
                "channel_index": 0,
                "channel_key": "ch0",
                "label": "Unknown",
                "sensor_type": "UNKNOWN",
                "found": False,
                "source": "none",
            }

        self._cached = result
        try:
            self._cache_mtime = self.config_path.stat().st_mtime
        except OSError:
            self._cache_mtime = None

        log.info(
            f"ChannelDetector: selected ch{result['channel_index']} "
            f"({result['sensor_type']}, source={result['source']})"
        )
        return result

    def get_channel_index(self) -> int:
        """Convenience: return just the integer channel index."""
        return self.detect()["channel_index"]


# Singleton
_channel_detector = None


def get_channel_detector(config_path: Path = None) -> ChannelDetector:
    global _channel_detector
    if _channel_detector is None:
        _channel_detector = ChannelDetector(config_path)
    return _channel_detector
