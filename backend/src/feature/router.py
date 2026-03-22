"""
Feature Router
- Listens to: BioSignals-Processed (LSL)
- Routing: Based on channel_mapping
- Processing: Runs Extractors (EOG -> Blink)
- Output: BioSignals-Events (LSL Markers)
"""

import sys
import os
from ..utils.logging_cfg import get_logger
log = get_logger(__name__)

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

from src.utils.paths import get_config_dir

CONFIG_DIR = get_config_dir()
CONFIG_PATH = CONFIG_DIR / "sensor_config.json"

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
            log.error("pylsl not installed")
            return False

        log.debug(f"Searching for {INPUT_STREAM_NAME}...")
        streams = pylsl.resolve_byprop('name', INPUT_STREAM_NAME, timeout=1.0)
        if not streams:
            log.error("Stream not found")
            return False
            
        self.inlet = pylsl.StreamInlet(streams[0])
        info = self.inlet.info()
        self.sr = int(info.nominal_srate())
        self.parse_channels(info)
        
        log.info(f"Connected to {INPUT_STREAM_NAME} ({len(self.channel_labels)} ch @ {self.sr} Hz)")
        
        # Create Event Outlet
        self.create_outlet()
        
        # Initialize Extractors based on mapping
        self.configure_pipeline()
        
        return True

    def create_outlet(self):
        info = pylsl.StreamInfo(OUTPUT_STREAM_NAME, 'Markers', 1, 0, 'string', 'BioEvents123')
        self.outlet = pylsl.StreamOutlet(info)
        log.debug(f"Created Event Outlet: {OUTPUT_STREAM_NAME}")

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
        self.pipeline = {}
        mapping = self.config.get("channel_mapping", {})
        
        log.info(f"Configuring features for {self.num_channels} channels...")
        
        for i in range(self.num_channels):
            ch_key = f"ch{i}"
            if ch_key in mapping:
                info = mapping[ch_key]
                if not info.get("enabled", True):
                    continue
                    
                sensor = str(info.get("sensor", "UNKNOWN")).upper()
                
                if sensor == "EOG":
                    eog_method = self.config.get("features", {}).get("EOG", {}).get("detection_method", "Threshold")
                    log.debug(f" [{i}] -> EOG Blink Pipeline (Extractor + {eog_method} Detector)")
                    extractor = BlinkExtractor(i, self.config, self.sr)
                    
                    if eog_method == "ML":
                        detector = EOGMLDetector(self.config)
                    else:
                        detector = BlinkDetector(self.config)
                        
                    self.pipeline[i] = (extractor, detector, "EOG")
                elif sensor == "EMG":
                    log.debug(f" [{i}] -> EMG RPS Pipeline (Extractor + Detector)")
                    extractor = RPSExtractor(i, self.config, self.sr)
                    detector = RPSDetector(self.config)
                    self.pipeline[i] = (extractor, detector, "EMG")
                elif sensor == "EEG":
                    log.debug(f" [{i}] -> EEG Pipeline (FBCCA SSVEP)")
                    extractor = EEGExtractor(i, self.config, self.sr)
                    detector = EEGFrequencyDetector(self.config)
                    self.pipeline[i] = (extractor, detector, "EEG")

    def run(self):
        self.running = True
        log.info("Loop started")
        
        last_check_time = time.time()
        
        while self.running:
            try:
                # 1. Check for Configuration Changes (Model switch, thresh change, etc)
                # Check every 0.5 seconds regardless of sample rate
                if time.time() - last_check_time > 0.5:
                    current_vhash = config_manager.get_config_version_hash()
                    if current_vhash != self.last_config_vhash:
                        log.info(f"Config changed — reloading pipeline...")
                        try:
                            self.config = load_config()
                            self.configure_pipeline()
                            self.last_config_vhash = current_vhash
                        except Exception as e:
                            log.error(f"Failed to reload pipeline: {e}")
                    
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
                                # Keep feature extraction hot for UI/recording, but gate actual detection
                                # and confirmed event emission on the shared detection state.
                                if not self.detection_active:
                                    continue

                                # Feature Extractor produced a window -> Run Detector
                                detection_result = detector.detect(features)
                                
                                # Process based on sensor type
                                if sensor_type == "EMG":
                                    instant_label, confirmed_label = detection_result
                                    
                                    # 1. Emit Real-time Prediction (Instant Feedback)
                                    # We emit this every frame for the UI
                                    self._emit_event("emg_prediction", ch_idx, sensor_type, features, ts, extra_data={"label": instant_label})
                                    
                                    # 2. Emit Confirmed Gesture (Game Move)
                                    if confirmed_label:
                                        self._emit_event(confirmed_label, ch_idx, sensor_type, features, ts)
                                        
                                elif sensor_type == "EOG":
                                    if isinstance(detection_result, str) and detection_result:
                                        self._emit_event(detection_result, ch_idx, sensor_type, features, ts)
                                elif sensor_type == "EEG":
                                    # EEG detector now returns (live_event, confirmed_event)
                                    live_event, confirmed_event = detection_result
                                    
                                    # 1. Emit Real-time Frequency update (for UI)
                                    live_freq = 0.0
                                    if isinstance(live_event, str) and live_event.startswith("TARGET_"):
                                        try:
                                            num_str = live_event.replace("TARGET_", "").replace("HZ", "").replace("_", ".")
                                            live_freq = float(num_str)
                                        except: pass
                                    
                                    self._emit_event("eeg_prediction", ch_idx, sensor_type, features, ts, extra_data={"frequency": live_freq})

                                    # 2. Emit confirmed event
                                    if confirmed_event:
                                        self._emit_event(confirmed_event, ch_idx, sensor_type, features, ts)

            except Exception as e:
                log.warn(f"Error: {e}")
                time.sleep(0.1)

    def _emit_event(self, event_name: str, ch_idx: int, sensor_type: str, features: dict, ts: float, extra_data: dict = None):
        """Helper to validate, de-duplicate, and emit events."""
        if not event_name or not isinstance(event_name, str) or not event_name.strip():
            return

        state_key = f"{ch_idx}_{sensor_type}"
        last_event = self.last_event_state.get(state_key)
        last_ts = self.last_event_time.get(state_key, 0)
        current_time = time.time()

        # De-duplication Logic
        if sensor_type == "EMG":
            if event_name == "Rest" and last_event == "Rest":
                if current_time - last_ts < 5.0:
                    return
            if event_name == "emg_prediction":
                pass
        elif sensor_type == "EOG":
            pass
        elif sensor_type == "EEG":
            if event_name == "REST" and last_event == "REST":
                return
            # Otherwise, allow repeated TARGET detections (detector has a 500ms internal debounce)
        else:
            if event_name == last_event:
                return

        # Only track state for confirmed events (ignore emg_prediction for throttling)
        if event_name != "emg_prediction":
            self.last_event_state[state_key] = event_name
            self.last_event_time[state_key] = current_time

        # Emit event
        event_data = {
            "event": event_name,
            "channel": f"ch{ch_idx}",
            "timestamp": ts,
            "features": features
        }
        if extra_data:
            event_data.update(extra_data)
            
        formatted_event = json.dumps(event_data)
        if event_name != "emg_prediction":
            log.info(f"Event: {event_name}")
        self.outlet.push_sample([formatted_event])

def main():
    router = FeatureRouter()
    log.info(f"Feature Router starting... (watching {CONFIG_PATH})")
    
    # Loop until stream is resolved
    while True:
        if router.resolve_stream():
            try:
                router.run()
            except Exception as e:
                log.error(f"Router crash: {e}")
                time.sleep(2)
        else:
            log.warning(f"Waiting for {INPUT_STREAM_NAME} LSL stream...")
            time.sleep(5)

if __name__ == "__main__":
    main()


