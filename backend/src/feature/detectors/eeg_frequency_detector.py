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
        self.target_freqs = sorted(eeg_config.get("target_freqs", [6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 20.0]), reverse=True)
        self.window_len_sec = eeg_config.get("window_len_sec", 1.0)
        self.num_harmonics = eeg_config.get("num_harmonics", 3)
        self.rest_threshold = eeg_config.get("rest_threshold", 0.40) # Increased from 0.25 for higher noise immunity
        self.debounce_ms = eeg_config.get("debounce_ms", 500)
        
        # Clear score history on config reload to prevent dimension mismatches
        if hasattr(self, 'score_history'):
            self.score_history = None
            
        # FBCCA Settings
        self.num_subbands = 3
        self.subband_weights = [(k + 1)**(-1.25) + 0.25 for k in range(self.num_subbands)]
        self.total_weight = sum(self.subband_weights)
        
        # Initialize CCA and Reference Signals
        self.cca = CCA(n_components=1)
        self.window_samples = int(self.window_len_sec * self.sampling_rate)
        self.references = [self._generate_ref(f) for f in self.target_freqs]
        
        # Prep filters for sub-bands
        self.subband_filters = []
        for i in range(self.num_subbands):
            # Optimized FBCCA bands for broad support (6Hz - 20Hz)
            # SB1: [5, 88], SB2: [12, 88], SB3: [19, 88]
            low = max(5.0, 7.0 * (i + 1) - 2.0)
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
            
        # Instead of absolute correlation thresholds (which fail on real EEG due to 1/f noise),
        # calculate the Signal-to-Noise Ratio (SNR) for the targets.
        target_scores = np.array(target_scores)
        mean_score = np.mean(target_scores)
        snr_scores = target_scores / (mean_score + 1e-6) # relative power compared to background
            
        # EMA Smoothing for SNR to prevent continuous bouncing
        if not hasattr(self, 'snr_history') or self.snr_history is None:
            self.snr_history = snr_scores
        else:
            alpha = 0.4 # Smoothing factor
            self.snr_history = alpha * snr_scores + (1 - alpha) * self.snr_history
            
        max_snr = np.max(self.snr_history)
        best_idx = np.argmax(self.snr_history)
        detected_freq = self.target_freqs[best_idx]
        
        # --- True Harmonic Correction ---
        # Canonical Correlation is mathematically biased toward LOWER frequencies (sub-harmonics).
        # E.g., a pure 20Hz signal perfectly matches a 10Hz reference's 2nd harmonic, making 10Hz score highly.
        # If 10Hz is detected, we check if 20Hz (its harmonic) ALSO has a high score. If so, 20Hz is the REAL signal.
        for i, f_other in enumerate(self.target_freqs):
            if i == best_idx: continue
            for multiplier in [2, 3]:
                if abs(f_other - (detected_freq * multiplier)) < 0.2:
                    harmonic_snr = self.snr_history[i]
                    # If the true signal is 20Hz, then target 20Hz will have an extremely strong SNR too
                    if harmonic_snr > (max_snr * 0.75): 
                        print(f"✅ True Harmonic Corrected: {detected_freq}Hz was sub-harmonic, real signal is {f_other}Hz")
                        detected_freq = f_other
                        best_idx = i
                        max_snr = harmonic_snr
                        break
        
        # Heuristic: 10Hz is common brain alpha noise. Apply penalty if it barely exceeds background.
        if detected_freq == 10.0 and max_snr < 1.3:
             max_snr *= 0.8
        
        # Real EEG detection requires the target to stand out from the mean background by ~1.15x (15%)
        # In neurobench with no targets, SNR ~ 1.0. With a clear target, SNR spikes to 1.5 - 3.0.
        snr_threshold = 1.15
        
        if max_snr < snr_threshold:
            live_event = "REST"
        else:
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
                    print(f"FBCCA Confirmed: {confirmed} (SNR: {max_snr:.2f}x)")
        
        return live_event, confirmed

    def update_config(self, config: dict):
        self.config = config
        self._load_config()
