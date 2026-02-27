import numpy as np
import collections
from scipy import stats

class RPSExtractor:
    """
    Feature Extractor for EMG Rock-Paper-Scissors.
    Extracts time-domain features from a sliding window.
    """
    
    def __init__(self, channel_index: int, config: dict, sr: int):
        self.channel_index = channel_index
        self.sr = sr
        
        # Window settings
        # Window size 512 samples (~1s at 512Hz)
        self.buffer_size = 512 
        # Stride 64 samples (~125ms update rate) for responsiveness
        self.stride = 64 
        
        self.buffer = collections.deque(maxlen=self.buffer_size)
        self.sample_count = 0
        
    def process(self, sample_val: float):
        """
        Process a single sample.
        Returns features if window is ready, else None.
        """
        self.buffer.append(sample_val)
        self.sample_count += 1
        
        # Only extract when buffer is full and at stride matches
        if len(self.buffer) == self.buffer_size and self.sample_count % self.stride == 0:
            return self._extract_features(list(self.buffer))
            
        return None

    @staticmethod
    def extract_features(window: list | np.ndarray, sr: int = None) -> dict:
        """
        Static method for stateless feature extraction.
        """
        if not window or len(window) == 0:
            return {}

        # 0. Robustness: Convert to numpy and handle NaN/Inf in raw data
        data = np.nan_to_num(np.array(window), nan=0.0, posinf=0.0, neginf=0.0)
        
        # 1. RMS (Root Mean Square)
        rms = np.sqrt(np.mean(data**2))
        
        # 2. MAV (Mean Absolute Value)
        mav = np.mean(np.abs(data))
        
        # 3. Variance
        var = np.var(data)
        
        # 4. WL (Waveform Length)
        diff = np.diff(data)
        wl = np.sum(np.abs(diff))
        
        # 5. Peak (Max Absolute Amplitude)
        peak = np.max(np.abs(data))
        
        # 6. Range (Max - Min)
        rng = np.ptp(data)
        
        # 7. IEMG (Integrated EMG)
        iemg = np.sum(np.abs(data))
        
        # 8. Entropy (Approximate entropy via histogram)
        try:
            # BUG FIX: If all data points are same, range is 0. 
            # np.histogram with density=True will have divide-by-zero or inf density.
            # We add a tiny jitter to force a valid distribution or handle it.
            if rng == 0:
                entropy = 0.0
            else:
                hist, _ = np.histogram(data, bins=10, density=True)
                # Remove zeros to avoid log(0)
                hist = hist[hist > 0]
                entropy = -np.sum(hist * np.log2(hist))
        except:
            entropy = 0.0
        
        # 9. Energy
        energy = np.sum(data**2)

        # 10. Kurtosis (Peakedness)
        kurt = stats.kurtosis(data)

        # 11. Skewness (Asymmetry)
        skew = stats.skew(data)

        # 12. SSC (Slope Sign Changes)
        ssc = np.sum(((diff[:-1] * diff[1:]) < 0))

        # 13. WAMP (Willison Amplitude)
        wamp_threshold = 0.0001
        wamp = np.sum(np.abs(diff) > wamp_threshold)
        
        # GLOBAL ROBUSTNESS: 
        # Ensure all values are finite and fit in float32 for sklearn.
        # We use a large finite number for inf/NaN.
        raw_features = {
            "rms": rms,
            "mav": mav,
            "var": var,
            "wl": wl,
            "peak": peak,
            "range": rng,
            "iemg": iemg,
            "entropy": entropy,
            "energy": energy,
            "kurtosis": kurt,
            "skewness": skew,
            "ssc": ssc,
            "wamp": wamp,
        }
        
        cleaned_features = {}
        for k, v in raw_features.items():
            # Convert to float, handle NaN/Inf, clip to a sane large range
            val = np.nan_to_num(v, nan=0.0, posinf=1e6, neginf=-1e6)
            # sklearn's float32 goes up to ~3.4e38, but 1e6 is very safe for these features
            # except IEMG/Energy which might be larger, but still safe.
            cleaned_features[k] = float(val)

        return cleaned_features

    def _extract_features(self, window):
        """
        Internal wrapper to maintain compatibility and add timestamp.
        """
        features = RPSExtractor.extract_features(window, self.sr)
        features["timestamp"] = self.sample_count / self.sr
        return features

    def update_config(self, config: dict):
        # Currently no dynamic config needed for extractor, but defined for interface consistency
        pass
