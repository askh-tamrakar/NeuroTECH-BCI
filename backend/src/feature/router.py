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
try:
    from src.utils.paths import get_config_dir
    _CONFIG_DIR = get_config_dir()
except ImportError:
    _CONFIG_DIR = PROJECT_ROOT / "config"
CONFIG_PATH = _CONFIG_DIR / "sensor_config.json"

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


# ─── Detection Event Logger ──────────────────────────────────────────────────
_EVENT_ICONS = {
    "Rock": "✊", "Paper": "✋", "Scissors": "✌",
    "SingleBlink": "◉", "DoubleBlink": "◉◉",
}

def _log_detection_event(event_name: str, ch_idx: int, sensor_type: str):
    """Pretty-print a confirmed detection event (passes pipeline.py ALLOWLIST via [event] tag)."""
    label = event_name
    if event_name.startswith("TARGET_"):
        try:
            hz = event_name.replace("TARGET_", "").replace("HZ", "").replace("_", ".")
            label = f"{float(hz):.2f} Hz"
        except Exception:
            pass
    icon = _EVENT_ICONS.get(event_name, "◆")
    print(f"[event] {icon}  {sensor_type:<4} │ {label:<16} │ ch{ch_idx}", flush=True)


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

        for i in range(self.num_channels):
            ch_key = f"ch{i}"
            if ch_key in mapping:
                info = mapping[ch_key]
                if not info.get("enabled", True):
                    continue

                sensor   = info.get("sensor", "UNKNOWN")
                ch_label = info.get("label", ch_key)

                if sensor == "EOG":
                    eog_method = self.config.get("features", {}).get("EOG", {}).get("detection_method", "Threshold")
                    extractor  = BlinkExtractor(i, self.config, self.sr)
                    if eog_method == "ML":
                        try:
                            model_name = config_manager.get_active_model("EOG") or "eog_rf"
                        except Exception:
                            model_name = "eog_rf"
                        detector = EOGMLDetector(self.config)
                        detail   = f"model={model_name}.joblib"
                    else:
                        thresh   = self.config.get("features", {}).get("EOG", {}).get("threshold", "auto")
                        detector = BlinkDetector(self.config)
                        detail   = f"threshold={thresh}"
                    print(f"[config] ch{i} ({ch_label:<8}) EOG  │ {eog_method:<9} Detector  {detail}")
                    self.pipeline[i] = (extractor, detector, "EOG")

                elif sensor == "EMG":
                    extractor   = RPSExtractor(i, self.config, self.sr)
                    detector    = RPSDetector(self.config)
                    emg_classes = list(self.config.get("features", {}).get("EMG", {}).get("classes", ["Rock", "Paper", "Scissors"]))
                    print(f"[config] ch{i} ({ch_label:<8}) EMG  │ RPS Detector    classes={', '.join(emg_classes)}")
                    self.pipeline[i] = (extractor, detector, "EMG")

                elif sensor == "EEG":
                    extractor = EEGExtractor(i, self.config, self.sr)
                    detector  = EEGFrequencyDetector(self.config)
                    freqs     = [str(t.get("freq", "?")) for t in self.config.get("features", {}).get("EEG", {}).get("targets", [])]
                    freq_str  = "  ".join(freqs) + " Hz" if freqs else "no targets"
                    print(f"[config] ch{i} ({ch_label:<8}) EEG  │ FBCCA SSVEP     targets={freq_str}")
                    self.pipeline[i] = (extractor, detector, "EEG")

    def run(self):
        self.running = True
        last_check_time = time.time()
        
        while self.running:
            try:
                # 1. Check for Configuration Changes (Model switch, thresh change, etc)
                # Check every 0.5 seconds regardless of sample rate
                if time.time() - last_check_time > 0.5:
                    current_vhash = config_manager.get_config_version_hash()
                    if current_vhash != self.last_config_vhash:
                        print(f"[config] Feature Router reloading pipeline (config changed)", flush=True)
                        self.config = load_config()
                        self.configure_pipeline()
                        self.last_config_vhash = current_vhash
                    
                    self.detection_active = config_manager.get_detection_state()
                    last_check_time = time.time()

                # 2. Pull data from inlet
                # Use adaptive timeout to avoid CPU spin when no data
                sample, ts = self.inlet.pull_sample(timeout=0.5)

                if sample:
                    # Get global active status
                    global_active = False
                    if isinstance(self.detection_active, dict):
                        global_active = self.detection_active.get("active", False)
                    elif isinstance(self.detection_active, bool):
                        global_active = self.detection_active
                        
                    # Route to pipeline
                    for ch_idx, val in enumerate(sample):
                        if ch_idx in self.pipeline:
                            extractor, detector, sensor_type = self.pipeline[ch_idx]
                            
                            # Check if the specific detector is active
                            sensor_active = False
                            if isinstance(self.detection_active, dict):
                                sensor_active = self.detection_active.get(sensor_type, False)
                            else:
                                sensor_active = global_active
                                
                            if not (global_active and sensor_active):
                                continue
                                
                            features = extractor.process(val)
                            
                            if features:
                                # Feature Extractor produced a window -> Run Detector
                                detection_result = detector.detect(features)
                                
                                # Process based on sensor type
                                if sensor_type == "EMG":
                                    if detection_result and len(detection_result) == 3:
                                        instant_label, confirmed_label, detection_state = detection_result
                                    elif detection_result and len(detection_result) == 2:
                                        instant_label, confirmed_label = detection_result
                                        detection_state = "waiting"
                                    else:
                                        instant_label, confirmed_label, detection_state = "Rest", None, "waiting"
                                    
                                    # 1. Emit Real-time Prediction (Instant Feedback)
                                    # We emit this every frame for the UI
                                    self._emit_event("emg_prediction", ch_idx, sensor_type, features, ts, extra_data={"label": instant_label, "detection_state": detection_state})
                                    
                                    # 2. Emit Confirmed Gesture (Game Move)
                                    if confirmed_label:
                                        self._emit_event(confirmed_label, ch_idx, sensor_type, features, ts)
                                        
                                elif sensor_type == "EOG":
                                    if isinstance(detection_result, str) and detection_result:
                                        self._emit_event(detection_result, ch_idx, sensor_type, features, ts)
                                elif sensor_type == "EEG":
                                    if detection_result:
                                        self._emit_event(detection_result, ch_idx, sensor_type, features, ts)

            except Exception as e:
                print(f"[FeatureRouter] [WARNING] Error: {e}")
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
                if current_time - last_ts < 0.5:
                    return
            if event_name == "emg_prediction":
                pass
        elif sensor_type == "EOG":
            pass
        else:
            if event_name == last_event:
                return

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
        if event_name not in ("emg_prediction", "Rest"):
            _log_detection_event(event_name, ch_idx, sensor_type)
        self.outlet.push_sample([formatted_event])

if __name__ == "__main__":
    router = FeatureRouter()
    if router.resolve_stream():
        router.run()


