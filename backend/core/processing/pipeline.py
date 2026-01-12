from pathlib import Path
import json
import numpy as np

# Try relative imports if running as package, else fallback
# Robust imports
try:
    # Try absolute imports (Django Context)
    from core.processing.emg_processor import EMGFilterProcessor
    from core.processing.eog_processor import EOGFilterProcessor
    from core.processing.eeg_processor import EEGFilterProcessor
    from core.utils.config import config_manager
except ImportError:
    try:
        # Try relative imports (Package Context)
        from .emg_processor import EMGFilterProcessor
        from .eog_processor import EOGFilterProcessor
        from .eeg_processor import EEGFilterProcessor
        from ..utils.config import config_manager
    except ImportError:
        config_manager = None
        EMGFilterProcessor = None
        EOGFilterProcessor = None
        EEGFilterProcessor = None

class ProcessingPipeline:
    def __init__(self):
        try:
            if config_manager:
                self.config = config_manager.get_all_configs()
            else:
                self.config = {}
                print("[Pipeline] Warning: Config Manager not available, using defaults")
        except Exception as e:
            print(f"[Pipeline] Config Fetch Error: {e}")
            self.config = {}
        self.sr = int(self.config.get("sampling_rate", 512))
        
        self.processors = {}
        self.channel_map = self.config.get("channel_mapping", {})
        
        self._initialize_processors()
        
    def _initialize_processors(self):
        try:
            # Initialize processors based on config
            # This mirrors filter_router.py logic but simplified for WebSocket use
            # Assuming fixed 4 channels for now or dynamic based on config keys
            
            # We iterate 0..3 (standard hardware channels)
            for i in range(4):
                key = f"ch{i}"
                if key in self.channel_map:
                    info = self.channel_map[key]
                    enabled = info.get("enabled", True)
                    sensor = info.get("sensor", "UNKNOWN")
                    
                    if not enabled:
                        self.processors[i] = None
                        continue
                        
                    if sensor == "EMG" and EMGFilterProcessor:
                        self.processors[i] = EMGFilterProcessor(self.config, self.sr, channel_key=key)
                    elif sensor == "EOG" and EOGFilterProcessor:
                        self.processors[i] = EOGFilterProcessor(self.config, self.sr, channel_key=key)
                    elif sensor == "EEG" and EEGFilterProcessor:
                        self.processors[i] = EEGFilterProcessor(self.config, self.sr, channel_key=key)
                    else:
                        self.processors[i] = None
                else:
                    self.processors[i] = None
        except Exception as e:
            print(f"[Pipeline] Critical Initialization Error: {e}")
            # Ensure we don't leave undefined state if possible, though dict is distinct
            pass

    def process_sample(self, sample_dict):
        """
        Process a dictionary of channel values.
        Input: { 'ch0': val, 'ch1': val, 'channels': { '0': val } ... }
        Output: { 'ch0': filtered_val, ... 'channels': { '0': filtered_val } }
        Ensures each channel is processed exactly once per sample to maintain filter state.
        """
        result = sample_dict.copy()
        
        # We process based on configured processors map
        for idx, processor in self.processors.items():
            if processor is None:
                continue
                
            # extract raw value from multiple possible locations
            raw_val = None
            
            # 1. Top level 'chX'
            key_str = f"ch{idx}"
            if key_str in sample_dict:
                raw_val = sample_dict[key_str]
            # 2. Top level integer key
            elif idx in sample_dict:
                raw_val = sample_dict[idx]
            # 3. Nested 'channels' dict
            elif 'channels' in sample_dict and isinstance(sample_dict['channels'], dict):
                channels = sample_dict['channels']
                if str(idx) in channels:
                    raw_val = channels[str(idx)]
                elif idx in channels:
                    raw_val = channels[idx]

            # If found, process and update ALL locations
            if raw_val is not None:
                try:
                    # Handle object format if raw_val is { value: ... }
                    val_float = float(raw_val) if not isinstance(raw_val, dict) else float(raw_val.get('value', 0))
                    
                    # Process (advance filter state)
                    filtered_val = processor.process_sample(val_float)
                    
                    # Write back to result
                    if key_str in result:
                        result[key_str] = filtered_val
                    if idx in result:
                        result[idx] = filtered_val
                    if 'channels' in result and isinstance(result['channels'], dict):
                        if str(idx) in result['channels']:
                            result['channels'][str(idx)] = filtered_val
                        if idx in result['channels']:
                            result['channels'][idx] = filtered_val
                            
                except Exception as e:
                    # On error, leave raw value
                    pass

        return result
