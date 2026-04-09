"""
Preprocessing Module
Handles Notch and Bandpass filtering.
"""
import numpy as np
from scipy.signal import butter, lfilter, iirnotch

class EEGPreprocessor:
    def __init__(self, mode="frontal", sr=1000):
        self.sr = sr
        self.mode = mode
        self.notch_freq = 50.0
        self.notch_q = 30.0
        
        if mode == "visual":
            # Visual EEG: 6-45 Hz
            self.lowcut = 6.0
            self.highcut = 45.0
            self.order = 4
        else:
            # Frontal EEG: 0.5-45 Hz
            self.lowcut = 0.5
            self.highcut = 45.0
            self.order = 4
            
        self._design_filters()

    def _design_filters(self):
        nyq = self.sr / 2.0
        # Notch
        self.b_notch, self.a_notch = iirnotch(self.notch_freq, self.notch_q, fs=self.sr)
        
        # Bandpass
        low = self.lowcut / nyq
        high = self.highcut / nyq
        self.b_bp, self.a_bp = butter(self.order, [low, high], btype="bandpass")

    def process_window(self, data):
        """
        Process an entire window of data.
        data shape: (n_samples, ) or (n_samples, n_channels)
        """
        if data is None or len(data) == 0:
            return data
            
        # 1. Notch
        notch_filtered = lfilter(self.b_notch, self.a_notch, data, axis=0)
        
        # 2. Bandpass
        bp_filtered = lfilter(self.b_bp, self.a_bp, notch_filtered, axis=0)
        
        return bp_filtered
