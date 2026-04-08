"""
EMG filter processor (Passive)

Pipeline:
Raw EMG -> Bandpass (20-450 Hz) -> Notch (50 Hz) -> Rectification -> Envelope (5-10 Hz)

The real-time router forwards the bandpassed/notched EMG signal so downstream
feature extraction can derive both raw-domain and envelope-domain features
consistently from the same fixed window.
"""

import numpy as np
from scipy.signal import butter, iirnotch, lfilter, lfilter_zi

class EMGFilterProcessor:
    def __init__(self, config: dict, sr: int = 1000, channel_key: str = None):
        self.config = config
        self.sr = int(sr)
        self.channel_key = channel_key
        
        self._load_params()
        self._design_filters()
        
        # Initialize state
        self.zi_notch = lfilter_zi(self.b_notch, self.a_notch) * 0.0 if (self.notch_enabled and self.a_notch is not None and len(self.a_notch) > 1) else None
        self.zi_bp = lfilter_zi(self.b_bp, self.a_bp) * 0.0 if (self.bp_enabled and self.a_bp is not None and len(self.a_bp) > 1) else None
        self.zi_env = lfilter_zi(self.b_env, self.a_env) * 0.0 if (self.envelope_enabled and self.a_env is not None and len(self.a_env) > 1) else None

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

        # 1. Bandpass
        if self.bp_enabled:
            low = self.bp_low / nyq
            high = self.bp_high / nyq
            if low <= 0 or high >= 1 or low >= high:
                self.b_bp, self.a_bp = [1.0], [1.0]
            else:
                self.b_bp, self.a_bp = butter(self.bp_order, [low, high], btype="bandpass", analog=False)
        else:
            self.b_bp, self.a_bp = [1.0], [1.0]

        # 2. Notch
        if self.notch_enabled and self.notch_freq > 0:
            self.b_notch, self.a_notch = iirnotch(self.notch_freq, self.notch_q, fs=self.sr)
        else:
            self.b_notch, self.a_notch = None, None

        # 3. Envelope (Low Pass)
        if self.envelope_enabled:
            wn_env = self.envelope_cutoff / nyq
            self.b_env, self.a_env = butter(self.envelope_order, wn_env, btype="low", analog=False)
        else:
            self.b_env, self.a_env = [1.0], [1.0]

    def update_config(self, config: dict, sr: int):
        """Update filter parameters if config changed."""
        old_state = (self.notch_enabled, self.notch_freq, self.bp_enabled, self.bp_low, self.bp_high, self.envelope_enabled, self.envelope_cutoff)
        
        self.config = config
        self.sr = int(sr)
        self._load_params()
        
        new_state = (self.notch_enabled, self.notch_freq, self.bp_enabled, self.bp_low, self.bp_high, self.envelope_enabled, self.envelope_cutoff)
        
        if old_state != new_state:
            print(f"Config changed ({self.channel_key}) -> BP:{self.bp_low}-{self.bp_high} Notch:{self.notch_enabled}({self.notch_freq}Hz) Env:{self.envelope_enabled} ({self.envelope_cutoff}Hz)")
            self._design_filters()
            
            # Reset states
            try:
                self.zi_notch = lfilter_zi(self.b_notch, self.a_notch) * 0.0 if (self.notch_enabled and self.a_notch is not None and len(self.a_notch) > 1) else None
                self.zi_bp = lfilter_zi(self.b_bp, self.a_bp) * 0.0 if (self.bp_enabled and self.a_bp is not None and len(self.a_bp) > 1) else None
                self.zi_env = lfilter_zi(self.b_env, self.a_env) * 0.0 if (self.envelope_enabled and self.a_env is not None and len(self.a_env) > 1) else None
            except Exception as e:
                print(f"⚠️ Filter state reset error: {e}")
                # Fallback to zeros (no steady state init)
                if self.notch_enabled: self.zi_notch = np.zeros(max(len(self.a_notch), len(self.b_notch)) - 1)
                if self.bp_enabled: self.zi_bp = np.zeros(max(len(self.a_bp), len(self.b_bp)) - 1)
                if self.envelope_enabled: self.zi_env = np.zeros(max(len(self.a_env), len(self.b_env)) - 1)

    def process_batch_components(self, values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Process a batch of EMG samples through the pipeline (BP -> Notch -> Envelope)."""
        if not isinstance(values, np.ndarray):
            values = np.array(values, dtype=float)
            
        out = values.copy()

        # 1. Bandpass
        if self.bp_enabled and self.zi_bp is not None:
            out, self.zi_bp = lfilter(self.b_bp, self.a_bp, out, zi=self.zi_bp)

        # 2. Notch
        if self.notch_enabled and self.zi_notch is not None:
            out, self.zi_notch = lfilter(self.b_notch, self.a_notch, out, zi=self.zi_notch)

        raw_filtered = out.copy()
        rectified = np.abs(raw_filtered)

        envelope = rectified.copy()
        if self.envelope_enabled and self.zi_env is not None:
            envelope, self.zi_env = lfilter(self.b_env, self.a_env, rectified, zi=self.zi_env)

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

