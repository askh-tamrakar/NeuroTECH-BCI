"""
ECG Detector

Stateful detector that tracks R-peaks emitted by ECGExtractor and computes:
  - Smoothed BPM (exponential moving average over last 8 estimates)
  - RR mean and SDNN (HRV proxy)
  - Emits a 'Heartbeat' confirmed label whenever a new beat is detected

Return tuple: (instant_label, confirmed_label_or_None, detection_state)
  instant_label   : always "ecg_live"  (used for continuous ecg_prediction events)
  confirmed_label : "Heartbeat" on a new R-peak, else None
  detection_state : "measuring" | "acquiring"
"""

import time
import collections


class ECGDetector:
    # EMA smoothing factor (higher = more responsive, lower = smoother)
    EMA_ALPHA = 0.25

    def __init__(self, config: dict):
        self.config = config

        # BPM smoothing history
        self._bpm_history: collections.deque = collections.deque(maxlen=8)
        self._smooth_bpm: float | None = None

        # Beat tracking
        self._last_r_peak_count: int = 0
        self._last_beat_time: float  = 0.0

        # Refractory guard: ignore duplicate Heartbeat emissions faster than 300 ms
        self._heartbeat_refractory_s: float = 0.30

    # ------------------------------------------------------------------

    def detect(self, features: dict) -> tuple:
        """
        Process one feature window.
        Returns (instant_label, confirmed_label, detection_state).
        """
        r_peak_count  = int(features.get("r_peak_count", 0))
        bpm_estimate  = features.get("bpm_estimate")   # float | None
        rr_intervals  = features.get("rr_intervals_ms", [])
        rr_sdnn       = features.get("rr_sdnn")
        signal_quality = float(features.get("signal_quality", 0.0))

        # ── 1. Update smoothed BPM ───────────────────────────────────
        if bpm_estimate is not None and 35.0 < bpm_estimate < 200.0:
            self._bpm_history.append(bpm_estimate)
            if self._smooth_bpm is None:
                self._smooth_bpm = bpm_estimate
            else:
                self._smooth_bpm = (self.EMA_ALPHA * bpm_estimate
                                    + (1.0 - self.EMA_ALPHA) * self._smooth_bpm)

        smooth_bpm = round(self._smooth_bpm, 1) if self._smooth_bpm is not None else None
        rr_mean_ms = (sum(rr_intervals) / len(rr_intervals)) if rr_intervals else None

        # ── 2. Detect new heartbeat ──────────────────────────────────
        confirmed_label = None
        now = time.time()

        new_peaks = r_peak_count - self._last_r_peak_count
        if new_peaks > 0 and (now - self._last_beat_time) >= self._heartbeat_refractory_s:
            confirmed_label      = "Heartbeat"
            self._last_beat_time = now

        self._last_r_peak_count = r_peak_count

        # ── 3. Detection state ───────────────────────────────────────
        detection_state = "measuring" if smooth_bpm is not None else "acquiring"

        # ── 4. Extra payload (merged into ecg_prediction event) ──────
        # Store on features dict so _emit_event can pass it as extra_data.
        # We mutate the features dict here because router.py passes `features`
        # directly to _emit_event; this is the same pattern used by EMG.
        features["bpm"]            = smooth_bpm
        features["rr_ms"]          = round(rr_mean_ms, 1) if rr_mean_ms is not None else None
        features["rr_sdnn"]        = round(rr_sdnn, 1)    if rr_sdnn    is not None else None
        features["signal_quality"] = round(signal_quality, 3)
        features["detection_state"] = detection_state

        return ("ecg_live", confirmed_label, detection_state)
