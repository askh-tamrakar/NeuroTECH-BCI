import numpy as np
import collections
from scipy import stats

class BlinkExtractor:
    """
    Feature Extractor for EOG blinks.
    Maintains a rolling buffer and detects peak candidates to extract features.
    """
    
    def __init__(self, 
                 channel_index: int, 
                 config: dict, 
                 sr: int):
        
        self.channel_index = channel_index
        self.sr = sr
        
        # Load thresholds from config
        eog_cfg = config.get("features", {}).get("EOG", {})
        # User collected data shows ~1000uV blinks, so 300 threshold is reasonable
        self.amp_threshold = eog_cfg.get("amp_threshold", 300.0) 
        self.min_duration_ms = eog_cfg.get("min_duration_ms", 50.0)
        self.max_duration_ms = eog_cfg.get("max_duration_ms", 900.0) 
        
        # Hang-time / Grace period to prevent premature window closure
        self.grace_period_ms = 25.0
        self.silence_samples_count = 0
        
        # Buffer for signal (approx 1 second of data)
        self.buffer_size = sr 
        self.buffer = collections.deque(maxlen=self.buffer_size)
        
        # Baseline estimation (rolling mean)
        self.baseline = 0.0
        self.alpha = 0.001 # Reduced from 0.01 to prevent baseline "following" the blink
        
        # State tracking
        self.is_collecting = False
        self.candidate_window = []
        self.start_idx = 0
        self.current_idx = 0
        
    def process(self, sample_val: float):
        """
        Process a single sample. 
        Returns a feature dictionary if a blink candidate window is finished, else None.
        """
        self.current_idx += 1
        
        # Update baseline (very slow moving average)
        if self.current_idx == 1:
            self.baseline = sample_val
        else:
            self.baseline = self.alpha * sample_val + (1 - self.alpha) * self.baseline
            
        # Zero-centered signal
        zero_centered = sample_val - self.baseline
        self.buffer.append(zero_centered)
        
        # Detection logic:
        # Start collecting when value exceeds threshold (relative to baseline)
        if not self.is_collecting:
            if abs(zero_centered) > self.amp_threshold:
                self.is_collecting = True
                self.candidate_window = [zero_centered]
                self.start_idx = self.current_idx
                
                print(f"[Extractor] Candidate start at {self.current_idx} (Val: {zero_centered:.2f})")
        else:
            self.candidate_window.append(zero_centered)
            
            # Transition to closing:
            # Instead of closing immediately when below threshold, wait for grace period
            if abs(zero_centered) < self.amp_threshold / 4:
                self.silence_samples_count += 1
            else:
                self.silence_samples_count = 0 # Reset if signal spikes again
                
            # If silence exceeds grace period OR window exceeds max duration, close it
            grace_samples = (self.grace_period_ms / 1000.0) * self.sr
            max_samples = (self.max_duration_ms / 1000.0) * self.sr
            
            is_timeout = len(self.candidate_window) >= max_samples
            is_grace_over = self.silence_samples_count >= grace_samples
            
            if (is_grace_over or is_timeout) and len(self.candidate_window) > (self.min_duration_ms / 1000.0) * self.sr:
                # Trim trailing silence to keep duration/features accurate
                if is_grace_over:
                    trim_idx = int(len(self.candidate_window) - self.silence_samples_count)
                    trimmed_window = self.candidate_window[:max(1, trim_idx)]
                else:
                    trimmed_window = self.candidate_window
                    
                win_len = len(trimmed_window)
                features = self._extract_features(trimmed_window)
                
                self.is_collecting = False
                self.candidate_window = []
                self.silence_samples_count = 0
                
                status = "timed out" if is_timeout else "finished"
                print(f"[Extractor] Window {status}: {win_len} samples. Peaks: {features.get('peak_count')}")
                return features
                
        return None

    @staticmethod
    def extract_features(data: list | np.ndarray, sr: int) -> dict:
        """
        Extract temporal and morphological features from a signal window.
        Static method for stateless usage.
        """
        if not len(data):
            return {}

        data = np.array(data)
        abs_data = np.abs(data)
        
        peak_idx = np.argmax(abs_data)
        peak_amp = abs_data[peak_idx]
        
        duration_ms = (len(data) / sr) * 1000.0
        rise_time_ms = (peak_idx / sr) * 1000.0
        fall_time_ms = ((len(data) - peak_idx) / sr) * 1000.0
        
        asymmetry = rise_time_ms / (fall_time_ms + 1e-6)
        
        # New Feature: Peak Counting (for Double Blink Detection)
        # Fix: Only count peaks with the same polarity as the main peak
        # to avoid miscounting biphasic rebounds as double blinks.
        from scipy.signal import find_peaks
        peak_amp_raw = data[peak_idx]
        detect_data = data if peak_amp_raw > 0 else -data
        
        peak_amp_raw = data[peak_idx]
        detect_data = data if peak_amp_raw > 0 else -data
        
        # Hybrid prominence: 40% of peak (robust) but at least 150uV to ignore overshoot/noise
        prom_threshold = max(150.0, abs(peak_amp_raw) * 0.3)
        peaks, _ = find_peaks(detect_data, prominence=prom_threshold, distance=sr * 0.1)
        peak_count = len(peaks)
        
        # Statistical features
        kurt = float(np.nan_to_num(stats.kurtosis(data)))
        skew = float(np.nan_to_num(stats.skew(data)))
        
        features = {
            "amplitude": float(peak_amp),
            "duration_ms": float(duration_ms),
            "rise_time_ms": float(rise_time_ms),
            "fall_time_ms": float(fall_time_ms),
            "asymmetry": float(asymmetry),
            "peak_count": int(peak_count),
            "kurtosis": kurt,
            "skewness": skew
        }
        
        return features

    def _extract_features(self, window):
        """
        Internal wrapper to maintain compatibility and add timestamp.
        """
        features = BlinkExtractor.extract_features(window, self.sr)
        features["timestamp"] = self.current_idx / self.sr
        return features

    def update_config(self, config: dict):
        eog_cfg = config.get("features", {}).get("EOG", {})
        self.amp_threshold = eog_cfg.get("amp_threshold", self.amp_threshold)
        self.min_duration_ms = eog_cfg.get("min_duration_ms", self.min_duration_ms)
        self.max_duration_ms = eog_cfg.get("max_duration_ms", self.max_duration_ms)

    @staticmethod
    def extract_features_smart(data: list | np.ndarray, sr: int) -> dict:
        """
        Smart extraction for Training Data.
        Locates the principal pulse/blink within a larger window (e.g. 1s) 
        and crops it before extracting features, to match real-time behavior.
        """
        if not len(data): return {}
        
        data = np.array(data)
        # 1. Remove baseline (simple mean subtraction of first few samples)
        baseline = np.mean(data[:min(len(data), 20)])
        data_centered = data - baseline
        abs_data = np.abs(data_centered)
        
        # 2. Find Max Peak
        peak_idx = np.argmax(abs_data)
        peak_amp = abs_data[peak_idx]
        
        # 3. If Peak is low (likely Rest/Noise), return whole window features
        # Threshold: assume blinks are > 100uV? 
        # Real-time uses 300uV. Let's use 100uV to be safe for training data variance.
        if peak_amp < 100:
             # Just return standard features on full window (this is a Rest sample)
             return BlinkExtractor.extract_features(data_centered, sr)
             
        # 4. Find crop boundaries by looking for the first and last "active" samples
        # active = above 10% of main peak
        threshold_low = peak_amp * 0.1
        active_indices = np.where(abs_data > threshold_low)[0]
        
        if len(active_indices) > 0:
            start_idx = max(0, active_indices[0] - 50) # Buffer 50 samples
            end_idx = min(len(data) - 1, active_indices[-1] + 50) # Buffer 50 samples
        else:
            start_idx = 0
            end_idx = len(data) - 1
                
        # 5. Extract features on CROP
        # Ensure crop is at least minimal length (e.g. 10 samples)
        if end_idx - start_idx < 5:
            start_idx = max(0, peak_idx - 10)
            end_idx = min(len(data), peak_idx + 10)
            
        cropped = data_centered[start_idx:end_idx+1]
        
        # Debug
        # print(f"[SmartExtract] Crop: {len(cropped)} samples (from {len(data)}). Peak: {peak_amp:.1f}")
        
        return BlinkExtractor.extract_features(cropped, sr)
