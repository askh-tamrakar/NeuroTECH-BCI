import sys
import time
import socket
import json
import argparse
from pylsl import StreamInlet, resolve_byprop

class ServoController:
    def __init__(self, target_ip="127.0.0.1", target_port=6002):
        self.target_ip = target_ip
        self.target_port = target_port
        self.current_angle = 90
        self.sock = None
        self.inlet = None
        
        # Angle range for the claw
        self.MIN_ANGLE = 90
        self.MAX_ANGLE = 180

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
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(5)
            # Add a small delay to ensure StreamManager is listening
            time.sleep(2)
            self.sock.connect((self.target_ip, self.target_port))
            print("Connected to StreamManager Relay via TCP.")
            return True
        except Exception as e:
            print(f"TCP Connection Error: {e}")
            return False

    def send_degree(self, angle):
        if not self.sock:
            return
        
        try:
            command = f"DEG {angle}\n"
            self.sock.sendall(command.encode())
            print(f"Sent: {command.strip()}")
        except Exception as e:
            print(f"Send Error: {e}")
            self.sock = None # Trigger reconnect logic if needed

    def run(self):
        if not self.connect_lsl() or not self.connect_tcp():
            return

        print("\n=== Servo Controller Running ===")
        print(f"Initial Angle: {self.current_angle}")
        print("Controls:")
        print("  - SingleBlink: +5 deg")
        print("  - DoubleBlink: -5 deg")
        print("  - Rock (EMG): Snap to 90 (Closed)")
        print("  - Paper (EMG): Snap to 180 (Open)")
        print("  - Scissors (EMG): Snap to 135 (Middle)")
        print("===============================\n")

        try:
            while True:
                sample, timestamp = self.inlet.pull_sample(timeout=0.1)
                if sample:
                    try:
                        event_data = json.loads(sample[0])
                        event_name = event_data.get("event")
                        
                        if not event_name:
                            continue

                        # Logic Mapping
                        new_angle = self.current_angle
                        
                        if event_name == "SingleBlink":
                            new_angle = min(self.MAX_ANGLE, self.current_angle + 5)
                            print(f"Event: {event_name} -> Incrementing")
                        
                        elif event_name == "DoubleBlink":
                            new_angle = max(self.MIN_ANGLE, self.current_angle - 5)
                            print(f"Event: {event_name} -> Decrementing")
                        
                        elif event_name == "Rock":
                            new_angle = self.MIN_ANGLE
                            print(f"Event: {event_name} -> Snap CLOSED")
                        
                        elif event_name == "Paper":
                            new_angle = self.MAX_ANGLE
                            print(f"Event: {event_name} -> Snap OPEN")
                        
                        elif event_name == "Scissors":
                            new_angle = 135
                            print(f"Event: {event_name} -> Snap MIDDLE")

                        # Only send if changed
                        if new_angle != self.current_angle:
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
