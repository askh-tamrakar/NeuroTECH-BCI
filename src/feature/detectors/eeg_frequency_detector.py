import numpy as np
from sklearn.cross_decomposition import CCA
from scipy.signal import detrend, butter, filtfilt
import time

class EEGFrequencyDetector:
    """
    Detects SSVEP target frequencies using Filter Bank Canonical Correlation Analysis (FBCCA).
    """
    
    def __init__(self, config: dict):
        self.config = config
        self.last_event_ts = 0.0
        self._load_config()
        
    def _load_config(self):
        eeg_config = self.config.get("features", {}).get("EEG", {})
        
        # SSVEP Settings
        self.sampling_rate = self.config.get("sampling_rate", 512)
        # Default 6 targets if not specified
        self.target_freqs = eeg_config.get("target_freqs", [9.0, 10.0, 11.0, 12.0, 13.0, 15.0])
        self.window_len_sec = eeg_config.get("window_len_sec", 1.0)
        self.num_harmonics = eeg_config.get("num_harmonics", 3)
        self.rest_threshold = eeg_config.get("rest_threshold", 0.35)
        self.debounce_ms = eeg_config.get("debounce_ms", 500)
        
        # FBCCA Settings
        self.num_subbands = 3
        self.subband_weights = [(k + 1)**(-1.25) + 0.25 for k in range(self.num_subbands)]
        
        # Initialize CCA and Reference Signals
        self.cca = CCA(n_components=1)
        self.window_samples = int(self.window_len_sec * self.sampling_rate)
        self.references = [self._generate_ref(f) for f in self.target_freqs]
        
        # Prep filters for sub-bands
        self.subband_filters = []
        for i in range(self.num_subbands):
            # Typical FBCCA bands: [8*i, 88] Hz
            low = max(0.5, 8.0 * (i + 1))
            high = min(self.sampling_rate / 2 - 1, 88.0)
            b, a = butter(4, [low, high], btype='bandpass', fs=self.sampling_rate)
            self.subband_filters.append((b, a))

    def _generate_ref(self, f):
        """Creates sine/cosine reference signals (fundamental + harmonics)"""
        t = np.linspace(0, self.window_samples / self.sampling_rate, self.window_samples, endpoint=False)
        ref = []
        for h in range(1, self.num_harmonics + 1):
            ref.append(np.sin(2 * np.pi * h * f * t))
            ref.append(np.cos(2 * np.pi * h * f * t))
        return np.array(ref).T

    def detect(self, features: dict) -> str | None:
        """
        Uses FBCCA to detect if the user is looking at a target frequency.
        Expects 'raw_window' in the features dictionary.
        """
        if not features or "raw_window" not in features:
            return None
            
        current_time = time.time()
        # Apply Debounce
        if (current_time - self.last_event_ts) * 1000 < self.debounce_ms:
            return None
            
        raw_data = np.array(features["raw_window"])
        if len(raw_data) < self.window_samples:
            return None
            
        # Detrend to remove DC bias
        raw_data = detrend(raw_data)
        
        # If single channel, reshape to (samples, 1)
        if raw_data.ndim == 1:
            raw_data = raw_data.reshape(-1, 1)
            
        target_scores = []
        
        # FBCCA Logic
        for ref in self.references:
            weighted_corr = 0
            for k in range(self.num_subbands):
                b, a = self.subband_filters[k]
                # Filter the signal for this sub-band
                y = filtfilt(b, a, raw_data, axis=0)
                
                # Compute CCA
                try:
                    self.cca.fit(y, ref)
                    x_score, y_score = self.cca.transform(y, ref)
                    corr = np.corrcoef(x_score[:, 0], y_score[:, 0])[0, 1]
                    weighted_corr += self.subband_weights[k] * (corr ** 2)
                except Exception:
                    continue
            
            target_scores.append(weighted_corr)
            
        if not target_scores:
            return None
            
        max_score = max(target_scores)
        best_idx = np.argmax(target_scores)
        
        if max_score < self.rest_threshold:
            # We treat Rest as a valid state but might return None or "Rest" 
            # depending on how Router handles it. RPS game needs "Rest".
            return "REST"
        
        detected_freq = self.target_freqs[best_idx]
        event_name = f"TARGET_{str(detected_freq).replace('.', '_')}HZ"
        
        self.last_event_ts = current_time
        print(f"[EEGFrequencyDetector] FBCCA Detected: {event_name} (Score: {max_score:.3f})")
        return event_name

    def update_config(self, config: dict):
        self.config = config
        self._load_config()
