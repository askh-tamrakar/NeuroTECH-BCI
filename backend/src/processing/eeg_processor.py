"""
EEG filter processor (Passive)

Pipeline:
Raw EEG -> Notch (50/60 Hz) -> Bandpass (e.g. 1-45 Hz)

- Notch removes mains power-line interference
- Bandpass isolates the EEG band of interest
- Uses SOS (second-order sections) for bandpass to avoid numerical instability
- Designed to be instantiated per-channel by filter_router.py
"""

import numpy as np
from scipy.signal import butter, iirnotch, lfilter, lfilter_zi, sosfilt, sosfilt_zi


def _identity_sos():
    """Identity SOS filter (pass-through)."""
    return np.array([[1.0, 0.0, 0.0, 1.0, 0.0, 0.0]], dtype=float)


class EEGFilterProcessor:
    def __init__(self, config: dict, sr: int = 1000, channel_key: str = None):
        self.config = config
        self.sr = int(sr)
        self.channel_key = channel_key
        
        self._load_params()
        self._design_filters()
        self._init_filter_states()

    def _load_params(self):
        # 1. Default Global Config
        eeg_cfg = self.config.get("filters", {}).get("EEG", {})
        
        # 2. Channel Specific Override?
        if self.channel_key:
            ch_cfg = self.config.get("filters", {}).get(self.channel_key, {})
            eeg_cfg = {**eeg_cfg, **ch_cfg}

        # Notch (Noise Filtering)
        self.notch_enabled = eeg_cfg.get("notch_enabled", False)
        self.notch_freq = float(eeg_cfg.get("notch_freq", 50.0))
        self.notch_q = float(eeg_cfg.get("notch_q", 30.0))

        # Bandpass
        self.bp_enabled = eeg_cfg.get("bandpass_enabled", False)
        self.bp_low = float(eeg_cfg.get("bandpass_low", 1.0))
        self.bp_high = float(eeg_cfg.get("bandpass_high", 45.0))
        self.bp_order = int(eeg_cfg.get("bandpass_order", eeg_cfg.get("order", 4)))

    def _design_filters(self):
        nyq = self.sr / 2.0

        # 1. Notch (tf form - always 2nd order, stable)
        if self.notch_enabled and self.notch_freq > 0:
            self.b_notch, self.a_notch = iirnotch(self.notch_freq, self.notch_q, fs=self.sr)
        else:
            self.b_notch, self.a_notch = None, None

        # 2. Bandpass - use SOS for numerical stability
        if self.bp_enabled:
            low = self.bp_low / nyq
            high = self.bp_high / nyq
            if low <= 0 or high >= 1 or low >= high:
                self.sos_bp = _identity_sos()
            else:
                self.sos_bp = butter(self.bp_order, [low, high], btype="bandpass", analog=False, output="sos")
        else:
            self.sos_bp = _identity_sos()

    def _init_filter_states(self):
        """Initialize all filter states. Always call after _design_filters."""
        self.zi_notch = lfilter_zi(self.b_notch, self.a_notch) * 0.0 if (self.notch_enabled and self.b_notch is not None and self.a_notch is not None and len(self.a_notch) > 1) else None
        self.zi_bp = sosfilt_zi(self.sos_bp) * 0.0 if self.bp_enabled else None

    def update_config(self, config: dict, sr: int):
        """Update filter parameters if config changed."""
        old_state = (self.sr, self.notch_enabled, self.notch_freq, self.notch_q, self.bp_enabled, self.bp_low, self.bp_high, self.bp_order)
        
        self.config = config
        self.sr = int(sr)
        self._load_params()
        
        new_state = (self.sr, self.notch_enabled, self.notch_freq, self.notch_q, self.bp_enabled, self.bp_low, self.bp_high, self.bp_order)
        
        if old_state != new_state:
            print(f"Config changed ({self.channel_key}) -> Notch:{self.notch_enabled}({self.notch_freq}Hz Q:{self.notch_q}) BP:{self.bp_enabled}({self.bp_low}-{self.bp_high}Hz order:{self.bp_order})")
            self._design_filters()
            self._init_filter_states()

    def process_batch(self, samples: np.ndarray) -> np.ndarray:
        """Process a batch of samples: Notch -> Bandpass."""
        if not isinstance(samples, np.ndarray):
            samples = np.array(samples, dtype=float)
            
        out = samples.copy()

        # 1. Notch Filter (Remove electrical hum)
        if self.notch_enabled and self.zi_notch is not None:
            out, self.zi_notch = lfilter(self.b_notch, self.a_notch, out, zi=self.zi_notch)

        # 2. Bandpass Filter (SOS - numerically stable)
        if self.bp_enabled and self.zi_bp is not None:
            out, self.zi_bp = sosfilt(self.sos_bp, out, zi=self.zi_bp)

        # Guard against NaN propagation
        if np.any(np.isnan(out)):
            out = np.nan_to_num(out, nan=0.0)
            self._init_filter_states()

        return out.astype(float)

    def process_sample(self, val: float) -> float:
        """Process a single sample value: Notch -> Bandpass."""
        return float(self.process_batch(np.array([val]))[0])
