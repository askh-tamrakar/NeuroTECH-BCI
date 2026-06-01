"""
Muscle Strength Extractor
=========================
Real-time EMG amplitude -> muscle strength percentage, computed in the
backend from the BioSignals-Processed LSL stream.

Feature: MAV (Mean Absolute Value)
  Same algorithm as Arduino 07_Muscle_Strength_Game.ino:
    envelope = mean(|sample|) over a circular buffer
  MAV correlates linearly with muscle contraction force.

Strength %:
  pct = clip( (MAV - min_threshold_uv) / (max_amplitude_uv - min_threshold_uv), 0, 1 )

TUNING  (data/config/feature_config.json -> EMG.muscle_strength)
-----------------------------------------------------------------
  max_amplitude_uv   [default 300]
      MAV value in uV that maps to 100% strength.
      HOW TO SET: open Muscle Meter, watch "MAV" in stats, squeeze as hard as
      possible for 3 s, note the peak value, enter it here.
      Lower  -> gauge saturates earlier (more sensitive at low force)
      Higher -> gauge never reaches 100% unless you squeeze very hard

  min_threshold_uv   [default 8]
      Noise floor. MAV below this level is treated as 0%.
      Raise if the gauge drifts when the muscle is fully relaxed.

  window_ms          [default 200]
      Circular buffer span in milliseconds.
      Shorter -> faster response, noisier readout
      Longer  -> smoother, slower to react (recommended max 500 ms)

  ema_alpha          [default 0.15]
      EMA smoothing factor 0-1. Higher = more responsive. Lower = smoother needle.

  emit_interval_ms   [default 50]
      How often a muscle_strength socket event is sent (~20 Hz default).
      Lower value = more UI updates per second.
"""

import time
import numpy as np


class MuscleStrengthExtractor:
    """
    Stateful, sample-by-sample EMG -> strength % converter.

    Call process(sample_val) for every incoming EMG sample.
    Returns a result dict at the configured emit_interval_ms cadence, else None.
    """

    DEFAULT_MAX_AMP    = 300.0   # uV
    DEFAULT_MIN_THRESH =   8.0   # uV
    DEFAULT_WINDOW_MS  = 200     # ms
    DEFAULT_EMA_ALPHA  =   0.15
    DEFAULT_EMIT_MS    =  50     # ms

    def __init__(self, sr=512, config=None):
        cfg = {}
        if config:
            cfg = config.get("features", {}).get("EMG", {}).get("muscle_strength", {})

        self.max_amplitude_uv = float(cfg.get("max_amplitude_uv",  self.DEFAULT_MAX_AMP))
        self.min_threshold_uv = float(cfg.get("min_threshold_uv",  self.DEFAULT_MIN_THRESH))
        self.ema_alpha        = float(cfg.get("ema_alpha",          self.DEFAULT_EMA_ALPHA))
        emit_ms               = float(cfg.get("emit_interval_ms",   self.DEFAULT_EMIT_MS))
        window_ms             = float(cfg.get("window_ms",          self.DEFAULT_WINDOW_MS))

        self._emit_interval = emit_ms / 1000.0
        self._buf_size      = max(4, int(sr * window_ms / 1000.0))
        self._buf           = np.zeros(self._buf_size, dtype=np.float32)
        self._idx           = 0
        self._sum           = 0.0
        self._smooth_pct    = 0.0
        self._last_emit     = 0.0

        print(
            "[MuscleStrength] Extractor ready -- "
            "window={:.0f}ms ({} samples), 100% at {:.0f}uV, "
            "noise floor {:.1f}uV, EMA a={}, emit every {:.0f}ms".format(
                window_ms, self._buf_size,
                self.max_amplitude_uv, self.min_threshold_uv,
                self.ema_alpha, emit_ms,
            ),
            flush=True,
        )

    # ------------------------------------------------------------------

    def process(self, sample_val):
        """
        Feed one raw EMG sample (in uV).

        Returns dict when emit interval elapses:
          {
            "pct":              float  -- 0.0-1.0 smoothed strength fraction
            "mav_uv":           float  -- raw MAV in uV  (watch this to calibrate max_amplitude_uv)
            "max_amplitude_uv": float  -- configured 100% ceiling
          }
        Returns None otherwise.
        """
        abs_val = abs(float(sample_val))

        # Circular buffer update (identical to Arduino technique)
        self._sum -= float(self._buf[self._idx])
        self._sum  = max(0.0, self._sum + abs_val)   # guard fp drift below zero
        self._buf[self._idx] = abs_val
        self._idx  = (self._idx + 1) % self._buf_size

        mav = self._sum / self._buf_size

        # Map MAV to 0-1 with noise floor deadband
        if mav < self.min_threshold_uv:
            raw_pct = 0.0
        else:
            span = max(1.0, self.max_amplitude_uv - self.min_threshold_uv)
            raw_pct = min((mav - self.min_threshold_uv) / span, 1.0)

        # EMA smoothing
        self._smooth_pct += self.ema_alpha * (raw_pct - self._smooth_pct)

        now = time.time()
        if now - self._last_emit >= self._emit_interval:
            self._last_emit = now
            return {
                "pct":              round(max(0.0, self._smooth_pct), 4),
                "mav_uv":           round(mav, 2),
                "max_amplitude_uv": self.max_amplitude_uv,
            }
        return None

    # ------------------------------------------------------------------

    def reload_config(self, config, sr=None):
        """Hot-reload tuning values without losing the circular buffer state."""
        cfg = config.get("features", {}).get("EMG", {}).get("muscle_strength", {})
        self.max_amplitude_uv = float(cfg.get("max_amplitude_uv", self.DEFAULT_MAX_AMP))
        self.min_threshold_uv = float(cfg.get("min_threshold_uv", self.DEFAULT_MIN_THRESH))
        self.ema_alpha        = float(cfg.get("ema_alpha",         self.DEFAULT_EMA_ALPHA))
        emit_ms               = float(cfg.get("emit_interval_ms",  self.DEFAULT_EMIT_MS))
        self._emit_interval   = emit_ms / 1000.0
        if sr is not None:
            window_ms    = float(cfg.get("window_ms", self.DEFAULT_WINDOW_MS))
            new_size     = max(4, int(sr * window_ms / 1000.0))
            if new_size != self._buf_size:
                self._buf_size = new_size
                self._buf  = np.zeros(self._buf_size, dtype=np.float32)
                self._idx  = 0
                self._sum  = 0.0
