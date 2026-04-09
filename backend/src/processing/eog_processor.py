"""
EOG filter processor (Passive)

- Applies configurable bandpass filter (default 0.3-10 Hz)
- The high-pass at 0.3 Hz removes electrode DC drift that causes
  signal values to climb like a hill over time
- Uses SOS (second-order sections) format for numerical stability
  at all sample rates (transfer-function form blows up at >=1000 Hz)
- Designed to be instantiated per-channel by filter_router.py
"""

import numpy as np
from scipy.signal import butter, lfilter, lfilter_zi, sosfilt, sosfilt_zi

class EOGFilterProcessor:
    def __init__(self, config: dict, sr: int = 512, channel_key: str = None):
        self.config = config
        self.sr = int(sr)
        self.channel_key = channel_key
        
        self._load_params()
        self._design_filters()
        self._init_state()

    def _load_params(self):
        # 1. Default Global Config
        eog_cfg = self.config.get("filters", {}).get("EOG", {})
        
        # 2. Channel Specific Override?
        if self.channel_key:
            ch_cfg = self.config.get("filters", {}).get(self.channel_key, {})
            eog_cfg = {**eog_cfg, **ch_cfg}

        # Low Pass
        self.lp_cutoff = float(eog_cfg.get("cutoff", 10.0))
        self.lp_order = int(eog_cfg.get("order", 4))

        # Notch
        self.notch_enabled = eog_cfg.get("notch_enabled", False)
        self.notch_freq = float(eog_cfg.get("notch_freq", 50.0))
        self.notch_q = float(eog_cfg.get("notch_q", 30.0))

        # Bandpass — enabled by default to prevent DC drift
        self.bp_enabled = eog_cfg.get("bandpass_enabled", True)
        self.bp_low = float(eog_cfg.get("bandpass_low", 0.3))
        self.bp_high = float(eog_cfg.get("bandpass_high", 10.0))
        self.bp_order = int(eog_cfg.get("bandpass_order", 4))

    def _design_filters(self):
        nyq = self.sr / 2.0
        
        # 1. Bandpass — SOS format for stability at all sample rates
        self.bp_sos = None
        if self.bp_enabled:
            low = self.bp_low / nyq
            high = self.bp_high / nyq
            if 0 < low < high < 1:
                self.bp_sos = butter(self.bp_order, [low, high], btype="bandpass", output="sos")
        
        # 2. Low-pass (only used if bandpass is disabled)
        wn = min(self.lp_cutoff / nyq, 0.99)
        self.b_lp, self.a_lp = butter(self.lp_order, wn, btype="low", analog=False)

        # 3. Notch
        self.b_notch = self.a_notch = None
        if self.notch_enabled:
            from scipy.signal import iirnotch
            self.b_notch, self.a_notch = iirnotch(self.notch_freq, self.notch_q, fs=self.sr)

    def _init_state(self):
        """Initialize / reset filter state."""
        if self.bp_sos is not None:
            self.zi_bp = sosfilt_zi(self.bp_sos) * 0.0
        else:
            self.zi_bp = None
        
        self.zi_lp = lfilter_zi(self.b_lp, self.a_lp) * 0.0
        
        if self.notch_enabled and self.b_notch is not None:
            self.zi_notch = lfilter_zi(self.b_notch, self.a_notch) * 0.0
        else:
            self.zi_notch = None

    def update_config(self, config: dict, sr: int):
        """Update filter parameters if config changed."""
        old_state = (self.lp_cutoff, self.notch_enabled, self.bp_enabled, self.bp_low, self.bp_high, self.sr)
        
        self.config = config
        self.sr = int(sr)
        self._load_params()
        
        new_state = (self.lp_cutoff, self.notch_enabled, self.bp_enabled, self.bp_low, self.bp_high, self.sr)
        
        if old_state != new_state:
            print(f"[EOG] Config changed -> Redesign filters")
            self._design_filters()
            self._init_state()

    def process_sample(self, val: float) -> float:
        """Process a single sample value."""
        x = np.array([val])
        
        # 1. Bandpass (preferred — removes DC drift and high-freq noise)
        if self.bp_sos is not None:
            x, self.zi_bp = sosfilt(self.bp_sos, x, zi=self.zi_bp)
        else:
            # Fallback: low-pass only (no DC removal)
            x, self.zi_lp = lfilter(self.b_lp, self.a_lp, x, zi=self.zi_lp)
        
        # 2. Notch (if enabled)
        if self.notch_enabled and self.zi_notch is not None:
            x, self.zi_notch = lfilter(self.b_notch, self.a_notch, x, zi=self.zi_notch)

        return float(x[0])

