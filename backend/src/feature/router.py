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
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
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
from .detectors.hybrid_eog_detector import HybridEOGDetector
from .extractors.rps_extractor import RPSExtractor
from .detectors.rps_detector import RPSDetector
from .extractors.trigger_extractor import EEGExtractor
from .detectors.eeg_frequency_detector import EEGFrequencyDetector
from .extractors.ecg_extractor import ECGExtractor
from .detectors.ecg_detector import ECGDetector

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
try:
    from data.backend.src.utils.paths import get_config_dir
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
    from data.backend.src.utils.config import config_manager

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
        self._prev_emg_active = False  # Tracks EMG activation edge for detector reset

        # ── Raw EMG prediction log (pure model output, no majority voting) ──
        self._pred_log_path = PROJECT_ROOT / "logs" / "emg_raw_predictions.csv"
        self._pred_log_path.parent.mkdir(parents=True, exist_ok=True)
        self._pred_log_file = open(self._pred_log_path, 'a', encoding='utf-8', buffering=1)
        if self._pred_log_path.stat().st_size == 0:
            self._pred_log_file.write("iso_time,channel,label,confidence,detection_state\n")
            self._pred_log_file.flush()

        # ── Raw EOG detection log ──
        self._eog_log_path = PROJECT_ROOT / "logs" / "eog_raw_detections.csv"
        self._eog_log_file = open(self._eog_log_path, 'a', encoding='utf-8', buffering=1)
        if self._eog_log_path.stat().st_size == 0:
            self._eog_log_file.write("iso_time,channel,label,confidence,amplitude_uv,duration_ms,peak_count,verdict\n")
            self._eog_log_file.flush()

        # ── Console Watcher (CSV-based) + Runtime Commands ──
        self._watch_sensor = None
        self._watch_active = True
        self._watch_lock = threading.Lock()
        self._cmd_thread = threading.Thread(target=self._console_cmd_loop, daemon=True)
        self._cmd_thread.start()
        print("\n[cmds]  watch <emg|eog>  │  watch off  │  sensor <EMG|EOG> on|off  │  stats\n")


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
                    eog_method = self.config.get("features", {}).get("EOG", {}).get("detection_method", "Hybrid")
                    extractor  = BlinkExtractor(i, self.config, self.sr)
                    if eog_method == "Hybrid":
                        detector = HybridEOGDetector(self.config)
                        detail   = "Hybrid (ML+Rules+Gate)"
                    elif eog_method == "ML":
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

                elif sensor == "ECG":
                    extractor = ECGExtractor(i, self.config, self.sr)
                    detector  = ECGDetector(self.config)
                    print(f"[config] ch{i} ({ch_label:<8}) ECG  │ Pan-Tompkins R-peak  BPM tracking")
                    self.pipeline[i] = (extractor, detector, "ECG")

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
                    
                    # Reset EMG detector state on False→True activation edge
                    # (ensures clean state each new game, no stale requires_rest)
                    curr_emg = self.detection_active.get("EMG", False) if isinstance(self.detection_active, dict) else bool(self.detection_active)
                    if not self._prev_emg_active and curr_emg:
                        for ch_idx, (ext, det, stype) in self.pipeline.items():
                            if stype == "EMG" and hasattr(det, 'reset_state'):
                                det.reset_state()
                        print("[FeatureRouter] EMG activated — detector state reset", flush=True)
                    self._prev_emg_active = curr_emg

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
                                    confidence = float(getattr(detector, 'last_confidence', 0.0))
                                    self._emit_event("emg_prediction", ch_idx, sensor_type, features, ts, extra_data={
                                        "label": instant_label,
                                        "detection_state": detection_state,
                                        "confidence": round(confidence, 4)
                                    })
                                    # Raw prediction log (pure model output, no majority voting)
                                    self._pred_log_file.write(
                                        f"{time.strftime('%Y-%m-%dT%H:%M:%S.')}{int(time.time()*1000)%1000:03d},"
                                        f"ch{ch_idx},{instant_label},{confidence:.4f},{detection_state}\n"
                                    )
                                    
                                    # 2. Emit Confirmed Gesture (Game Move)
                                    if confirmed_label:
                                        self._emit_event(confirmed_label, ch_idx, sensor_type, features, ts)
                                        
                                elif sensor_type == "EOG":
                                    # Feed adaptive noise floor to hybrid detector
                                    if isinstance(detector, HybridEOGDetector):
                                        detector.set_noise_floor(extractor.get_noise_floor())
                                    if isinstance(detection_result, str) and detection_result:
                                        self._emit_event(detection_result, ch_idx, sensor_type, features, ts)
                                        # ── Raw EOG log ──
                                        eog_conf = getattr(detector, 'last_confidence', 0.0)
                                        verdict = getattr(detector, '_last_verdict', 'accepted')
                                        self._eog_log_file.write(
                                            f"{time.strftime('%Y-%m-%dT%H:%M:%S.')}{int(time.time()*1000)%1000:03d},"
                                            f"ch{ch_idx},{detection_result},{eog_conf:.4f},"
                                            f"{features.get('amplitude',0):.1f},{features.get('duration_ms',0):.1f},"
                                            f"{features.get('peak_count',1)},{verdict}\n"
                                        )
                                elif sensor_type == "EEG":
                                    if detection_result:
                                        self._emit_event(detection_result, ch_idx, sensor_type, features, ts)

                                elif sensor_type == "ECG":
                                    if detection_result and len(detection_result) == 3:
                                        instant_label, confirmed_label, detection_state = detection_result
                                    else:
                                        instant_label, confirmed_label, detection_state = "ecg_live", None, "acquiring"

                                    # Continuous BPM / waveform data for the UI
                                    self._emit_event("ecg_prediction", ch_idx, sensor_type, features, ts,
                                                     extra_data={"detection_state": detection_state})

                                    # Confirmed R-peak → Heartbeat marker
                                    if confirmed_label:
                                        self._emit_event(confirmed_label, ch_idx, sensor_type, features, ts)

            except Exception as e:
                print(f"[FeatureRouter] [WARNING] Error: {e}")
                time.sleep(0.1)

    # ── Console Watcher (CSV-based, reads log files for real-time display) ──

    def _start_watcher(self, sensor_type: str):
        """Start the CSV watcher thread for a sensor type. Stops any existing watcher first."""
        sensor = sensor_type.upper()
        if sensor == "EMG":
            path = self._pred_log_path
        elif sensor == "EOG":
            path = self._eog_log_path
        else:
            print(f"[cmds] No CSV log for sensor: {sensor}")
            return

        if not path.exists():
            print(f"[cmds] Log file not found: {path}")
            return

        # Stop any existing watcher and wait for its thread to exit
        old_sensor = self._watch_sensor
        self._watch_sensor = None
        time.sleep(0.1)  # let old thread notice and exit its while loop

        self._watch_sensor = sensor
        t = threading.Thread(target=self._csv_watch_loop, args=(path, sensor), daemon=True)
        t.start()
        print(f"\n[cmds] Watching {sensor} — reading {path.name}  (type 'watch off' to stop)")

    def _csv_watch_loop(self, path, sensor):
        """Background thread: tail the CSV file and ANSI-refresh the display in-place."""
        last_pos = path.stat().st_size  # start from current end
        last_lines = []
        max_lines = 5
        prev_line_count = 0  # track how many lines we printed last time for ANSI cursor-up

        while self._watch_active and self._watch_sensor == sensor:
            try:
                current_size = path.stat().st_size
                new_lines_added = False
                if current_size > last_pos:
                    with open(path, 'r', encoding='utf-8') as f:
                        f.seek(last_pos)
                        new_data = f.read(current_size - last_pos)
                        last_pos = current_size
                        for line in new_data.strip().split('\n'):
                            line = line.strip()
                            if line and not line.startswith('iso_time'):
                                parts = line.split(',')
                                if len(parts) >= 3:
                                    ts = parts[0].split('T')[1][:12] if 'T' in parts[0] else parts[0][:12]
                                    label = parts[2]
                                    conf = parts[3] if len(parts) > 3 else ''
                                    extra = ' | '.join(parts[4:7]) if len(parts) > 6 else ' | '.join(parts[4:])
                                    last_lines.append(f"  {ts}  {label:<12}  conf={conf}  {extra}")
                                    if len(last_lines) > max_lines:
                                        last_lines = last_lines[-max_lines:]
                                    new_lines_added = True

                if new_lines_added or last_lines:
                    prev_line_count = self._render_watch(sensor, last_lines, prev_line_count)
                time.sleep(0.3)
            except Exception:
                time.sleep(0.5)

        # Watcher stopped — clean up
        if prev_line_count > 0:
            sys.stdout.write(f"\n[cmds] Watcher for {sensor} stopped.\n")
            sys.stdout.flush()

    def _render_watch(self, sensor, lines, prev_count):
        """ANSI-refresh: move cursor up over previous block, reprint. Returns new line count."""
        with self._watch_lock:
            # Move cursor up over previous render block
            if prev_count > 0:
                sys.stdout.write(f"\033[{prev_count}F")  # F = move to beginning of previous line
            # Render current block
            out = [f"\r\033[K═══ {sensor} Detections (last {len(lines)}) ═══"]
            for l in lines:
                out.append(f"\r\033[K{l}")
            out.append(f"\r\033[K{'─' * 50}")
            sys.stdout.write("\n".join(out) + "\n")
            sys.stdout.flush()
            return len(out)

    def _console_cmd_loop(self):
        """Background thread: read stdin for runtime commands."""
        import select
        print("[cmds] Ready for commands...")
        while self._watch_active:
            try:
                if select.select([sys.stdin], [], [], 0.5)[0]:
                    cmd = sys.stdin.readline().strip().lower()
                    if not cmd:
                        continue

                    # Support both "watch eog" and bare "eog"
                    if cmd.startswith("watch "):
                        target = cmd.split()[1]
                    elif cmd in ("emg", "eog", "eeg", "ecg"):
                        target = cmd
                    else:
                        target = None

                    if target:
                        if target == "off":
                            self._watch_sensor = None
                            print("\n[cmds] Watching stopped.")
                        elif target in ("emg", "eog"):
                            self._start_watcher(target)
                        elif target in ("eeg", "ecg"):
                            print(f"\n[cmds] No CSV log yet for {target.upper()} — use EMG or EOG")
                        else:
                            print(f"\n[cmds] Unknown: {target}")

                    elif cmd.startswith("sensor "):
                        parts = cmd.split()
                        if len(parts) >= 3:
                            stype = parts[1].upper()
                            action = parts[2]
                            if stype in ("EMG", "EOG", "EEG", "ECG") and action in ("on", "off"):
                                is_on = (action == "on")
                                try:
                                    state = config_manager.get_detection_state()
                                    state[stype] = is_on
                                    # Write to detection_state.json via stdout-parseable format for pipeline.py
                                    state_path = PROJECT_ROOT.parent / "data" / "config" / "detection_state.json"
                                    import json
                                    state_path.parent.mkdir(parents=True, exist_ok=True)
                                    with open(state_path, 'w') as f:
                                        json.dump(state, f)
                                    self.detection_active = state
                                    print(f"\n[cmds] {stype} → {'ON' if is_on else 'OFF'}")
                                except Exception as e:
                                    print(f"\n[cmds] Error: {e}")

                    elif cmd == "stats":
                        state = config_manager.get_detection_state()
                        print(f"\n[cmds] Detection state: {state}")

                    elif cmd in ("q", "quit", "exit", "help"):
                        print("\n[cmds]  watch <emg|eog>  |  watch off  |  sensor <EMG|EOG> on|off  |  stats")

                    elif cmd:
                        print(f"\n[cmds] Unknown: {cmd}  (try 'help')")

            except Exception:
                pass

    # ── Event Emission ──────────────────────────────────────────────────

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
            # Dedup confirmed gesture events (prevents double-emits from multi-channel)
            if event_name in ("Rock", "Paper", "Scissors") and event_name == last_event:
                if current_time - last_ts < 0.3:
                    return
        elif sensor_type == "EOG":
            pass
        elif sensor_type == "ECG":
            # Always emit ecg_prediction (continuous BPM stream) and Heartbeat
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
        if event_name not in ("emg_prediction", "ecg_prediction", "Rest"):
            _log_detection_event(event_name, ch_idx, sensor_type)
        self.outlet.push_sample([formatted_event])

if __name__ == "__main__":
    router = FeatureRouter()
    if router.resolve_stream():
        router.run()


