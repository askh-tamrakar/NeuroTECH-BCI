"""

Usage:
    python -m src.processing.filter_router_modified

"""

from pathlib import Path
import time
import json
import threading
import hashlib
import sys
import os
import socket
import struct

from typing import List, Tuple, Dict, Optional
from ..utils.logging_cfg import get_logger
log = get_logger(__name__)

# UTF-8 encoding for standard output to avoid UnicodeEncodeError in some terminals
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

try:
    import numpy as np
except Exception as e:
    raise RuntimeError("numpy is required") from e

try:
    import pylsl
    LSL_AVAILABLE = True
except Exception:
    pylsl = None
    LSL_AVAILABLE = False

# Import passive processors
try:
    from .emg_processor import EMGFilterProcessor
    from .eog_processor import EOGFilterProcessor
    from .eeg_processor import EEGFilterProcessor
except ImportError:
    print("[Router] Running from different context, using local imports")
    import sys
    sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
    from src.processing.emg_processor import EMGFilterProcessor
    from src.processing.eog_processor import EOGFilterProcessor
    from src.processing.eeg_processor import EEGFilterProcessor

from src.utils.paths import get_config_dir

CONFIG_DIR = get_config_dir()
CONFIG_PATH = CONFIG_DIR / "sensor_config.json"
FILTER_CONFIG_PATH = CONFIG_DIR / "filter_config.json"
RAW_STREAM_NAME = "BioSignals-Raw-uV"
PROCESSED_STREAM_NAME = "BioSignals-Processed"
RELOAD_INTERVAL = 2.0
DEFAULT_SR = 1000


def load_config() -> dict:
    """Load config from sensor_config.json and filter_config.json with safe fallback defaults."""
    defaults = {
        "sampling_rate": DEFAULT_SR,
        "channel_mapping": {
            "ch0": {"sensor": "EMG", "enabled": True},
            "ch1": {"sensor": "EOG", "enabled": True}
        },
        "filters": {
            "EMG": {"cutoff": 70.0, "order": 4, "notch_enabled": False, "notch_freq": 50, "bandpass_enabled": False, "bandpass_low": 20, "bandpass_high": 250, "envelope_enabled": True, "envelope_cutoff": 10.0, "envelope_order": 4},
            "EOG": {"bandpass_enabled": True, "bandpass_low": 0.5, "bandpass_high": 35.0, "bandpass_order": 4, "notch_enabled": False, "notch_freq": 50.0},
            "EEG": {
                "filters": [
                    {"type": "notch", "freq": 50.0, "Q": 30},
                    {"type": "bandpass", "low": 0.5, "high": 45.0, "order": 4}
                ]
            }
        }
    }
    
    cfg = defaults.copy()

    # 1. Load Sensor Config
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r") as f:
                sensor_cfg = json.load(f)
            
            if "sampling_rate" in sensor_cfg:
                cfg["sampling_rate"] = sensor_cfg["sampling_rate"]
            if "channel_mapping" in sensor_cfg:
                cfg["channel_mapping"] = sensor_cfg["channel_mapping"]
        except Exception as e:
            log.error(f"[Router] Failed to load sensor config ({CONFIG_PATH}): {e} — using defaults")

    # 2. Load Filter Config
    if FILTER_CONFIG_PATH.exists():
        try:
            with open(FILTER_CONFIG_PATH, "r") as f:
                filter_cfg = json.load(f)
            
            if "filters" in filter_cfg:
                cfg["filters"] = filter_cfg["filters"]
        except Exception as e:
            log.error(f"[Router] Failed to load filter config ({FILTER_CONFIG_PATH}): {e} — using defaults")
    else:
        log.warn(f"Filter config not found ({FILTER_CONFIG_PATH}) — using defaults")

    return cfg


def get_config_hash(cfg: dict) -> str:
    """Create hash of config to detect changes."""
    try:
        return hashlib.md5(json.dumps(cfg, sort_keys=True).encode()).hexdigest()
    except:
        return ""


