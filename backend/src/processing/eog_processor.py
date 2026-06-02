"""
EOG filter processor (Passive)

- Applies configurable low-pass filter (default 10 Hz, order 4)
- Designed to be instantiated per-channel by filter_router.py
"""

import numpy as np
from scipy.signal import butter, lfilter, lfilter_zi, sosfilt, sosfilt_zi

class EOGFilterProcessor:
    def __init__(self, config: dict, sr: int = 512, channel_key: str = ""):
        self.config = config
        self.sr = sr
        self.channel_key = channel_key
        
        self._load_params()
        try:
            self._design_filters()
            self._init_filter_states()
        except Exception as e:
            print(f"[EOG] 🔴 CRITICAL: Filter design crashed!")
            print(f"[EOG]    scipy={__import__('scipy').__version__}, numpy={__import__('numpy').__version__}")
            print(f"[EOG]    Error: {e}")
            raise

    def _init_filter_states(self):
        """Initialize filter state vectors (separated to catch scipy crashes)."""
        self.zi_hp = sosfilt_zi(self.sos_hp) * 0.0 if getattr(self, 'sos_hp', None) is not None else None
        self.zi_lp = sosfilt_zi(self.sos_lp) * 0.0 if getattr(self, 'sos_lp', None) is not None else None
        self.zi_notch = lfilter_zi(self.b_notch, self.a_notch) * 0.0 if self.notch_enabled and getattr(self, 'a_notch', None) is not None else None
        self.zi_bp = sosfilt_zi(self.sos_bp) * 0.0 if self.bp_enabled and getattr(self, 'sos_bp', None) is not None else None

    def _load_params(self):
        # 1. Default Global Config
        eog_cfg = self.config.get("filters", {}).get("EOG", {})
        
        # 2. Channel Specific Override?
        if self.channel_key:
            ch_cfg = self.config.get("filters", {}).get(self.channel_key, {})
            eog_cfg = {**eog_cfg, **ch_cfg}

        # High Pass (To remove DC drift, essential for plotting)
        self.hp_cutoff = float(eog_cfg.get("hp_cutoff", 0.5))
        self.hp_order = int(eog_cfg.get("hp_order", 4))

        # Low Pass
        self.lp_cutoff = float(eog_cfg.get("cutoff", 10.0))
        self.lp_order = int(eog_cfg.get("order", 4))

        # Notch
        self.notch_enabled = eog_cfg.get("notch_enabled", False)
        self.notch_freq = float(eog_cfg.get("notch_freq", 50.0))
        self.notch_q = float(eog_cfg.get("notch_q", 30.0))

        # Bandpass
        self.bp_enabled = eog_cfg.get("bandpass_enabled", False)
        self.bp_low = float(eog_cfg.get("bandpass_low", 0.5))
        self.bp_high = float(eog_cfg.get("bandpass_high", 10.0))
        self.bp_order = int(eog_cfg.get("bandpass_order", 4))

    def _design_filters(self):
        nyq = self.sr / 2.0
        
        # 1. High Pass (Use SOS for stability at low cutoffs)
        if self.hp_cutoff > 0:
            wn_hp = self.hp_cutoff / nyq
            self.sos_hp = butter(self.hp_order, wn_hp, btype="high", analog=False, output='sos')
        else:
            self.sos_hp = None

        # 2. Low Pass
        if self.lp_cutoff > 0 and self.lp_cutoff < nyq:
            wn_lp = self.lp_cutoff / nyq
            self.sos_lp = butter(self.lp_order, wn_lp, btype="low", analog=False, output='sos')
        else:
            self.sos_lp = None

        # 3. Notch
        if self.notch_enabled:
            from scipy.signal import iirnotch
            self.b_notch, self.a_notch = iirnotch(self.notch_freq, self.notch_q, fs=self.sr)

        # 4. Bandpass
        if self.bp_enabled:
            low = self.bp_low / nyq
            high = self.bp_high / nyq
            if low <= 0 or high >= 1:
                self.sos_bp = None
            else:
                self.sos_bp = butter(self.bp_order, [low, high], btype="bandpass", analog=False, output='sos')

    def update_config(self, config: dict, sr: int):
        """Update filter parameters if config changed."""
        old_state = (self.hp_cutoff, self.lp_cutoff, self.notch_enabled, self.bp_enabled, self.bp_low, self.bp_high)
        
        self.config = config
        self.sr = sr
        self._load_params()
        
        new_state = (self.hp_cutoff, self.lp_cutoff, self.notch_enabled, self.bp_enabled, self.bp_low, self.bp_high)
        
        if old_state != new_state:
            print(f"[EOG] Config changed -> Redesign filters")
            self._design_filters()
            try:
                self._init_filter_states()
            except Exception as e:
                print(f"[EOG] ⚠️ Filter state reset error: {e}")
                self.zi_hp = None
                self.zi_lp = None
                self.zi_notch = None
                self.zi_bp = None

    def process_sample(self, val: float) -> float:
        """Process a single sample value."""
        # Note: In most processing, if bandpass is enabled, it handles both low and high cutoffs.
        # However, we apply all enabled stages sequentially as per configuration.
        
        out = val
        
        # 1. High Pass (Removes DC Drift)
        if getattr(self, 'sos_hp', None) is not None:
            if not hasattr(self, 'zi_hp') or self.zi_hp is None:
                self.zi_hp = sosfilt_zi(self.sos_hp) * 0.0
            filtered, self.zi_hp = sosfilt(self.sos_hp, [out], zi=self.zi_hp)
            out = filtered[0]

        # 2. Low Pass (Standard EOG)
        if getattr(self, 'sos_lp', None) is not None:
            if not hasattr(self, 'zi_lp') or self.zi_lp is None:
                self.zi_lp = sosfilt_zi(self.sos_lp) * 0.0
            filtered, self.zi_lp = sosfilt(self.sos_lp, [out], zi=self.zi_lp)
            out = filtered[0]
        
        # 3. Notch
        if self.notch_enabled and getattr(self, 'zi_notch', None) is not None:
            filtered, self.zi_notch = lfilter(self.b_notch, self.a_notch, [out], zi=self.zi_notch)
            out = filtered[0]
             
        # 4. Bandpass
        if self.bp_enabled and getattr(self, 'sos_bp', None) is not None:
            if not hasattr(self, 'zi_bp') or self.zi_bp is None:
                self.zi_bp = sosfilt_zi(self.sos_bp) * 0.0
            filtered, self.zi_bp = sosfilt(self.sos_bp, [out], zi=self.zi_bp)
            out = filtered[0]

        return float(out)
