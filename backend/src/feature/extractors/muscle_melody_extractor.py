"""
Muscle Melody Extractor
=======================
Real-time, per-channel EMG envelope calculator that drives the Muscle Melody
UI tab.  Works with any number of EMG channels; channel list is determined at
startup from the LSL channel mapping.

Algorithm (per channel)
-----------------------
1. Rectify the filtered EMG sample  ( |x| )
2. MAV via circular buffer          ( mean(|x|) over window_ms )
3. EMA smoothing                    ( alpha configurable )
4. Normalize to [0, 1]              ( clip((mav - min_thresh) / (max_amp - min_thresh), 0, 1) )

Emit cadence
------------
get_update() returns a payload dict at most once per emit_interval_ms
(default 33 ms → ~30 Hz), otherwise returns None.

Socket.IO event shape
---------------------
{
  "event": "muscle_melody",
  "channels": [
    {"idx": 0, "label": "ch0", "envelope": 42.3, "normalized": 0.28},
    ...
  ],
  "timestamp": 1717300000.123
}

Config  (data/config/feature_config.json  →  features.EMG.muscle_melody)
-------------------------------------------------------------------------
  max_amplitude_uv   float  [300]  MAV value that maps to normalized=1.0
  min_threshold_uv   float  [8]    Noise floor → normalized=0.0 below this
  window_ms          int    [200]  Circular buffer length in ms
  ema_alpha          float  [0.15] EMA smoothing (0=frozen, 1=raw)
  emit_interval_ms   int    [33]   Minimum ms between get_update() payloads
"""

import time
import numpy as np


class MuscleMelodyExtractor:
    """
    Stateful, sample-by-sample EMG envelope extractor for the Muscle Melody feature.

    Parameters
    ----------
    sr : int
        Sampling rate in Hz (default 512).
    config : dict
        Full pipeline config dict. Reads from config["features"]["EMG"]["muscle_melody"].
    emg_channel_indices : list[int]
        LSL channel indices that are mapped to EMG.
    channel_labels : dict[int, str]
        Mapping from channel index to human-readable label (e.g. {0: "ch0"}).
    """

    DEFAULT_MAX_AMP    = 300.0  # uV
    DEFAULT_MIN_THRESH =   8.0  # uV
    DEFAULT_WINDOW_MS  = 200    # ms
    DEFAULT_EMA_ALPHA  =   0.15
    DEFAULT_EMIT_MS    =  33    # ms  (~30 Hz)

    def __init__(self, sr: int = 512, config: dict = None,
                 emg_channel_indices: list = None,
                 channel_labels: dict = None):

        self.sr = int(sr)
        self.emg_channel_indices = list(emg_channel_indices or [])
        self.channel_labels = dict(channel_labels or {})

        # Load config
        cfg = {}
        if config:
            cfg = (config
                   .get("features", {})
                   .get("EMG", {})
                   .get("muscle_melody", {}))

        self.max_amplitude_uv = float(cfg.get("max_amplitude_uv", self.DEFAULT_MAX_AMP))
        self.min_threshold_uv = float(cfg.get("min_threshold_uv", self.DEFAULT_MIN_THRESH))
        self.ema_alpha        = float(cfg.get("ema_alpha",         self.DEFAULT_EMA_ALPHA))
        emit_ms               = float(cfg.get("emit_interval_ms",  self.DEFAULT_EMIT_MS))
        window_ms             = float(cfg.get("window_ms",         self.DEFAULT_WINDOW_MS))

        self._emit_interval = emit_ms / 1000.0
        buf_size = max(4, int(self.sr * window_ms / 1000.0))

        # Per-channel state
        self._bufs         = {}   # ch_idx -> np.ndarray circular buffer
        self._buf_idx      = {}   # ch_idx -> int write pointer
        self._buf_sums     = {}   # ch_idx -> float running sum
        self._smooth       = {}   # ch_idx -> float EMA value
        self._last_envelopes = {} # ch_idx -> float last MAV (uV)
        self._last_normalized = {}# ch_idx -> float last normalized [0,1]

        for idx in self.emg_channel_indices:
            self._bufs[idx]           = np.zeros(buf_size, dtype=np.float32)
            self._buf_idx[idx]        = 0
            self._buf_sums[idx]       = 0.0
            self._smooth[idx]         = 0.0
            self._last_envelopes[idx] = 0.0
            self._last_normalized[idx] = 0.0

        self._last_emit = 0.0

        print(
            f"[MuscleMelody] Extractor ready -- "
            f"channels={self.emg_channel_indices}, "
            f"window={window_ms:.0f}ms ({buf_size} samples), "
            f"100%% at {self.max_amplitude_uv:.0f}uV, "
            f"emit={emit_ms:.0f}ms"
        )

    # ------------------------------------------------------------------
    def process_sample(self, ch_idx: int, value: float) -> None:
        """
        Feed one filtered EMG sample for a channel.
        Call this for every incoming sample on every EMG channel.
        """
        if ch_idx not in self._bufs:
            return

        buf   = self._bufs[ch_idx]
        ptr   = self._buf_idx[ch_idx]
        s     = self._buf_sums[ch_idx]
        alpha = self.ema_alpha

        # 1. Rectify
        abs_val = abs(float(value))

        # 2. Circular buffer MAV
        s += abs_val - float(buf[ptr])
        buf[ptr] = abs_val
        self._buf_idx[ch_idx]  = (ptr + 1) % len(buf)
        self._buf_sums[ch_idx] = s
        mav = s / len(buf)

        # 3. EMA smoothing
        prev   = self._smooth[ch_idx]
        smooth = prev + alpha * (mav - prev)
        self._smooth[ch_idx] = smooth

        # 4. Normalize
        span = self.max_amplitude_uv - self.min_threshold_uv
        if span <= 0:
            normalized = 0.0
        else:
            normalized = float(np.clip((smooth - self.min_threshold_uv) / span, 0.0, 1.0))

        self._last_envelopes[ch_idx]   = smooth
        self._last_normalized[ch_idx]  = normalized

    # ------------------------------------------------------------------
    def get_update(self) -> dict | None:
        """
        Returns a muscle_melody payload if the emit interval has elapsed,
        otherwise returns None.
        """
        now = time.time()
        if now - self._last_emit < self._emit_interval:
            return None

        self._last_emit = now

        channels = []
        for idx in self.emg_channel_indices:
            channels.append({
                "idx":        idx,
                "label":      self.channel_labels.get(idx, f"ch{idx}"),
                "envelope":   round(self._last_envelopes.get(idx, 0.0), 4),
                "normalized": round(self._last_normalized.get(idx, 0.0), 4),
            })

        return {
            "event":     "muscle_melody",
            "channels":  channels,
            "timestamp": now,
        }
