import numpy as np
import collections
from scipy import stats

class RPSExtractor:
    """
    Feature Extractor for EMG Rock-Paper-Scissors.
    Extracts time-domain, frequency-domain, and delta features from sliding windows.
    Buffers both RAW and ENVELOPE filtered signals.
    """
    
    def __init__(self, channel_index: int, config: dict, sr: int):
        self.channel_index = channel_index
        self.sr = sr
        
        # Session Windows from config if available, else fallback
        self.buffer_size = 512 # Default fallback, will be overwritten if config passed properly
        self.stride = 64
        
        # If config is passed from router properly (via Facade getting all), try to load window_ms
        try:
            from src.config.window_config import SESSION_CONFIG, calculate_window_samples
            # If the backend has window_config, we use dynamic constraints.
            w_samples, s_samples = calculate_window_samples()
            if w_samples > 0:
                self.buffer_size = w_samples
                self.stride = s_samples
        except:
            pass
            
        print(f"[RPS Extractor] Init | Win: {self.buffer_size} | Stride: {self.stride}")
        
        self.raw_buffer = collections.deque(maxlen=self.buffer_size)
        self.env_buffer = collections.deque(maxlen=self.buffer_size)
        self.sample_count = 0
        self.last_features = None # Store previous features for Delta calculation
        
    def process(self, raw_val: float, env_val: float):
        """
        Process a single sample pair.
        Returns features if window is ready, else None.
        """
        self.raw_buffer.append(raw_val)
        self.env_buffer.append(env_val)
        self.sample_count += 1
        
        # Only extract when buffer is full and at stride matches
        if len(self.raw_buffer) == self.buffer_size and self.sample_count % self.stride == 0:
            return self._extract_features(list(self.raw_buffer), list(self.env_buffer))
            
        return None

    @staticmethod
    def extract_features(raw_window: list | np.ndarray, env_window: list | np.ndarray, last_features: dict = None, sr: int = 1000) -> dict:
        """
        Static method for stateless feature extraction.
        Extracts specific features from Raw vs Enveloped signals.
        """
        if not raw_window or len(raw_window) == 0:
            return {}

        # 0. Robustness: Convert to numpy and handle NaN/Inf in raw data
        raw_data = np.nan_to_num(np.array(raw_window), nan=0.0, posinf=0.0, neginf=0.0)
        env_data = np.nan_to_num(np.array(env_window), nan=0.0, posinf=0.0, neginf=0.0)
        
        # === A. ENVELOPE FEATURES ===
        # RMS (Root Mean Square)
        rms = np.sqrt(np.mean(env_data**2))
        
        # MAV (Mean Absolute Value)
        mav = np.mean(np.abs(env_data))
        
        # Variance
        var = np.var(env_data)
        
        # IEMG (Integrated EMG)
        iemg = np.sum(np.abs(env_data))
        
        # === B. RAW FEATURES ===
        # WL (Waveform Length)
        diff_raw = np.diff(raw_data)
        wl = np.sum(np.abs(diff_raw))
        
        # ZC (Zero Crossings)
        zc_threshold = 0.0001
        zc = np.sum(np.abs(np.diff(np.sign(raw_data))) >= 2) # Strict zero crossing
        # Add basic noise rejection to ZC
        zc = np.sum(((raw_data[:-1] * raw_data[1:]) < 0) & (np.abs(raw_data[:-1] - raw_data[1:]) > zc_threshold))

        # SSC (Slope Sign Changes)
        ssc_threshold = 0.0001
        ssc = np.sum(((diff_raw[:-1] * diff_raw[1:]) < 0) & (np.abs(diff_raw[:-1]) > ssc_threshold))
        
        # === C. FREQUENCY DOMAIN FEATURES (On Raw Signal) ===
        try:
            # Calculate FFT
            n = len(raw_data)
            fft_vals = np.abs(np.fft.rfft(raw_data))
            freqs = np.fft.rfftfreq(n, d=1.0/sr)
            
            # Power Spectral Density (PSD)
            psd = (fft_vals ** 2) / n
            total_power = np.sum(psd)
            
            if total_power > 0:
                # Mean Frequency (MNF)
                mean_freq = np.sum(freqs * psd) / total_power
                
                # Median Frequency (MDF) - Splitting power in half
                cum_power = np.cumsum(psd)
                median_freq = freqs[np.searchsorted(cum_power, total_power / 2.0)]
                
                # Spectral Entropy
                # Normalize PSD to make it a probability distribution
                psd_norm = psd / total_power
                # Remove absolute zeros for log operations
                psd_norm = psd_norm[psd_norm > 0]
                spectral_entropy = -np.sum(psd_norm * np.log2(psd_norm))
            else:
                mean_freq = 0.0
                median_freq = 0.0
                spectral_entropy = 0.0
        except:
            mean_freq = 0.0
            median_freq = 0.0
            spectral_entropy = 0.0
            
        raw_features = {
            "rms": rms,
            "mav": mav,
            "var": var,
            "iemg": iemg,
            "wl": wl,
            "zc": float(zc),
            "ssc": float(ssc),
            "mean_freq": float(mean_freq),
            "median_freq": float(median_freq),
            "spectral_entropy": float(spectral_entropy),
        }
        
        # Ensure all values are finite float32
        cleaned_features = {}
        for k, v in raw_features.items():
            val = np.nan_to_num(v, nan=0.0, posinf=1e6, neginf=-1e6)
            cleaned_features[k] = float(val)

        # === D. DELTA FEATURES ===
        # differencing consecutive feature vectors (d_rms, d_mav)
        if last_features:
            cleaned_features["d_rms"] = cleaned_features["rms"] - last_features.get("rms", cleaned_features["rms"])
            cleaned_features["d_mav"] = cleaned_features["mav"] - last_features.get("mav", cleaned_features["mav"])
        else:
            cleaned_features["d_rms"] = 0.0
            cleaned_features["d_mav"] = 0.0

        return cleaned_features

    def _extract_features(self, raw_window, env_window):
        """ Internal wrapper to add delta state and timestamp """
        features = RPSExtractor.extract_features(raw_window, env_window, self.last_features, self.sr)
        features["timestamp"] = self.sample_count / self.sr
        self.last_features = features.copy()
        return features

    def update_config(self, config: dict):
        pass
