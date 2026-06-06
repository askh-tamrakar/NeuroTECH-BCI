"""
HRV Detector
Extracts heart rate variability (HRV) metrics from ECG or EEG signals.

Method:
  1. Band-pass filter 5–15 Hz (captures R-wave energy; also works for
     EEG pulse/BCG artifacts on forehead channels).
  2. Pan-Tompkins derivative-based R-peak detection.
  3. Adaptive thresholding with refractory period.
  4. Compute HR (BPM), SDNN (ms), RMSSD (ms) from RR intervals.

Requires at least 4 seconds of buffered signal (2048 samples @ 512 Hz).
"""
from collections import deque
import logging
import math

log = logging.getLogger(__name__)


class HRVDetector:
    """Real-time HRV extraction from a single-channel physiological signal."""

    def __init__(self, sample_rate: int = 512):
        self.sr = sample_rate
        self.buffer = deque(maxlen=sample_rate * 8)  # 8-second rolling buffer
        self.rr_intervals = deque(maxlen=64)

        # Detection state
        self._last_peak_idx = -999
        self._threshold = 0.0
        self._signal_mean = 0.0
        self._spki = 0.0   # running estimate of signal peak
        self._npki = 0.0   # running estimate of noise peak
        self._t0 = 0.0     # timestamp of first buffered sample

    def _bandpass_filter(self, data: list[float]) -> list[float]:
        """Simple 2nd-order Butterworth band-pass 5–15 Hz (biquad)."""
        nyq = self.sr / 2.0
        low = 5.0 / nyq
        high = 15.0 / nyq

        # Pre-warped cutoff
        w0_low = math.tan(math.pi * low)
        w0_high = math.tan(math.pi * high)
        bw = w0_high - w0_low
        w0_center = math.sqrt(w0_low * w0_high)

        # Butterworth coefficients (2nd order band-pass)
        alpha = math.sin(w0_center) / (2.0 * 0.7071)  # Q=0.7071
        b0 = alpha
        b1 = 0.0
        b2 = -alpha
        a0 = 1.0 + alpha
        a1 = -2.0 * math.cos(w0_center)
        a2 = 1.0 - alpha

        # Normalize
        b = [b0 / a0, b1 / a0, b2 / a0]
        a = [1.0, a1 / a0, a2 / a0]

        y = [0.0] * len(data)
        x = data
        for n in range(2, len(data)):
            y[n] = (
                b[0] * x[n]
                + b[1] * x[n - 1]
                + b[2] * x[n - 2]
                - a[1] * y[n - 1]
                - a[2] * y[n - 2]
            )
        return y[2:]  # trim startup transient

    def _derivative(self, data: list[float]) -> list[float]:
        """5-point derivative (Pan-Tompkins)."""
        n = len(data)
        deriv = [0.0] * n
        for i in range(2, n - 2):
            deriv[i] = (2 * data[i + 2] + data[i + 1] - data[i - 1] - 2 * data[i - 2]) / 8.0
        return deriv

    def _squared(self, data: list[float]) -> list[float]:
        return [d * d for d in data]

    def _moving_average(self, data: list[float], window_ms: int = 150) -> list[float]:
        """Moving-window integration (150 ms default)."""
        win = int(self.sr * window_ms / 1000)
        if win < 1:
            win = 1
        out = [0.0] * len(data)
        cumsum = 0.0
        for i in range(len(data)):
            cumsum += data[i]
            if i >= win:
                cumsum -= data[i - win]
            out[i] = cumsum / win
        return out

    def _detect_peaks(self, integrated: list[float], offset: int = 2) -> list[int]:
        """
        Adaptive threshold peak detection with refractory period.

        Uses running estimates SPKI (signal peak) and NPKI (noise peak)
        to adapt the threshold over time.
        """
        refractory = int(self.sr * 0.25)  # 250 ms refractory
        peaks = []

        for i in range(1, len(integrated) - 1):
            val = integrated[i]
            if val > self._threshold and val > integrated[i - 1] and val > integrated[i + 1]:
                if not peaks or (i - peaks[-1]) > refractory:
                    peaks.append(i)
                    # Update signal peak estimate
                    self._spki = 0.125 * val + 0.875 * self._spki
                else:
                    # Within refractory — treat as noise
                    self._npki = 0.125 * val + 0.875 * self._npki
            else:
                # Update noise estimate from non-peak values
                if val < self._threshold * 0.5:
                    self._npki = 0.125 * val + 0.875 * self._npki

            # Update threshold
            self._threshold = self._npki + 0.25 * (self._spki - self._npki)
            if self._threshold < 0.01:
                self._threshold = 0.01

        return peaks

    def process_sample(self, value: float, timestamp: float = None) -> dict | None:
        """
        Add a single sample and return HRV metrics when new R-peak is detected.

        Returns None when no new peak is found, or a dict:
            {hr_bpm, sdnn_ms, rmssd_ms, rr_ms, rr_intervals, quality}
        """
        self.buffer.append(value)

        # Need at least ~4 seconds of data
        if len(self.buffer) < self.sr * 4:
            return None

        data = list(self.buffer)

        # 1. Band-pass filter
        filtered = self._bandpass_filter(data)
        if len(filtered) < self.sr * 2:
            return None

        # 2. Derivative → square → moving average
        deriv = self._derivative(filtered)
        squared = self._squared(deriv)
        integrated = self._moving_average(squared)

        # Initialize threshold on first run
        if self._threshold <= 0:
            max_val = max(integrated) if integrated else 1.0
            self._threshold = max_val * 0.3
            self._spki = max_val * 0.5
            self._npki = max_val * 0.1

        # 3. Peak detection
        peaks = self._detect_peaks(integrated, offset=2)

        if len(peaks) < 2:
            return None

        # 4. Compute RR intervals (in samples, convert to ms)
        new_intervals = []
        for i in range(1, len(peaks)):
            rr_samples = peaks[i] - peaks[i - 1]
            if 0.3 * self.sr < rr_samples < 2.0 * self.sr:  # 30–200 BPM range
                rr_ms = (rr_samples / self.sr) * 1000.0
                new_intervals.append(rr_ms)
                self.rr_intervals.append(rr_ms)

        if not new_intervals:
            return None

        # 5. Metrics from the full RR-interval history
        rr_list = list(self.rr_intervals)
        if len(rr_list) < 2:
            return None

        mean_rr = sum(rr_list) / len(rr_list)
        hr_bpm = 60000.0 / mean_rr if mean_rr > 0 else 0.0

        # SDNN — standard deviation of all RR intervals
        variance = sum((r - mean_rr) ** 2 for r in rr_list) / len(rr_list)
        sdnn = math.sqrt(variance)

        # RMSSD — root mean square of successive differences
        ssd = 0.0
        for i in range(1, len(rr_list)):
            diff = rr_list[i] - rr_list[i - 1]
            ssd += diff * diff
        rmssd = math.sqrt(ssd / max(len(rr_list) - 1, 1))

        # Quality: fraction of RR intervals within physiological range
        in_range = sum(1 for r in rr_list if 400 < r < 2000)  # 30–150 BPM
        quality = min(100, int((in_range / max(len(rr_list), 1)) * 100))

        return {
            "hr_bpm": round(hr_bpm, 1),
            "sdnn_ms": round(sdnn, 1),
            "rmssd_ms": round(rmssd, 1),
            "rr_ms": round(mean_rr, 1),
            "rr_intervals": [round(r, 1) for r in rr_list[-16:]],
            "quality": quality,
        }

    def reset(self):
        """Clear buffers and state (e.g., on session restart)."""
        self.buffer.clear()
        self.rr_intervals.clear()
        self._last_peak_idx = -999
        self._threshold = 0.0
        self._spki = 0.0
        self._npki = 0.0
