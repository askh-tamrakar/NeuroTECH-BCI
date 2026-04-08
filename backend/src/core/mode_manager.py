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
from ..utils.config import config_manager

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
        self.channel_index = 0
        
        # Stimulus settings (Visual)
        self.ssvep_freqs = [8.0, 9.0, 12.0, 14.4, 16.0, 18.0]

    def _resolve_eeg_channel_index(self, preset_name):
        mapping = config_manager.get_channel_mapping() or {}
        preset_lower = (preset_name or "").lower()

        def _extract_index(channel_key):
            try:
                return int(str(channel_key).replace("ch", ""))
            except Exception:
                return None

        def _channel_text(info):
            parts = [
                info.get("label"),
                info.get("name"),
                info.get("electrode"),
                info.get("position"),
                info.get("montage"),
                info.get("channel"),
            ]
            return " ".join(str(part) for part in parts if part).lower()

        eeg_channels = []
        for channel_key, info in mapping.items():
            if str(info.get("sensor", "")).upper() != "EEG":
                continue
            if info.get("enabled", True) is False:
                continue
            index = _extract_index(channel_key)
            if index is None:
                continue
            eeg_channels.append((index, _channel_text(info)))

        eeg_channels.sort(key=lambda item: item[0])
        if not eeg_channels:
            return 0

        target_token = None
        if "fp1" in preset_lower:
            target_token = "fp1"
        elif "fp2" in preset_lower:
            target_token = "fp2"
        elif "oz" in preset_lower:
            target_token = "oz"

        if target_token:
            for index, text in eeg_channels:
                if target_token in text:
                    return index

        if len(eeg_channels) == 1:
            return eeg_channels[0][0]

        if "fp2" in preset_lower:
            return eeg_channels[min(1, len(eeg_channels) - 1)][0]

        return eeg_channels[0][0]

    def set_preset_and_view(self, preset_name, view_name):
        self.preset = preset_name
        self.view = view_name
        
        preset_lower = (preset_name or "").lower()

        # Dynamically map the default ch0 to the right active electrode name 
        # so the UI and backend are aligned cleanly on one-channel setups.
        try:
            from ..server.server.state import state
            if state.channel_mapping and "ch0" in state.channel_mapping:
                state.channel_mapping["ch0"]["sensor"] = "EEG"
                if "visual" in preset_lower or "ssvep" in preset_lower or "oz" in preset_lower:
                    state.channel_mapping["ch0"]["label"] = "Oz"
                else:
                    state.channel_mapping["ch0"]["label"] = "Fp1"
        except ImportError:
            pass # Server state might not be active in some tests

        eeg_cfg = config_manager.get_features_for_sensor("EEG")
        target_freqs = eeg_cfg.get("target_freqs", self.ssvep_freqs)
        if target_freqs:
            self.ssvep_freqs = [float(freq) for freq in target_freqs]

        if "visual" in preset_lower or "ssvep" in preset_lower:
            self.mode = "visual"
            self.channel_index = self._resolve_eeg_channel_index(preset_name)
            self.preprocessor = EEGPreprocessor(mode="visual", sr=self.sr)
            self.window_buffer = EEGWindowBuffer(window_size_sec=1.5, step_size_sec=0.25, sr=self.sr, num_channels=1)
            self.app_module = None # visual uses direct fbcca logic
            log.info(f"ModeManager configured for Visual EEG (Preset: {preset_name})")
            
        elif "frontal" in preset_lower:
            self.mode = "frontal"
            self.channel_index = self._resolve_eeg_channel_index(preset_name)
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
                    "scores": scores.tolist(),
                    "source_channel": self.channel_index,
                    "preset": self.preset,
                    "eeg_mapped": self.has_eeg_channel(),
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
                    "output": result,
                    "source_channel": self.channel_index,
                    "preset": self.preset,
                    "eeg_mapped": self.has_eeg_channel(),
                }
                
        return None

    def get_channel_index(self):
        return self.channel_index

    def has_eeg_channel(self):
        """Check if any channel in sensor config is mapped to EEG."""
        mapping = config_manager.get_channel_mapping() or {}
        for ch_key, info in mapping.items():
            if str(info.get("sensor", "")).upper() == "EEG" and info.get("enabled", True):
                return True
        return False

    def start_meditation_session(self, duration_sec=300):
        """Start a timed meditation session."""
        if self.app_module and hasattr(self.app_module, 'start_session'):
            self.app_module.start_session(duration_sec)

    def stop_meditation_session(self):
        """Stop meditation session and return detailed results."""
        if self.app_module and hasattr(self.app_module, 'stop_session'):
            return self.app_module.stop_session()
        return {"message": "No active meditation module"}
