"""
EEG filter processor (Passive)

- Applies configurable high-pass filter (default 1 Hz, order 4)
- Optionally applies Notch (default 50 Hz) and Bandpass
- Designed to be instantiated per-channel by filter_router.py
"""

import numpy as np
from scipy.signal import butter, lfilter, lfilter_zi

class EEGFilterProcessor:
    def __init__(self, config: dict, sr: int = 512, channel_key: str = None):
        self.config = config
        self.sr = int(sr)
        self.channel_key = channel_key
        
        self._load_params()
        self._design_filters()
        
        # Initialize state
        self.zi_hp = lfilter_zi(self.b_hp, self.a_hp) * 0.0 if (self.a_hp is not None and len(self.a_hp) > 1) else None
        self.zi_notch = lfilter_zi(self.b_notch, self.a_notch) * 0.0 if (self.notch_enabled and self.a_notch is not None and len(self.a_notch) > 1) else None
        self.zi_bp = lfilter_zi(self.b_bp, self.a_bp) * 0.0 if (self.bp_enabled and self.a_bp is not None and len(self.a_bp) > 1) else None

    def _load_params(self):
        # 1. Default Global Config
        eeg_cfg = self.config.get("filters", {}).get("EEG", {})
        
        # 2. Channel Specific Override?
        if self.channel_key:
            ch_cfg = self.config.get("filters", {}).get(self.channel_key, {})
            # Merge simple keys
            eeg_cfg = {**eeg_cfg, **ch_cfg}

        # High Pass (Standard EEG)
        self.hp_cutoff = float(eeg_cfg.get("cutoff", 1.0))
        self.hp_order = int(eeg_cfg.get("order", 4))
        
        # Notch (Noise Filtering)
        self.notch_enabled = eeg_cfg.get("notch_enabled", False)
        self.notch_freq = float(eeg_cfg.get("notch_freq", 50.0))
        self.notch_q = float(eeg_cfg.get("notch_q", 30.0))

        # Bandpass
        self.bp_enabled = eeg_cfg.get("bandpass_enabled", False)
        self.bp_low = float(eeg_cfg.get("bandpass_low", 1.0))
        self.bp_high = float(eeg_cfg.get("bandpass_high", 100.0))
        self.bp_order = int(eeg_cfg.get("order", 4)) # Keep same order as HP if separate order is missing

    def _design_filters(self):
        nyq = self.sr / 2.0
        
        # 1. High Pass
        wn_hp = self.hp_cutoff / nyq
        self.b_hp, self.a_hp = butter(self.hp_order, wn_hp, btype="high", analog=False)

        # 2. Notch
        if self.notch_enabled and self.notch_freq > 0:
            from scipy.signal import iirnotch
            self.b_notch, self.a_notch = iirnotch(self.notch_freq, self.notch_q, fs=self.sr)
        else:
             self.b_notch, self.a_notch = None, None

        # 3. Bandpass
        if self.bp_enabled:
            low = self.bp_low / nyq
            high = self.bp_high / nyq
            if low <= 0 or high >= 1:
                # Fallback if invalid
                self.b_bp, self.a_bp = [1.0], [1.0] 
            else:
                self.b_bp, self.a_bp = butter(self.bp_order, [low, high], btype="bandpass", analog=False)

    def update_config(self, config: dict, sr: int):
        """Update filter parameters if config changed."""
        old_state = (self.hp_cutoff, self.notch_enabled, self.notch_freq, self.bp_enabled, self.bp_low, self.bp_high)
        
        self.config = config
        self.sr = int(sr)
        self._load_params()
        
        new_state = (self.hp_cutoff, self.notch_enabled, self.notch_freq, self.bp_enabled, self.bp_low, self.bp_high)
        
        if old_state != new_state:
            print(f"[EEG] Config changed ({self.channel_key}) -> HP:{self.hp_cutoff} Notch:{self.notch_enabled}({self.notch_freq}Hz) BP:{self.bp_enabled}({self.bp_low}-{self.bp_high}Hz)")
            self._design_filters()
            
            # Reset states
            try:
                self.zi_hp = lfilter_zi(self.b_hp, self.a_hp) * 0.0 if (self.a_hp is not None and len(self.a_hp) > 1) else None
                self.zi_notch = lfilter_zi(self.b_notch, self.a_notch) * 0.0 if (self.notch_enabled and self.a_notch is not None and len(self.a_notch) > 1) else None
                self.zi_bp = lfilter_zi(self.b_bp, self.a_bp) * 0.0 if (self.bp_enabled and self.a_bp is not None and len(self.a_bp) > 1) else None
            except Exception as e:
                print(f"[EEG] ⚠️ Filter state reset error: {e}")
                # Fallback to zeros (no steady state init)
                self.zi_hp = np.zeros(max(len(self.a_hp), len(self.b_hp)) - 1)
                if self.notch_enabled: self.zi_notch = np.zeros(max(len(self.a_notch), len(self.b_notch)) - 1)
                if self.bp_enabled: self.zi_bp = np.zeros(max(len(self.a_bp), len(self.b_bp)) - 1)

    def process_sample(self, val: float) -> float:
        """Process a single sample value: High Pass -> Notch -> Bandpass."""
        # 1. High Pass
        out, self.zi_hp = lfilter(self.b_hp, self.a_hp, [val], zi=self.zi_hp)
        out = out[0]

        # 2. Notch Filter (Remove electrical hum)
        if self.notch_enabled and self.zi_notch is not None:
            filtered, self.zi_notch = lfilter(self.b_notch, self.a_notch, [out], zi=self.zi_notch)
            out = filtered[0]

        # 3. Bandpass Filter
        if self.bp_enabled and self.zi_bp is not None:
            filtered, self.zi_bp = lfilter(self.b_bp, self.a_bp, [out], zi=self.zi_bp)
            out = filtered[0]

        return float(out)
