from pathlib import Path
import json
import numpy as np

# Try relative imports if running as package, else fallback
# Robust imports
try:
    # Try absolute imports (Django Context)
    from backend.core.processing.emg_processor import EMGFilterProcessor
    from backend.core.processing.eog_processor import EOGFilterProcessor
    from backend.core.processing.eeg_processor import EEGFilterProcessor
    from backend.core.utils.config import config_manager
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
        Input: { 'ch0': val, 'ch1': val ... }
        Output: { 'ch0': filtered_val, 'ch1': filtered_val ... }
        """
        result = {}
        
        # Iterate over inputs
        # We support both 'ch0' keys and integer 0 keys handling
        
        for k, val in sample_dict.items():
            # Parse channel index
            try:
                if isinstance(k, int):
                    idx = k
                elif k.startswith('ch'):
                    idx = int(k[2:])
                else:
                    # Pass through non-channel keys (like timestamp)
                    result[k] = val
                    continue
            except:
                result[k] = val
                continue
                
            # Process
            processor = self.processors.get(idx)
            if processor:
                try:
                    result[k] = processor.process_sample(float(val))
                except Exception as e:
                    # Fallback on error
                    result[k] = val
            else:
                result[k] = val
                
        return result
