"""
Mode Manager
Orchestrates the pipeline based on selected preset and view.
"""
import copy
import logging

from .preprocessing import EEGPreprocessor
from .windowing import EEGWindowBuffer
from .spectral_features import compute_band_powers
from .feature_vector import compute_feature_vector
from .fbcca import fbcca

# Import Frontal Modules
from ..modules.music_control import MusicControlModule
from ..modules.focus_monitor import FocusMonitorModule
from ..modules.meditation_trainer import MeditationTrainerModule
from ..modules.stress_monitor import StressMonitorModule
from ..modules.bubble_game import BubbleGameModule

log = logging.getLogger(__name__)

class ModeManager:
    def __init__(self, sr=1000):
        self.sr = sr
        self.preset = None
        self.view = None
        self.mode = None # "visual" or "frontal"
        
        # Pipeline state
        self.preprocessor = None
        self.window_buffer = None
        self.app_module = None
        
        # Stimulus settings (Visual)
        self.ssvep_freqs = [8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0]

    def set_preset_and_view(self, preset_name, view_name):
        self.preset = preset_name
        self.view = view_name
        
        if "visual" in preset_name.lower():
            self.mode = "visual"
            self.preprocessor = EEGPreprocessor(mode="visual", sr=self.sr)
            self.window_buffer = EEGWindowBuffer(window_size_sec=1.5, step_size_sec=0.25, sr=self.sr, num_channels=1)
            self.app_module = None # visual uses direct fbcca logic
            log.info(f"ModeManager configured for Visual EEG (Preset: {preset_name})")
            
        elif "frontal" in preset_name.lower():
            self.mode = "frontal"
            self.preprocessor = EEGPreprocessor(mode="frontal", sr=self.sr)
            self.window_buffer = EEGWindowBuffer(window_size_sec=2.0, step_size_sec=0.5, sr=self.sr, num_channels=1)
            
            # Load appropriate module
            if view_name == "music":
                self.app_module = MusicControlModule()
            elif view_name == "focus":
                self.app_module = FocusMonitorModule()
            elif view_name == "meditation":
                self.app_module = MeditationTrainerModule()
            elif view_name == "stress":
                self.app_module = StressMonitorModule()
            elif view_name == "bubble":
                self.app_module = BubbleGameModule()
            else:
                self.app_module = None
                log.warning(f"Unknown view {view_name} for frontal mode.")
                
            log.info(f"ModeManager configured for Frontal EEG (Preset: {preset_name}, View: {view_name})")

    def process_sample(self, sample):
        """
        Processes a single sample, pushing it through the pipeline.
        Returns the module output if a window was processed, else None.
        """
        if not self.mode or not self.window_buffer:
            return None
            
        # sample should be an array-like of shape (num_channels,)
        window_ready = self.window_buffer.add_sample(sample)
        
        if window_ready:
            raw_window = self.window_buffer.get_window()
            
            # Preprocess
            filtered_window = self.preprocessor.process_window(raw_window)
            
            # Application Logic
            if self.mode == "visual":
                # Assuming single channel target
                ch_data = filtered_window[:, 0]
                target_idx, scores = fbcca(ch_data, self.ssvep_freqs, self.sr)
                return {
                    "type": "visual_result",
                    "target_index": target_idx,
                    "scores": scores.tolist()
                }
                
            elif self.mode == "frontal" and self.app_module:
                ch_data = filtered_window[:, 0]
                band_powers = compute_band_powers(ch_data, self.sr)
                features = compute_feature_vector(band_powers)
                
                result = self.app_module.process(features)
                
                return {
                    "type": "frontal_result",
                    "features": features,
                    "band_powers": list(band_powers.values()),
                    "output": result
                }
                
        return None
