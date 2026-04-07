"""
EMG filter processor (Passive)

Pipeline:
Raw EMG -> Bandpass (20-450 Hz) -> Notch (50 Hz) -> Rectification -> Envelope (5-10 Hz)

The real-time router forwards the bandpassed/notched EMG signal so downstream
feature extraction can derive both raw-domain and envelope-domain features
consistently from the same fixed window.

Uses SOS (second-order sections) for bandpass and envelope filters to avoid
numerical instability that causes NaN/data loss with transfer function form
at high filter orders.
"""

import numpy as np
from scipy.signal import butter, iirnotch, lfilter, lfilter_zi, sosfilt, sosfilt_zi


def _identity_sos():
    """Identity SOS filter (pass-through)."""
    return np.array([[1.0, 0.0, 0.0, 1.0, 0.0, 0.0]], dtype=float)


class EMGFilterProcessor:
    def __init__(self, config: dict, sr: int = 1000, channel_key: str = None):
        self.config = config
        self.sr = int(sr)
        self.channel_key = channel_key
        
        self._load_params()
        self._design_filters()
        self._init_filter_states()

    def _load_params(self):
        # 1. Default Global Config
        emg_cfg = self.config.get("filters", {}).get("EMG", {})
        
        # 2. Channel Specific Override?
        if self.channel_key:
            ch_cfg = self.config.get("filters", {}).get(self.channel_key, {})
            # Merge simple keys
            emg_cfg = {**emg_cfg, **ch_cfg}

        # Bandpass (Standard EMG)
        self.bp_enabled = emg_cfg.get("bandpass_enabled", True)
        self.bp_low = float(emg_cfg.get("bandpass_low", 20.0))
        self.bp_high = float(emg_cfg.get("bandpass_high", 450.0))
        self.bp_order = int(emg_cfg.get("bandpass_order", emg_cfg.get("order", 4)))

        # Notch (Noise Filtering)
        self.notch_enabled = emg_cfg.get("notch_enabled", True)
        self.notch_freq = float(emg_cfg.get("notch_freq", 50.0))
        self.notch_q = float(emg_cfg.get("notch_q", 30.0))

        # Envelope (Rectify + Low Pass)
        self.envelope_enabled = emg_cfg.get("envelope_enabled", True)
        self.envelope_cutoff = float(emg_cfg.get("envelope_cutoff", 8.0))
        self.envelope_order = int(emg_cfg.get("envelope_order", 4))

    def _design_filters(self):
        nyq = self.sr / 2.0

        # 1. Bandpass - use SOS for numerical stability
        if self.bp_enabled:
            low = self.bp_low / nyq
            high = self.bp_high / nyq
            if low <= 0 or high >= 1 or low >= high:
                self.sos_bp = _identity_sos()
            else:
                self.sos_bp = butter(self.bp_order, [low, high], btype="bandpass", analog=False, output="sos")
        else:
            self.sos_bp = _identity_sos()

        # 2. Notch (stays as tf - 2nd order, always stable)
        if self.notch_enabled and self.notch_freq > 0:
            self.b_notch, self.a_notch = iirnotch(self.notch_freq, self.notch_q, fs=self.sr)
        else:
            self.b_notch, self.a_notch = None, None

        # 3. Envelope (Low Pass) - use SOS for numerical stability
        if self.envelope_enabled:
            wn_env = self.envelope_cutoff / nyq
            if wn_env <= 0 or wn_env >= 1:
                self.sos_env = _identity_sos()
            else:
                self.sos_env = butter(self.envelope_order, wn_env, btype="low", analog=False, output="sos")
        else:
            self.sos_env = _identity_sos()

    def _init_filter_states(self):
        """Initialize all filter states. Always call after _design_filters."""
        # Notch state (tf form - only 2nd order, safe)
        self.zi_notch = lfilter_zi(self.b_notch, self.a_notch) * 0.0 if (self.notch_enabled and self.b_notch is not None and self.a_notch is not None and len(self.a_notch) > 1) else None
        
        # Bandpass state (SOS form)
        self.zi_bp = sosfilt_zi(self.sos_bp) * 0.0 if self.bp_enabled else None
        
        # Envelope state (SOS form)
        self.zi_env = sosfilt_zi(self.sos_env) * 0.0 if self.envelope_enabled else None

    def update_config(self, config: dict, sr: int):
        """Update filter parameters if config changed."""
        old_state = (self.sr, self.notch_enabled, self.notch_freq, self.bp_enabled, self.bp_low, self.bp_high, self.bp_order, self.envelope_enabled, self.envelope_cutoff, self.envelope_order)
        
        self.config = config
        self.sr = int(sr)
        self._load_params()
        
        new_state = (self.sr, self.notch_enabled, self.notch_freq, self.bp_enabled, self.bp_low, self.bp_high, self.bp_order, self.envelope_enabled, self.envelope_cutoff, self.envelope_order)
        
        if old_state != new_state:
            print(f"Config changed ({self.channel_key}) -> BP:{self.bp_low}-{self.bp_high} Notch:{self.notch_enabled}({self.notch_freq}Hz) Env:{self.envelope_enabled} ({self.envelope_cutoff}Hz)")
            self._design_filters()
            self._init_filter_states()

    def process_batch_components(self, values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Process a batch of EMG samples through the pipeline (BP -> Notch -> Envelope)."""
        if not isinstance(values, np.ndarray):
            values = np.array(values, dtype=float)
            
        out = values.copy()

        # 1. Bandpass (SOS - numerically stable)
        if self.bp_enabled and self.zi_bp is not None:
            out, self.zi_bp = sosfilt(self.sos_bp, out, zi=self.zi_bp)

        # 2. Notch (tf form - always 2nd order, stable)
        if self.notch_enabled and self.zi_notch is not None:
            out, self.zi_notch = lfilter(self.b_notch, self.a_notch, out, zi=self.zi_notch)

        # Check for NaN propagation and clamp
        if np.any(np.isnan(out)):
            out = np.nan_to_num(out, nan=0.0)
            # Reset filter states to recover
            self._init_filter_states()

        raw_filtered = out.copy()
        rectified = np.abs(raw_filtered)

        envelope = rectified.copy()
        if self.envelope_enabled and self.zi_env is not None:
            envelope, self.zi_env = sosfilt(self.sos_env, rectified, zi=self.zi_env)
            # Check envelope for NaN as well
            if np.any(np.isnan(envelope)):
                envelope = np.nan_to_num(envelope, nan=0.0)
                self.zi_env = sosfilt_zi(self.sos_env) * 0.0

        return raw_filtered.astype(float), envelope.astype(float)

    def process_batch(self, values: np.ndarray) -> np.ndarray:
        """Vectorized batch processing for the real-time stream."""
        raw_filtered, _ = self.process_batch_components(values)
        return raw_filtered

    def process_sample_components(self, val: float) -> tuple[float, float]:
        """Process a single sample (backward compatibility)."""
        raw, env = self.process_batch_components(np.array([val]))
        return float(raw[0]), float(env[0])

    def process_sample(self, val: float) -> float:
        """Process a single sample (backward compatibility)."""
        raw_filtered, _ = self.process_sample_components(val)
        return raw_filtered

