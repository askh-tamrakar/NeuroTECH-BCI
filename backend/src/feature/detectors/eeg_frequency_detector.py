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
        self.target_freqs = eeg_config.get("target_freqs", [6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 20.0])
        self.window_len_sec = eeg_config.get("window_len_sec", 1.0)
        self.num_harmonics = eeg_config.get("num_harmonics", 3)
        self.rest_threshold = eeg_config.get("rest_threshold", 0.15) # Lowered from 0.35 for realistic EEG SNR
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
            # Adjusted FBCCA bands to support 6Hz while maintaining separation
            # Previous was 8*i+1 (8, 16, 24). New is 8*i+1 - 2.0 (6, 14, 22).
            low = max(0.5, 8.0 * (i + 1) - 2.0)
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
            
        # EMA Smoothing for scores to prevent continuous bouncing
        if not hasattr(self, 'score_history') or self.score_history is None:
            self.score_history = np.array(target_scores)
        else:
            alpha = 0.4 # Smoothing factor (lower = smoother, higher = more responsive)
            self.score_history = alpha * np.array(target_scores) + (1 - alpha) * self.score_history
            
        max_score = np.max(self.score_history)
        best_idx = np.argmax(self.score_history)
        
        if max_score < self.rest_threshold:
            live_event = "REST"
        else:
            detected_freq = self.target_freqs[best_idx]
            live_event = f"TARGET_{str(detected_freq).replace('.', '_')}HZ"
            
        # Initialize debounce trackers
        if not hasattr(self, 'current_stable_target'):
            self.current_stable_target = live_event
            self.stable_target_start = current_time
            self.last_emitted_ts = 0.0
            
        # Debounce logic: target must remain stable
        if live_event != self.current_stable_target:
            self.current_stable_target = live_event
            self.stable_target_start = current_time
            
        confirmed = None
        
        # Check if the signal has been stable long enough
        if (current_time - self.stable_target_start) * 1000 >= self.debounce_ms:
            # Emit a confirmed event at most once per debounce_ms for the same stable target
            if (current_time - self.last_emitted_ts) * 1000 >= self.debounce_ms:
                confirmed = self.current_stable_target
                self.last_emitted_ts = current_time
                if confirmed != "REST":
                    print(f"FBCCA Confirmed: {confirmed} (Score: {max_score:.3f})")
        
        return live_event, confirmed

    def update_config(self, config: dict):
        self.config = config
        self._load_config()
