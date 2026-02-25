"""
Feature Router
- Listens to: BioSignals-Processed (LSL)
- Routing: Based on channel_mapping
- Processing: Runs Extractors (EOG -> Blink)
- Output: BioSignals-Events (LSL Markers)
"""

import sys
import os

# UTF-8 encoding for standard output to avoid UnicodeEncodeError in some terminals
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

import time
import json
import threading
from pathlib import Path
try:
    import pylsl
    LSL_AVAILABLE = True
except ImportError:
    LSL_AVAILABLE = False

from .extractors.blink_extractor import BlinkExtractor
from .detectors.blink_detector import BlinkDetector
from .detectors.eog_ml_detector import EOGMLDetector
from .extractors.rps_extractor import RPSExtractor
from .detectors.rps_detector import RPSDetector
from .extractors.trigger_extractor import EEGExtractor
from .detectors.eeg_frequency_detector import EEGFrequencyDetector

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CONFIG_PATH = PROJECT_ROOT / "config" / "sensor_config.json"

INPUT_STREAM_NAME = "BioSignals-Processed"
OUTPUT_STREAM_NAME = "BioSignals-Events"

try:
    from ..utils.config import config_manager
except ImportError:
    # Try relative path if running as script
    sys.path.append(str(PROJECT_ROOT / "src"))
    from utils.config import config_manager

def load_config():
    # Use the facade to get merged config (Sensor + Features)
    # This ensures Detectors find their 'features' key
    return config_manager.get_all_configs()