def parse_channel_map(info: pylsl.StreamInfo) -> List[Tuple[int, str, str]]:
    """Parse channel metadata from LSL StreamInfo."""
    idx_map = []
    try:
        ch_count = int(info.channel_count())
        desc = info.desc()
        channels = desc.child("channels")
        
        if not channels.empty():
            ch = channels.first_child()
            i = 0
            while not ch.empty() and i < ch_count:
                label = f"ch{i}"
                type_str = ""
                try:
                    lab = ch.child_value("label")
                    typ = ch.child_value("type")
                    if lab:
                        label = lab
                    if typ:
                        type_str = typ
                except:
                    pass
                idx_map.append((i, label, type_str))
                ch = ch.next_sibling()
                i += 1
        
        if idx_map:
            return idx_map
    except Exception as e:
        log.warn(f"[Router] ⚠️ XML parsing warning: {e}")
    
    # Fallback
    try:
        ch_count = int(info.channel_count())
        return [(i, f"ch{i}", f"ch{i}") for i in range(ch_count)]
    except:
        return []


class FilterRouter:
    """Main filter router class - processes multi-channel biomedical signals."""
    
    def __init__(self):
        self.config = load_config()
        self.sr = int(self.config.get("sampling_rate", DEFAULT_SR))
        self.inlet = None
        self.inlet = None
        # self.outlet = None  # Replaced by stream_socket
        self.stream_socket = None
        self.stream_connected = False

        self.raw_index_map: List[Tuple[int, str, str]] = []
        self.channel_processors: Dict[int, object] = {}
        self.channel_mapping: Dict[int, Dict] = {}
        self.num_channels = 0
        self.running = False
        self._config_lock = threading.RLock()
        # self._start_config_watcher() <-- Moved to run() to avoid startup race conditions
    
    def _start_config_watcher(self):
        """Start background thread to monitor config changes."""
        t = threading.Thread(target=self._config_watcher, daemon=True)
        t.start()
    
    def _config_watcher(self):
        """Background thread: Monitor config file for changes."""
        # Initialize with current hashes to avoid immediate re-configuration on startup
        current_cfg = load_config()
        last_cfg_hash = get_config_hash(current_cfg.get("filters", {}))
        last_map_hash = get_config_hash(current_cfg.get("channel_mapping", {}))
        
        while True:
            try:
                new_cfg = load_config()
                cfg_hash = get_config_hash(new_cfg.get("filters", {}))
                map_hash = get_config_hash(new_cfg.get("channel_mapping", {}))
                
                with self._config_lock:
                    self.config = new_cfg
                    self.sr = int(self.config.get("sampling_rate", self.sr))
                    
                    # 1. Channel mapping changed? Reconfigure pipeline
                    if map_hash != last_map_hash:
                        log.info("Channel mapping changed - reconfiguring pipeline...")
                        self._configure_pipeline()
                        last_map_hash = map_hash
                        last_cfg_hash = cfg_hash
                    
                    # 2. Only filter params changed? Update processors
                    elif cfg_hash != last_cfg_hash:
                        log.info("Filter parameters updated - updating processors...")
                        for p in self.channel_processors.values():
                            if p and hasattr(p, 'update_config'):
                                p.update_config(self.config, self.sr)
                        last_cfg_hash = cfg_hash
                
                time.sleep(RELOAD_INTERVAL)
            
            except Exception as e:
                log.error(f"[Router] ⚠️ Config watcher error: {e}")
                time.sleep(RELOAD_INTERVAL)
    
    def resolve_raw_stream(self, timeout: float = 10.0) -> bool:
        """Resolve and connect to raw LSL stream with retry loop (10s timeout)."""
        if not LSL_AVAILABLE:
            log.error("[Router] ❌ pylsl not installed.")
            return False
            
        start_time = time.time()
        while (time.time() - start_time) < timeout:
            try:
                log.debug(f"Searching for raw LSL stream (Timeout remaining: {timeout - (time.time() - start_time):.1f}s)...")
                streams = pylsl.resolve_streams(wait_time=0.5)
                target = None
                
                # 1. Exact name match
                for s in streams:
                    if s.name() == RAW_STREAM_NAME:
                        target = s
                        break
                
                # 2. Heuristic match (contains "raw" or "uv")
                if not target:
                    for s in streams:
                        if "raw" in s.name().lower() or "uv" in s.name().lower():
                            target = s
                            break
                
                if target:
                    self.inlet = pylsl.StreamInlet(target, max_buflen=1, recover=True)
                    self.raw_index_map = parse_channel_map(self.inlet.info())
                    log.info(f"Connected to raw stream: {target.name()}")
                    log.debug(f"[Router]    Channels: {len(self.raw_index_map)} @ {target.nominal_srate()} Hz")
                    self._configure_pipeline()
                    return True
                
                time.sleep(0.5)
            except Exception as e:
                log.warning(f"Resolution retry error: {e}")
                time.sleep(0.5)

        log.error(f"Could not find raw stream '{RAW_STREAM_NAME}' within {timeout}s.")
        return False
    
    def _configure_pipeline(self):
        """
        Configure processing pipeline based on current config.
        """
        try:
            with self._config_lock:
                # Preserve old processors to avoid destroying filter states (zi) on mapping changes
                old_processors = self.channel_processors
                self.channel_processors = {}
                self.channel_mapping = {}
                
                # ========== IMPROVED: Keep socket alive if already connected ==========
                if not self.stream_socket or not self.stream_connected:
                    max_retries = 5
                    for attempt in range(max_retries):
                        try:
                            self.stream_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                            self.stream_socket.connect(('127.0.0.1', 6001))
                            self.stream_connected = True
                            log.info(f"Connected to Stream Manager (Processed)")
                            break
                        except Exception as e:
                            log.debug(f"[Router] ⚠️ Could not connect to Stream Manager (Attempt {attempt+1}/{max_retries}): {e}")
                            time.sleep(1.0)
                        
                if not self.stream_connected:
                     log.error("Failed to connect to Stream Manager. Data will be dropped.")
                
                mapping_cfg = self.config.get("channel_mapping", {})
                num_channels = len(self.raw_index_map)
                
                if num_channels == 0:
                    log.warning("No channels found in raw stream!")
                    return
                
                self.num_channels = num_channels
                print(f"[TRACE] Configuring loop for {num_channels} channels...", flush=True)
                log.debug(f"[Router] 📍 Configuring pipeline for {num_channels} channels...")
                
                for i in range(num_channels):
                    try:
                        ch_key = f"ch{i}"
                        if ch_key in mapping_cfg:
                            cinfo = mapping_cfg[ch_key]
                            enabled = cinfo.get("enabled", True)
                            sensor_type = str(cinfo.get("sensor", "UNKNOWN")).upper()
                            
                            self.channel_mapping[i] = {
                                "sensor": sensor_type,
                                "enabled": enabled,
                                "label": f"{sensor_type}_{i}",
                                "processor": sensor_type
                            }
                            
                            if not enabled:
                                self.channel_processors[i] = None
                                print(f"[Router] [{i}] → (DISABLED) | Key: {ch_key}")
                                continue

                            existing_proc = old_processors.get(i)
                            if existing_proc and existing_proc.__class__.__name__.startswith(sensor_type):
                                self.channel_processors[i] = existing_proc
                                if hasattr(existing_proc, 'update_config'):
                                    existing_proc.update_config(self.config, self.sr)
                                print(f"[Router] [{i}] → {sensor_type} (REUSED Processor) | Key: {ch_key}")
                            else:
                                if sensor_type == "EMG":
                                    self.channel_processors[i] = EMGFilterProcessor(self.config, self.sr, channel_key=ch_key)
                                    print(f"[Router] [{i}] → EMG (EMG Processor)")
                                elif sensor_type == "EOG":
                                    self.channel_processors[i] = EOGFilterProcessor(self.config, self.sr, channel_key=ch_key)
                                    print(f"[Router] [{i}] → EOG (EOG Processor)")
                                elif sensor_type == "EEG":
                                    self.channel_processors[i] = EEGFilterProcessor(self.config, self.sr, channel_key=ch_key)
                                    print(f"[Router] [{i}] → EEG (EEG Processor)")
                                else:
                                    self.channel_processors[i] = None
                                    print(f"[Router] [{i}] → {sensor_type} (Pass-through)")
                        else:
                            print(f"[Router] [{i}] → UNMAPPED (Pass-through)")
                            self.channel_mapping[i] = {"sensor": "UNMAPPED", "enabled": True, "label": f"RAW_{i}", "processor": None}
                            self.channel_processors[i] = None
                    except Exception as e:
                        print(f"[Router] ❌ [ERROR] Failed to configure channel {i} ({ch_key}): {e}")
                        self.channel_processors[i] = None
                
                if LSL_AVAILABLE and num_channels > 0:
                    try:
                        # Signalling success to orchestrator with unbuffered print
                        log.info(f"Pipeline configured successfully (Routing to Stream Manager)")
                        print("Pipeline configured successfully", flush=True)
                    except Exception as e:
                        print(f"[Router] [ERROR] Error in final config: {e}")
        except Exception as big_e:
            import traceback
            tb = traceback.format_exc()
            log.error(f"[Router] ❌ CRASH in _configure_pipeline: {big_e}\n{tb}")
            print(f"[ERROR] CRASH in _configure_pipeline: {big_e}")

    
    def run(self):
        """Main processing loop."""
        if not self.inlet:
            print("[Router] [ERROR] Error: Inlet not ready!")
            return
            
        if not self.stream_connected:
             print("[Router] [WARNING] Not connected to Stream Manager - data will not be published")

        # Start background config monitor only after main thread has reached a stable state
        self._start_config_watcher()
        
        self.running = True
        log.info("Starting processing loop...")
        
        sample_count = 0
        error_count = 0
        
        try:
            while self.running:
                # Pull raw sample
                raw_sample, ts = self.inlet.pull_sample(timeout=1.0)
                
                if raw_sample is not None and len(raw_sample) == self.num_channels:
                    try:
                        with self._config_lock:
                            # Process each channel through its processor
                            processed_sample = []
                            
                            for ch_idx in range(self.num_channels):
                                raw_val = raw_sample[ch_idx]
                                processor = self.channel_processors.get(ch_idx)
                                
                                if processor:
                                    # ✅ Channel has processor - apply it
                                    filtered_val = processor.process_sample(raw_val)
                                else:
                                    # ✅ Channel disabled or unmapped - pass through
                                    # print(f"[Router] [WARNING] Channel {ch_idx} disabled or unmapped - passing through")
                                    filtered_val = raw_val
                                
                                processed_sample.append(filtered_val)
                            
                            # ✅ Push ALL channels to Stream Manager
                            if self.stream_connected and self.stream_socket:
                                try:
                                    # Protocol: [0xAA] [Count] [Floats...]
                                    count = len(processed_sample)
                                    header = struct.pack('<BB', 0xAA, count)
                                    payload = struct.pack(f'<{count}f', *processed_sample)
                                    self.stream_socket.sendall(header + payload)
                                except Exception as e:
                                    print(f"[Router] Stream push error: {e}")
                                    self.stream_connected = False

                            sample_count += 1
                            
                            # Log progress every 5 seconds based on the active sampling rate.
                            if sample_count % max(self.sr * 5, 1) == 0:
                                log.debug(f"[Router] ✅ {sample_count} samples processed")
                    
                    except Exception as e:
                        error_count += 1
                        # Always log errors as requested
                        print(f"[Router] [WARNING] Error processing sample: {e}")
        
        except KeyboardInterrupt:
            print("\n[Router] [STOP] Stopping...")
        
        finally:
            self.running = False
            print(f"[Router] 📊 Total samples processed: {sample_count}")
            
            if self.inlet:
                try:
                    self.inlet.close_stream()
                except:
                    pass
            
            if self.stream_socket:
                try:
                    self.stream_socket.close()
                    self.stream_socket = None
                except:
                    pass

            
            print("[Router] [OK] Cleanup complete")
    
    def stop(self):
        """Stop the processing loop."""
        self.running = False


def main():
    """Main entry point."""
    print("=" * 60)
    print("  🧬 BioSignals Filter Router")
    print("  Processing multi-channel biosignals with independent filtering")
    print("=" * 60)
    print()
    
    router = FilterRouter()
    
    if router.resolve_raw_stream(timeout=3.0):
        print("[Router] ✅ Raw stream resolved, starting processor...\n")
        router.run()
    else:
        print("[Router] ❌ Could not resolve raw stream")
        print("[Router] Make sure acquisition_app is running first")

if __name__ == "__main__":
    main()
