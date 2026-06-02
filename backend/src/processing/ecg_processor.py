"""
ECG filter processor (Passive)

- Applies a bandpass filter: 0.5–20 Hz (removes DC wander + EMG noise, keeps P/QRS/T waves)
- Optional 50 Hz notch to remove powerline interference
- Designed to be instantiated per-channel by filter_router.py
"""

import numpy as np
from scipy.signal import butter, lfilter, lfilter_zi, sosfilt, sosfilt_zi


class ECGFilterProcessor:
    def __init__(self, config: dict, sr: int = 512, channel_key: str = ""):
        self.config = config
        self.sr = sr
        self.channel_key = channel_key

        self._load_params()
        self._design_filters()

        self.zi_hp     = sosfilt_zi(self.sos_hp) * 0.0 if getattr(self, 'sos_hp', None) is not None else None
        self.zi_lp     = sosfilt_zi(self.sos_lp) * 0.0 if getattr(self, 'sos_lp', None) is not None else None
        self.zi_notch  = lfilter_zi(self.b_notch, self.a_notch) * 0.0 if self.notch_enabled else None
        self.zi_bp     = sosfilt_zi(self.sos_bp) * 0.0 if self.bp_enabled and getattr(self, 'sos_bp', None) is not None else None

    # ------------------------------------------------------------------
    # Configuration Loading
    # ------------------------------------------------------------------

    def _load_params(self):
        ecg_cfg = self.config.get("filters", {}).get("ECG", {})

        if self.channel_key:
            ch_cfg = self.config.get("filters", {}).get(self.channel_key, {})
            ecg_cfg = {**ecg_cfg, **ch_cfg}

        # High-pass (removes DC baseline wander)
        self.hp_cutoff = float(ecg_cfg.get("hp_cutoff", 0.5))
        self.hp_order  = int(ecg_cfg.get("hp_order", 4))

        # Low-pass (removes EMG contamination above 20 Hz)
        self.lp_cutoff = float(ecg_cfg.get("cutoff", 20.0))
        self.lp_order  = int(ecg_cfg.get("order", 4))

        # Notch (powerline)
        self.notch_enabled = ecg_cfg.get("notch_enabled", True)
        self.notch_freq    = float(ecg_cfg.get("notch_freq", 50.0))
        self.notch_q       = float(ecg_cfg.get("notch_q", 30.0))

        # Bandpass (preferred over separate HP+LP; covers 0.5–20 Hz by default)
        self.bp_enabled = ecg_cfg.get("bandpass_enabled", True)
        self.bp_low     = float(ecg_cfg.get("bandpass_low",  0.5))
        self.bp_high    = float(ecg_cfg.get("bandpass_high", 20.0))
        self.bp_order   = int(ecg_cfg.get("bandpass_order", 4))

    def _design_filters(self):
        nyq = self.sr / 2.0

        # 1. High-pass
        if self.hp_cutoff > 0:
            wn_hp = self.hp_cutoff / nyq
            self.sos_hp = butter(self.hp_order, wn_hp, btype="high", analog=False, output='sos')
        else:
            self.sos_hp = None

        # 2. Low-pass
        if self.lp_cutoff > 0 and self.lp_cutoff < nyq:
            wn_lp = self.lp_cutoff / nyq
            self.sos_lp = butter(self.lp_order, wn_lp, btype="low", analog=False, output='sos')
        else:
            self.sos_lp = None

        # 3. Notch
        if self.notch_enabled:
            from scipy.signal import iirnotch
            self.b_notch, self.a_notch = iirnotch(self.notch_freq, self.notch_q, fs=self.sr)
        else:
            self.b_notch = self.a_notch = None

        # 4. Bandpass (applied after HP/LP if also enabled)
        if self.bp_enabled:
            low  = self.bp_low  / nyq
            high = self.bp_high / nyq
            if low <= 0 or high >= 1 or low >= high:
                self.sos_bp = None
            else:
                self.sos_bp = butter(self.bp_order, [low, high], btype="bandpass", analog=False, output='sos')
        else:
            self.sos_bp = None

    # ------------------------------------------------------------------
    # Config Hot-Reload
    # ------------------------------------------------------------------

    def update_config(self, config: dict, sr: int):
        old_state = (self.hp_cutoff, self.lp_cutoff, self.notch_enabled,
                     self.bp_enabled, self.bp_low, self.bp_high)

        self.config = config
        self.sr     = sr
        self._load_params()

        new_state = (self.hp_cutoff, self.lp_cutoff, self.notch_enabled,
                     self.bp_enabled, self.bp_low, self.bp_high)

        if old_state != new_state:
            print("[ECG] Config changed -> Redesigning filters")
            self._design_filters()
            self.zi_hp    = sosfilt_zi(self.sos_hp) * 0.0 if getattr(self, 'sos_hp', None) is not None else None
            self.zi_lp    = sosfilt_zi(self.sos_lp) * 0.0 if getattr(self, 'sos_lp', None) is not None else None
            self.zi_notch = lfilter_zi(self.b_notch, self.a_notch) * 0.0 if self.notch_enabled else None
            self.zi_bp    = sosfilt_zi(self.sos_bp) * 0.0 if self.bp_enabled and getattr(self, 'sos_bp', None) is not None else None

    # ------------------------------------------------------------------
    # Sample-by-Sample Processing
    # ------------------------------------------------------------------

    def process_sample(self, val: float) -> float:
        out = val

        # 1. High-pass (DC baseline removal)
        if getattr(self, 'sos_hp', None) is not None:
            if self.zi_hp is None:
                self.zi_hp = sosfilt_zi(self.sos_hp) * 0.0
            filtered, self.zi_hp = sosfilt(self.sos_hp, [out], zi=self.zi_hp)
            out = filtered[0]

        # 2. Low-pass (EMG noise removal)
        if getattr(self, 'sos_lp', None) is not None:
            if self.zi_lp is None:
                self.zi_lp = sosfilt_zi(self.sos_lp) * 0.0
            filtered, self.zi_lp = sosfilt(self.sos_lp, [out], zi=self.zi_lp)
            out = filtered[0]

        # 3. Notch (powerline)
        if self.notch_enabled and self.zi_notch is not None:
            filtered, self.zi_notch = lfilter(self.b_notch, self.a_notch, [out], zi=self.zi_notch)
            out = filtered[0]

        # 4. Bandpass (combines HP + LP in one stage when enabled)
        if self.bp_enabled and getattr(self, 'sos_bp', None) is not None:
            if self.zi_bp is None:
                self.zi_bp = sosfilt_zi(self.sos_bp) * 0.0
            filtered, self.zi_bp = sosfilt(self.sos_bp, [out], zi=self.zi_bp)
            out = filtered[0]

        return float(out)
