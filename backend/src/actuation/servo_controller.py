import sys
import time
import socket
import json
import argparse
from typing import Optional
from pylsl import StreamInlet, resolve_byprop

# UTF-8 stdout so Unicode symbols don't cause UnicodeEncodeError in subprocesses
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

from src.utils.config import config_manager


# ─── Servo Move Logger ───────────────────────────────────────────────────────
def _log_servo_move(event_name: str, prev: int, new: int, min_a: int, max_a: int):
    """Pretty-print a servo position change (passes pipeline.py ALLOWLIST via [ok] tag)."""
    delta = abs(new - prev)
    direction = "+" if new > prev else "-"
    rng = max(max_a - min_a, 1)
    pct = round((new - min_a) / rng * 100)
    if new >= max_a:
        state = "CLOSED"
    elif new <= min_a:
        state = "OPEN"
    else:
        state = f"{pct:>3}% closed"
    print(f"[ok] ◉ Servo │ {event_name:<14} {prev:>3}° → {new:>3}°  {direction}{delta:>2}°  [{state}]", flush=True)


class ServoController:
    def __init__(self, target_ip="127.0.0.1", target_port=6002):
        self.target_ip = target_ip
        self.target_port = target_port
        self.current_angle = 97
        self.sock: Optional[socket.socket] = None
        self.inlet: Optional[StreamInlet] = None
        self.last_config_vhash = None
        self.config = {}
        
        # Angle range for the claw
        self.MIN_ANGLE = 1     # Fully Open
        self.MIDDLE_ANGLE = 48 # Approximate middle
        self.MAX_ANGLE = 97    # Fully Closed
        
        self.last_blink_time = 0

    def _reload_config_if_needed(self):
        vhash = config_manager.get_config_version_hash()
        if vhash != self.last_config_vhash:
            self.config = config_manager.get_all_configs()
            self.last_config_vhash = vhash

    def _get_eeg_target_angle(self, event_name: str):
        try:
            freq = float(event_name.replace("TARGET_", "").replace("HZ", "").replace("_", "."))
        except Exception:
            return None

        self._reload_config_if_needed()
        eeg_targets = self.config.get("features", {}).get("EEG", {}).get("targets", [])
        if not eeg_targets:
            return None

        ordered_targets = [
            target for target in eeg_targets
            if target.get("enabled", True)
        ]
        ordered_targets.sort(key=lambda target: int(target.get("id", 0)))

        for index, target in enumerate(ordered_targets):
            if abs(float(target.get("freq", 0)) - freq) < 0.1:
                preset_angles = [97, 82, 66, 48, 24, 1]
                return preset_angles[min(index, len(preset_angles) - 1)]
        return None

    def connect_lsl(self):
        print("Looking for BioSignals-Events LSL stream...")
        streams = resolve_byprop('name', 'BioSignals-Events', timeout=10)
        if not streams:
            print("Error: Could not find BioSignals-Events stream.")
            return False
        
        self.inlet = StreamInlet(streams[0])
        print("Connected to LSL stream.")
        return True

    def connect_tcp(self):
        try:
            print(f"Connecting to StreamManager Relay at {self.target_ip}:{self.target_port}...")
            # Close old socket if it exists
            if self.sock:
                try: self.sock.close()
                except: pass
            
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(5)
            # Retry loop with exponential backoff instead of arbitrary sleep
            max_retries = 10
            for attempt in range(max_retries):
                try:
                    self.sock.connect((self.target_ip, self.target_port))
                    break
                except (ConnectionRefusedError, OSError) as e:
                    if attempt < max_retries - 1:
                        wait = min(0.5 * (2 ** attempt), 5.0)
                        print(f"  Retry {attempt+1}/{max_retries} in {wait:.1f}s...")
                        time.sleep(wait)
                    else:
                        raise e
            print("Connected to StreamManager Relay via TCP.")
            return True
        except Exception as e:
            print(f"TCP Connection Error: {e}")
            self.sock = None
            return False

    def send_degree(self, angle):
        if not self.sock:
            # Try to reconnect
            if not self.connect_tcp():
                return
        
        try:
            command = f"DEG {angle}\n"
            self.sock.sendall(command.encode())
        except Exception as e:
            print(f"Send Error: {e}")
            self.sock = None # Trigger reconnect logic on next call

    def run(self):
        if not self.connect_lsl() or not self.connect_tcp():
            return

        print(f"[ok] ◉ Servo │ Connected  LSL=BioSignals-Events  TCP={self.target_ip}:{self.target_port}")
        print(f"[ok] ◉ Servo │ Initial angle {self.current_angle}°  range [{self.MIN_ANGLE}–{self.MAX_ANGLE}]")

        try:
            while True:
                self._reload_config_if_needed()
                try:
                    sample, timestamp = self.inlet.pull_sample(timeout=0.1)
                except Exception:
                    print("[ServoController] LSL inlet error — attempting reconnect...")
                    if not self.connect_lsl():
                        time.sleep(2.0)
                    continue
                if sample:
                    try:
                        event_data = json.loads(sample[0])
                        event_name = event_data.get("event")
                        
                        if not event_name:
                            continue

                        # Logic Mapping
                        
                        servo_enabled = self.config.get("features", {}).get("Servo", {}).get("enabled", False)
                        if not servo_enabled:
                            continue

                        if event_name in ["SingleBlink", "DoubleBlink"]:
                            current_time = time.time()
                            if current_time - self.last_blink_time < 1.0:
                                continue # Throttle events
                            self.last_blink_time = current_time

                        new_angle = self.current_angle
                        prev_angle = self.current_angle

                        if event_name == "SingleBlink":
                            new_angle = min(self.MAX_ANGLE, self.current_angle + 5)

                        elif event_name == "DoubleBlink":
                            new_angle = max(self.MIN_ANGLE, self.current_angle - 5)

                        elif event_name == "Rock":
                            new_angle = self.MAX_ANGLE

                        elif event_name == "Paper":
                            new_angle = self.MIN_ANGLE

                        elif event_name == "Scissors":
                            new_angle = self.MIDDLE_ANGLE

                        elif event_name.startswith("TARGET_"):
                            mapped_angle = self._get_eeg_target_angle(event_name)
                            if mapped_angle is not None:
                                new_angle = mapped_angle

                        # Only send if changed
                        if new_angle != self.current_angle:
                            _log_servo_move(event_name, prev_angle, new_angle, self.MIN_ANGLE, self.MAX_ANGLE)
                            self.current_angle = new_angle
                            self.send_degree(self.current_angle)

                    except json.JSONDecodeError:
                        print(f"Error decoding LSL sample: {sample}")
                    except Exception as e:
                        print(f"Error processing event: {e}")
        
        except KeyboardInterrupt:
            print("\nShutting down...")
        finally:
            if self.sock:
                self.sock.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Servo Controller - Bridges LSL events to Servo DEG commands.")
    parser.add_argument("--ip", type=str, default="127.0.0.1", help="IP of the StreamManager relay (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=6002, help="Relay port (default: 6002)")
    
    args = parser.parse_args()
    
    controller = ServoController(args.ip, args.port)
    controller.run()
