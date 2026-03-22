import sys
import os
import time
import json
import threading
from pathlib import Path
from pynput.keyboard import Controller as KeyboardController, Key
from pynput.mouse import Button, Controller as MouseController
try:
    import pylsl
    LSL_AVAILABLE = True
except ImportError:
    LSL_AVAILABLE = False

# Ensure we can import from src
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.utils.config import config_manager
from src.utils.logging_cfg import get_logger

log = get_logger("HIDController")

class HIDController:
    def __init__(self):
        self.keyboard = KeyboardController()
        self.mouse = MouseController()
        self.inlet = None
        self.running = False
        self.last_config_vhash = ""
        self.config = {}
        
        # Mapping helpers
        self.special_keys = {
            "Space": Key.space,
            "Enter": Key.enter,
            "Escape": Key.esc,
            "ArrowUp": Key.up,
            "ArrowDown": Key.down,
            "ArrowLeft": Key.left,
            "ArrowRight": Key.right,
            "W": "w", "A": "a", "S": "s", "D": "d"
        }

    def resolve_stream(self):
        if not LSL_AVAILABLE:
            log.error("pylsl not installed")
            return False

        log.info("Searching for BioSignals-Events stream...")
        streams = pylsl.resolve_byprop('name', 'BioSignals-Events', timeout=2.0)
        if not streams:
            return False
            
        self.inlet = pylsl.StreamInlet(streams[0])
        log.info("Connected to Event Stream")
        return True

    def _get_mapped_action(self, event_name):
        # EEG features
        eeg_features = self.config.get("features", {}).get("EEG", {})
        targets = eeg_features.get("targets", [])
        
        if not targets:
            log.warning(f"No targets found in EEG config for event {event_name}")
            return None, None
            
        # Parse Hz from event
        try:
            event_hz_str = event_name.replace("TARGET_", "").replace("HZ", "").replace("_", ".")
            event_hz = float(event_hz_str)
            log.debug(f"Parsing {event_name} -> {event_hz} Hz")
        except Exception as e:
            log.error(f"Failed to parse frequency from {event_name}: {e}")
            return None, None
            
        # Match target
        for t in targets:
            freq = t.get("freq", 0)
            if abs(float(freq) - float(event_hz)) < 0.1:
                # Passive detection: allow LSL event, but ignore HID action if disabled
                if not t.get("enabled", True):
                    log.info(f"Target {event_hz}Hz detected but is DISABLED. Ignoring hardware action.")
                    return None, None
                
                mode = t.get("controlType", "Keyboard") # Default to Keyboard for compatibility
                if mode == "None":
                    log.warning(f"Target {event_hz}Hz set to 'None', ignoring.")
                    return None, None
                    
                log.info(f"Match found for {event_hz} Hz ({mode}): {t}")
                if mode == "Keyboard":
                    return "Keyboard", t.get("mappedKey")
                elif mode == "Mouse":
                    return "Mouse", t.get("mappedMouse")
                    
        log.warning(f"No matching target found for {event_hz} Hz in {len(targets)} targets")
        return None, None

    def execute_action(self, type, val):
        if not val or val == "None":
            return
            
        try:
            if type == "Keyboard":
                # Ensure single letters are passed as lowercase (e.g. 'P' -> 'p') for game compatibility
                if isinstance(val, str) and len(val) == 1 and val.isalpha():
                    val = val.lower()
                    
                key = self.special_keys.get(val, val)
                log.info(f"Keyboard Action: {val} -> mapped to {key}")
                self.keyboard.press(key)
                time.sleep(0.1) # Increased from 0.05 for better compatibility
                self.keyboard.release(key)
                
            elif type == "Mouse":
                log.info(f"Mouse Action: {val}")
                if val == "Left Click":
                    self.mouse.click(Button.left, 1)
                elif val == "Right Click":
                    self.mouse.click(Button.right, 1)
                elif val == "Double Click":
                    self.mouse.click(Button.left, 2)
        except Exception as e:
            log.error(f"Action Error: {e}")

    def run(self):
        self.running = True
        log.info("HID Controller Loop Starting...")
        
        while self.running:
            try:
                # 1. Update Config if changed
                vhash = config_manager.get_config_version_hash()
                if vhash != self.last_config_vhash:
                    self.config = config_manager.get_all_configs()
                    self.last_config_vhash = vhash
                    mode = self.config.get("features", {}).get("EEG", {}).get("controlMode", "None")
                    log.info(f"Config Reloaded. Mode: {mode}")

                # 2. Pull Event
                if not self.inlet:
                    if not self.resolve_stream():
                        time.sleep(1)
                        continue
                        
                sample, ts = self.inlet.pull_sample(timeout=0.2)
                if sample:
                    try:
                        data = json.loads(sample[0])
                        event_name = data.get("event")
                        print(f"Received Event: {event_name}")
                        if event_name and (event_name.startswith("TARGET_") or event_name == "DETECTION"):
                            type, val = self._get_mapped_action(event_name)
                            if type and val:
                                self.execute_action(type, val)
                            else:
                                log.warning(f"No mapping found for {event_name}")
                    except Exception as e:
                        print(f"Event Parse Error: {e}")
                        
            except Exception as e:
                log.error(f"Loop Error: {e}")
                time.sleep(1)

def main():
    try:
        controller = HIDController()
        controller.run()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
