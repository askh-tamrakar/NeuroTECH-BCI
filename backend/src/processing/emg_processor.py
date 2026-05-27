"""
EMG filter processor (Passive)

- Applies configurable high-pass filter (default 70 Hz, order 4)
- Designed to be instantiated per-channel by filter_router.py
"""

import numpy as np
from scipy.signal import butter, lfilter, lfilter_zi, sosfilt, sosfilt_zi

class EMGFilterProcessor:
    def __init__(self, config: dict, sr: int = 512, channel_key: str = None):
        self.config = config
        self.sr = int(sr)
        self.channel_key = channel_key
        
        self._load_params()
        self._design_filters()
        
        # Initialize state
        self.zi_hp = sosfilt_zi(self.sos_hp) * 0.0 if getattr(self, 'sos_hp', None) is not None else None
        self.zi_notch = lfilter_zi(self.b_notch, self.a_notch) * 0.0 if (self.notch_enabled and getattr(self, 'a_notch', None) is not None) else None
        self.zi_bp = sosfilt_zi(self.sos_bp) * 0.0 if (self.bp_enabled and getattr(self, 'sos_bp', None) is not None) else None
        self.zi_env = sosfilt_zi(self.sos_env) * 0.0 if self.envelope_enabled and getattr(self, 'sos_env', None) is not None else None

    def _load_params(self):
        # 1. Default Global Config
        emg_cfg = self.config.get("filters", {}).get("EMG", {})
        
        # 2. Channel Specific Override?
        if self.channel_key:
            ch_cfg = self.config.get("filters", {}).get(self.channel_key, {})
            # Merge simple keys
            emg_cfg = {**emg_cfg, **ch_cfg}

        # High Pass (Standard EMG)
        self.hp_cutoff = float(emg_cfg.get("cutoff", 70.0))
        self.hp_order = int(emg_cfg.get("order", 4))
        
        # Notch (Noise Filtering)
        self.notch_enabled = emg_cfg.get("notch_enabled", False)
        self.notch_freq = float(emg_cfg.get("notch_freq", 50.0))
        self.notch_q = float(emg_cfg.get("notch_q", 30.0))

        # Bandpass
        self.bp_enabled = emg_cfg.get("bandpass_enabled", False)
        self.bp_low = float(emg_cfg.get("bandpass_low", 20.0))
        self.bp_high = float(emg_cfg.get("bandpass_high", 450.0))
        self.bp_order = int(emg_cfg.get("bandpass_order", 4))

        # Envelope (Rectify + Low Pass)
        self.envelope_enabled = emg_cfg.get("envelope_enabled", True)
        self.envelope_cutoff = float(emg_cfg.get("envelope_cutoff", 10.0))
        self.envelope_order = int(emg_cfg.get("envelope_order", 4))

    def _design_filters(self):
        nyq = self.sr / 2.0
        
        # 1. High Pass
        if self.hp_cutoff > 0:
            wn_hp = self.hp_cutoff / nyq
            self.sos_hp = butter(self.hp_order, wn_hp, btype="high", analog=False, output='sos')
        else:
            self.sos_hp = None

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
                self.sos_bp = None
            else:
                self.sos_bp = butter(self.bp_order, [low, high], btype="bandpass", analog=False, output='sos')
        else:
            self.sos_bp = None

        # 4. Envelope (Low Pass)
        if self.envelope_enabled:
            wn_env = self.envelope_cutoff / nyq
            self.sos_env = butter(self.envelope_order, wn_env, btype="low", analog=False, output='sos')
        else:
            self.sos_env = None

    def update_config(self, config: dict, sr: int):
        """Update filter parameters if config changed."""
        old_state = (self.hp_cutoff, self.notch_enabled, self.notch_freq, self.bp_enabled, self.bp_low, self.bp_high, self.envelope_enabled, self.envelope_cutoff)
        
        self.config = config
        self.sr = int(sr)
        self._load_params()
        
        new_state = (self.hp_cutoff, self.notch_enabled, self.notch_freq, self.bp_enabled, self.bp_low, self.bp_high, self.envelope_enabled, self.envelope_cutoff)
        
        if old_state != new_state:
            print(f"[EMG] Config changed ({self.channel_key}) -> HP:{self.hp_cutoff} Notch:{self.notch_enabled}({self.notch_freq}Hz) Env:{self.envelope_enabled} ({self.envelope_cutoff}Hz)")
            self._design_filters()
            
            # Reset states
            try:
                self.zi_hp = sosfilt_zi(self.sos_hp) * 0.0 if getattr(self, 'sos_hp', None) is not None else None
                self.zi_notch = lfilter_zi(self.b_notch, self.a_notch) * 0.0 if (self.notch_enabled and getattr(self, 'a_notch', None) is not None) else None
                self.zi_bp = sosfilt_zi(self.sos_bp) * 0.0 if (self.bp_enabled and getattr(self, 'sos_bp', None) is not None) else None
                self.zi_env = sosfilt_zi(self.sos_env) * 0.0 if self.envelope_enabled and getattr(self, 'sos_env', None) is not None else None
            except Exception as e:
                print(f"[EMG] ⚠️ Filter state reset error: {e}")
                self.zi_hp = None
                self.zi_notch = None
                self.zi_bp = None
                self.zi_env = None

    def process_sample(self, val: float) -> float:
        """Process a single sample value through HP -> Notch -> Bandpass only.
        Returns the filtered (oscillating) EMG signal - suitable for graphing and feature extraction.
        Envelope is NOT applied here; use get_envelope() separately if needed."""
        out = val
        
        # 1. High Pass
        if getattr(self, 'sos_hp', None) is not None:
            if getattr(self, 'zi_hp', None) is None:
                self.zi_hp = sosfilt_zi(self.sos_hp) * 0.0
            filtered, self.zi_hp = sosfilt(self.sos_hp, [out], zi=self.zi_hp)
            out = filtered[0]

        # 2. Notch
        if self.notch_enabled and getattr(self, 'zi_notch', None) is not None:
            filtered, self.zi_notch = lfilter(self.b_notch, self.a_notch, [out], zi=self.zi_notch)
            out = filtered[0]
            
        # 3. Bandpass
        if self.bp_enabled and getattr(self, 'sos_bp', None) is not None:
            if getattr(self, 'zi_bp', None) is None:
                self.zi_bp = sosfilt_zi(self.sos_bp) * 0.0
            filtered, self.zi_bp = sosfilt(self.sos_bp, [out], zi=self.zi_bp)
            out = filtered[0]

        return float(out)

    def get_envelope(self, filtered_val: float) -> float | None:
        """Apply envelope (rectify + low-pass) to an already-filtered sample.
        Returns the enveloped value, or None if envelope is disabled."""
        if not self.envelope_enabled or getattr(self, 'sos_env', None) is None:
            return None
        rectified = abs(filtered_val)
        
        if getattr(self, 'zi_env', None) is None:
            self.zi_env = sosfilt_zi(self.sos_env) * 0.0
            
        enveloped, self.zi_env = sosfilt(self.sos_env, [rectified], zi=self.zi_env)
        return float(enveloped[0])
