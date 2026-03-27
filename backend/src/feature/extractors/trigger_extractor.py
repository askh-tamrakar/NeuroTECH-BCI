import numpy as np
import collections
from scipy import signal
from src.feature.ssvep_utils import DEFAULT_TARGET_FREQS, compute_ssvep_features

class EEGExtractor:
    """
    Feature Extractor for EEG.
    Extracts frequency-domain features (Band Powers) from a sliding window.
    """
    
    def __init__(self, channel_index: int, config: dict, sr: int):
        self.channel_index = channel_index
        self.sr = sr

        self._load_config(config)
        self.buffer = collections.deque(maxlen=self.buffer_size)
        self.sample_count = 0
        
    def _load_config(self, config):
        self.config = config
        eeg_cfg = self.config.get("features", {}).get("EEG", {})
        self.window_len_sec = float(eeg_cfg.get("window_len_sec", 1.5))
        self.step_sec = float(eeg_cfg.get("step_sec", 0.25))
        self.num_harmonics = int(eeg_cfg.get("num_harmonics", 4))
        self.target_freqs = eeg_cfg.get("target_freqs", DEFAULT_TARGET_FREQS)
        self.buffer_size = max(1, int(self.sr * self.window_len_sec))
        self.stride = max(1, int(self.sr * self.step_sec))
        self.freq_bands = eeg_cfg.get("freq_bands", {
            "delta": [0.5, 4],
            "theta": [4, 8],
            "alpha": [8, 13],
            "beta": [13, 30]
        })
        if hasattr(self, "buffer"):
            self.buffer = collections.deque(list(self.buffer)[-self.buffer_size:], maxlen=self.buffer_size)
        
    def process(self, sample_val: float):
        """
        Process a single sample.
        Returns features if window is ready, else None.
        """
        self.buffer.append(sample_val)
        self.sample_count += 1
        
        if len(self.buffer) == self.buffer_size and self.sample_count % self.stride == 0:
            return self._extract_features(list(self.buffer))
            
        return None

    def _extract_features(self, window):
        data = np.array(window)
        ssvep_features = compute_ssvep_features(
            data,
            sr=self.sr,
            target_freqs=self.target_freqs,
            num_harmonics=self.num_harmonics,
        )

        freqs, psd = signal.welch(data, self.sr, nperseg=len(data))
        features = dict(ssvep_features)
        features["timestamp"] = self.sample_count / self.sr
        features["raw_window"] = data.tolist()
        
        total_power = 0
        for band, (low, high) in self.freq_bands.items():
            idx = np.logical_and(freqs >= low, freqs <= high)
            power = np.sum(psd[idx])
            features[band] = float(power)
            total_power += power
            
        features["total_power"] = float(total_power)
        
        if total_power > 0:
            for band in self.freq_bands.keys():
                features[f"{band}_rel"] = features[band] / total_power
        
        return features

    def update_config(self, config: dict):
        self._load_config(config)