class FeatureRouter:
    def __init__(self):
        self.config = load_config()
        self.sr = self.config.get("sampling_rate", 512)
        
        self.inlet = None
        self.outlet = None
        self.running = False
        
        # Map channel_index -> (Extractor Instance, Detector Instance)
        self.pipeline = {} 
        self.channel_labels = []
        
        # State tracking
        self.sample_counter = 0
        self.detection_active = False # Start disabled/passive
        self.last_event_state = {} # Key: ch_idx_type -> event_name
        self.last_event_time = {} # Key: ch_idx_type -> timestamp
        self.last_config_vhash = config_manager.get_config_version_hash()


    def resolve_stream(self):
        if not LSL_AVAILABLE:
            print("[FeatureRouter] ❌ pylsl not installed")
            return False

        print(f"[FeatureRouter] [SEARCH] Searching for {INPUT_STREAM_NAME}...")
        streams = pylsl.resolve_byprop('name', INPUT_STREAM_NAME, timeout=1.0)
        if not streams:
            print("[FeatureRouter] [ERROR] Stream not found")
            return False
            
        self.inlet = pylsl.StreamInlet(streams[0])
        info = self.inlet.info()
        self.sr = int(info.nominal_srate())
        self.parse_channels(info)
        
        print(f"[FeatureRouter] [OK] Connected to {INPUT_STREAM_NAME} ({len(self.channel_labels)} ch @ {self.sr} Hz)")
        
        # Create Event Outlet
        self.create_outlet()
        
        # Initialize Extractors based on mapping
        self.configure_pipeline()
        
        return True

    def create_outlet(self):
        info = pylsl.StreamInfo(OUTPUT_STREAM_NAME, 'Markers', 1, 0, 'string', 'BioEvents123')
        self.outlet = pylsl.StreamOutlet(info)
        print(f"[FeatureRouter] [OUTLET] Created Event Outlet: {OUTPUT_STREAM_NAME}")

    def parse_channels(self, info):
        # Simplistic parsing - relying on config mostly, but let's see what stream says
        # Ideally, reading the layout from the StreamInfo desc if available
        # But we will rely on strict index mapping from config for now as requested
        self.num_channels = info.channel_count()
        # For logging
        self.channel_labels = [f"ch{i}" for i in range(self.num_channels)]

    def configure_pipeline(self):
        """
        Instantiate extractors for channels based on config.
        """
        self.extractors = {}
        mapping = self.config.get("channel_mapping", {})
        
        print(f"[FeatureRouter] [CONFIG] Configuring features for {self.num_channels} channels...")
        
        for i in range(self.num_channels):
            ch_key = f"ch{i}"
            if ch_key in mapping:
                info = mapping[ch_key]
                if not info.get("enabled", True):
                    continue
                    
                sensor = info.get("sensor", "UNKNOWN")
                
                if sensor == "EOG":
                    print(f" [{i}] -> EOG Blink Pipeline (Extractor + Detector)")
                    extractor = BlinkExtractor(i, self.config, self.sr)
                    # Use ML Detector if available, logic inside EOGMLDetector handles fallback?
                    # Or check detection state? EOGMLDetector handles model loading.
                    detector = EOGMLDetector(self.config)
                    self.pipeline[i] = (extractor, detector, "EOG")
                elif sensor == "EMG":
                    print(f" [{i}] -> EMG RPS Pipeline (Extractor + Detector)")
                    extractor = RPSExtractor(i, self.config, self.sr)
                    detector = RPSDetector(self.config)
                    self.pipeline[i] = (extractor, detector, "EMG")
                elif sensor == "EEG":
                    print(f" [{i}] -> EEG Pipeline (FBCCA SSVEP)")
                    extractor = EEGExtractor(i, self.config, self.sr)
                    detector = EEGFrequencyDetector(self.config)
                    self.pipeline[i] = (extractor, detector, "EEG")

    def run(self):
        self.running = True
        print("[FeatureRouter] [START] Loop started")
        
        last_check_time = time.time()
        
        while self.running:
            try:
                # 1. Check for Configuration Changes (Model switch, thresh change, etc)
                # Check every 0.5 seconds regardless of sample rate
                if time.time() - last_check_time > 0.5:
                    current_vhash = config_manager.get_config_version_hash()
                    if current_vhash != self.last_config_vhash:
                        print(f"\n{'*'*60}\n[FeatureRouter] 📁 Config changed — reloading pipeline...\n{'*'*60}\n", flush=True)
                        self.config = load_config()
                        self.configure_pipeline()
                        self.last_config_vhash = current_vhash
                    
                    self.detection_active = config_manager.get_detection_state()
                    last_check_time = time.time()

                # 2. Pull data from inlet
                # Use short timeout to allow loop to cycle back to config check
                sample, ts = self.inlet.pull_sample(timeout=0.1)

                if sample:
                    # Route to pipeline
                    for ch_idx, val in enumerate(sample):
                        if ch_idx in self.pipeline:
                            extractor, detector, sensor_type = self.pipeline[ch_idx]
                            features = extractor.process(val)
                            
                            if features:
                                # Feature Extractor produced a window -> Run Detector
                                # print(f"[Router] Extracted Features from ch{ch_idx} ({sensor_type}). Running Detector...")
                                detection_result = detector.detect(features)
                                # print(f"[Router] Detector Result: {detection_result}")
                                
                                if detection_result:
                                    # LOGIC FIX: 
                                    # 1. We MUST emit "Rest" for RPS game to reset state
                                    # 2. We MUST allow repeated gestures (e.g. Rock -> Rock)
                                    
                                    # Determine event name
                                    if sensor_type == "EOG":
                                        event_name = detection_result # SingleBlink/DoubleBlink
                                    elif sensor_type == "EMG":
                                        event_name = detection_result 
                                    elif sensor_type == "EEG":
                                        event_name = detection_result 
                                    else:
                                        event_name = "UNKNOWN_EVENT"

                                    # STRICT Validation to prevent blank logs
                                    if not event_name:
                                        continue
                                    if not isinstance(event_name, str):
                                        continue
                                    if not event_name.strip():
                                        continue
                                    if event_name == "None": # String "None" check just in case
                                        continue

                                    # De-duplication Logic
                                    state_key = f"{ch_idx}_{sensor_type}"
                                    last_event = self.last_event_state.get(state_key)
                                    last_ts = self.last_event_time.get(state_key, 0)
                                    current_time = time.time()

                                    # For EMG/RPS: 
                                    # We WANT to allow same gesture twice if it was a distinct release-and-perform action.
                                    # The Detector (RPSDetector) is stateful: it only returns a value when a gesture FINISHES (or Rest).
                                    # So every output from detector.detect() is a meaningful event.
                                    # We should NOT dedup EMG events unless it's just spamming "Rest" repeatedly.
                                    
                                    if sensor_type == "EMG":
                                        # HEARTBEAT LOGIC FOR REST
                                        # If it's "Rest", we normally dedup. 
                                        # BUT, if the game missed the "Rest" signal (e.g. during cooldown), it gets stuck.
                                        # So we emit "Rest" periodically (e.g. every 0.5s) even if it's a duplicate.
                                        if event_name == "Rest" and last_event == "Rest":
                                            if current_time - last_ts > 0.5:
                                                # Allow heartbeat
                                                pass 
                                            else:
                                                continue
                                        # Otherwise (Gestures), always pass through, even if same as last
                                        pass 
                                    
                                    elif sensor_type == "EOG":
                                        # EOG detector emits discrete events only once per blink, so we can pass them.
                                        # But just in case detector is noisy:
                                        pass
                                    
                                    else:
                                        # Default dedup for other types
                                        if event_name == last_event:
                                            continue
                                    
                                    self.last_event_state[state_key] = event_name
                                    self.last_event_time[state_key] = current_time

                                    # emit event
                                    event_data = {
                                        "event": event_name,
                                        "channel": f"ch{ch_idx}",
                                        "timestamp": ts,
                                        "features": features
                                    }
                                    formatted_event = json.dumps(event_data)
                                    print(f"[Feature Router] [EVENT] {event_name} created")
                                    self.outlet.push_sample([formatted_event])

            except Exception as e:
                print(f"[FeatureRouter] [WARNING] Error: {e}")
                time.sleep(0.1)

if __name__ == "__main__":
    router = FeatureRouter()
    if router.resolve_stream():
        router.run()


