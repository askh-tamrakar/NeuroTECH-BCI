"""
ECG Feature Extractor

Sliding-window extractor that runs a simplified Pan-Tompkins R-peak detector
on each window and returns heart-rate features.

Window : 2048 samples (~4 s at 512 Hz) — long enough for reliable RR intervals
Stride :  128 samples (~250 ms)
"""

import collections
import numpy as np
from scipy.signal import find_peaks


class ECGExtractor:
    def __init__(self, channel_index: int, config: dict, sr: int = 512):
        self.channel_index = channel_index
        self.sr = sr

        # Window / stride
        self.buffer_size = int(sr * 4)   # 4-second window
        self.stride      = max(1, int(sr * 0.25))  # 250 ms stride

        self.buffer       = collections.deque(maxlen=self.buffer_size)
        self.sample_count = 0

    # ------------------------------------------------------------------

    def process(self, sample_val: float):
        """Accumulate one sample; return feature dict at each stride."""
        self.buffer.append(float(sample_val))
        self.sample_count += 1

        if len(self.buffer) == self.buffer_size and self.sample_count % self.stride == 0:
            return self.extract_features(list(self.buffer), self.sr)

        return None

    # ------------------------------------------------------------------

    @staticmethod
    def extract_features(window: list, sr: int = 512) -> dict:
        if not window or len(window) < sr:
            return {}

        data = np.nan_to_num(np.array(window, dtype=np.float64), nan=0.0, posinf=0.0, neginf=0.0)

        # ── 1. Basic amplitude stats ─────────────────────────────────
        rms             = float(np.sqrt(np.mean(data ** 2)))
        amplitude_range = float(np.ptp(data))
        signal_mean     = float(np.mean(data))

        # ── 2. Pan-Tompkins simplified R-peak detection ──────────────
        # Derivative → square → moving-window integration
        deriv    = np.diff(data)
        deriv_sq = deriv ** 2

        # Integration window: ~150 ms
        win_len = max(1, int(sr * 0.15))
        kernel   = np.ones(win_len) / win_len
        integral = np.convolve(deriv_sq, kernel, mode='same')

        # Adaptive threshold: 50% of MAX — noise with uniform amplitude is rejected
        thresh = 0.5 * float(np.max(integral))
        thresh = max(thresh, 1e-9)   # never zero

        # Refractory period: 300 ms between beats (caps at ~200 BPM max)
        min_dist = max(1, int(sr * 0.30))

        peaks, properties = find_peaks(integral, height=thresh, distance=min_dist)

        r_peak_count     = int(len(peaks))
        r_peak_indices   = peaks.tolist()

        # ── 3. RR intervals & heart rate ─────────────────────────────
        rr_intervals_ms: list = []
        bpm_estimate: float | None = None
        rr_sdnn: float | None = None

        if r_peak_count >= 2:
            rr_samples  = np.diff(peaks).astype(float)
            all_rr_ms   = (rr_samples / sr * 1000.0).tolist()

            # Physiological filter: 300–2000 ms = 30–200 BPM
            rr_intervals_ms = [rr for rr in all_rr_ms if 300.0 <= rr <= 2000.0]

            if len(rr_intervals_ms) >= 1:
                # Median is robust against single ectopic beats
                bpm_estimate = float(60_000.0 / float(np.median(rr_intervals_ms)))

                if len(rr_intervals_ms) >= 2:
                    rr_sdnn = float(np.std(rr_intervals_ms, ddof=1))

        # ── 4. Signal quality proxy (SNR estimate) ───────────────────
        signal_quality = 0.0
        if amplitude_range > 0 and r_peak_count >= 1:
            peak_heights   = float(np.mean(integral[peaks])) if len(peaks) else 0.0
            noise_floor    = max(float(np.mean(integral)), 1e-9)
            signal_quality = float(np.clip(peak_heights / noise_floor - 1.0, 0.0, 1.0))

        return {
            "rms":              rms,
            "amplitude_range":  amplitude_range,
            "signal_mean":      signal_mean,
            "r_peak_count":     r_peak_count,
            "r_peak_indices":   r_peak_indices,
            "rr_intervals_ms":  rr_intervals_ms,
            "bpm_estimate":     bpm_estimate,
            "rr_sdnn":          rr_sdnn,
            "signal_quality":   signal_quality,
        }
