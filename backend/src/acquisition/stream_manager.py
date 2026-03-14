import tkinter as tk
from tkinter import ttk, messagebox
import socket
import threading
import sys
import os
import time
import struct
import numpy as np

# Ensure we can import sibling packages
current_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.abspath(os.path.join(current_dir, '..', '..'))
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

from src.acquisition.lsl_streams import LSLStreamer, LSL_AVAILABLE
from src.utils.config import config_manager

class StreamManagerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("WiFi Stream Bridge (LSL)")
        self.root.geometry("500x400")
        
        # Configuration
        self.port = 6000
        self.is_running = False
        self.server_socket_raw = None
        self.server_socket_proc = None
        self.server_socket_events = None
        
        self.raw_clients = []
        self.client_socket = None
        self.packet_count = 0
        
        # LSL
        self.lsl_stream = None
        self.lsl_events = None
        self.lsl_processed = None
        
        self._setup_ui()
        
        # Initialize LSL
        if LSL_AVAILABLE:
            try:
                # Load Dynamic Mapping from Config
                mapping = config_manager.get_channel_mapping()
                self.channel_count = 2 # Hardware upgraded to 1KHz dual channel (A0 and A2)
                num_channels = self.channel_count
                
                channel_types = []
                channel_labels = []
                
                for i in range(num_channels):
                    ch_info = mapping.get(f"ch{i}", {})
                    sensor = ch_info.get("sensor", "EMG")
                    channel_types.append(sensor)
                    channel_labels.append(f"{sensor}_{i}")
                
                self.lsl_stream = LSLStreamer(
                    "BioSignals-Raw-uV",
                    channel_types=channel_types,
                    channel_labels=channel_labels,
                    channel_count=num_channels,
                    nominal_srate=1000
                )
                self.log(f"✅ LSL Stream 'BioSignals-Raw-uV' created ({', '.join(channel_labels)}).")

                # MAGIC STRING required by pipeline.py (Keep this!)
                print(f"Created stream 'BioSignals-Events'", flush=True)
                self.log("✅ LSL Stream 'BioSignals-Events' reported ready.")

                # Determine processed channels layout
                processed_types = []
                processed_labels = []
                for i in range(num_channels):
                    ch_info = mapping.get(f"ch{i}", {})
                    sensor = ch_info.get("sensor", "EMG")
                    if sensor == "EMG":
                        processed_types.extend(["EMG_RAW", "EMG_ENV"])
                        processed_labels.extend([f"EMG_RAW_{i}", f"EMG_ENV_{i}"])
                    else:
                        processed_types.append(sensor)
                        processed_labels.append(f"{sensor}_{i}_filt")
                
                # Initialize Processed Stream
                self.lsl_processed = LSLStreamer(
                    "BioSignals-Processed",
                    channel_types=processed_types,
                    channel_labels=processed_labels,
                    channel_count=len(processed_labels),
                    nominal_srate=1000
                )
                self.log(f"✅ LSL Stream 'BioSignals-Processed' created.")

            except Exception as e:
                self.log(f"❌ Error creating LSL stream: {e}")
        else:
            self.log("❌ LSL library not found (pylsl).")
        
        # Auto-Start Server for Pipeline Compatibility
        self.start_server()

    @staticmethod
    def get_local_ip():
        try:
            # Connect to an external server to get the interface IP (no data sent)
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def _setup_ui(self):
        # Header
        header = ttk.Label(self.root, text="WiFi -> LSL Bridge", font=("Helvetica", 16, "bold"))
        header.pack(pady=10)
        
        # Status Frame
        status_frame = ttk.LabelFrame(self.root, text="Status")
        status_frame.pack(fill="x", padx=10, pady=5)
        
        # IP Display
        local_ip = self.get_local_ip()
        ip_frame = ttk.Frame(status_frame)
        ip_frame.pack(fill="x", padx=5, pady=5)
        ttk.Label(ip_frame, text=f"Server IP: {local_ip}", font=("Helvetica", 10, "bold"), foreground="blue").pack(side="left", padx=10)
        ttk.Label(ip_frame, text=f"Port: {self.port}", font=("Helvetica", 10, "bold")).pack(side="left", padx=10)
        
        self.status_var = tk.StringVar(value="Stopped")
        self.status_label = ttk.Label(status_frame, textvariable=self.status_var, font=("Helvetica", 12))
        self.status_label.pack(pady=10)
        
        self.connection_var = tk.StringVar(value="No Client Connected")
        ttk.Label(status_frame, textvariable=self.connection_var).pack(pady=5)
        
        # Controls
        btn_frame = ttk.Frame(self.root)
        btn_frame.pack(pady=10)
        
        self.btn_start = ttk.Button(btn_frame, text="Start Server (Port 6000)", command=self.start_server, state="disabled")
        self.btn_start.pack(side="left", padx=5)
        
        self.btn_stop = ttk.Button(btn_frame, text="Stop Server", command=self.stop_server)
        self.btn_stop.pack(side="left", padx=5)
        
        # Log
        log_frame = ttk.LabelFrame(self.root, text="Log")
        log_frame.pack(fill="both", expand=True, padx=10, pady=5)
        
        self.log_text = tk.Text(log_frame, height=10, width=50, state="disabled")
        scrollbar = ttk.Scrollbar(log_frame, command=self.log_text.yview)
        self.log_text['yscrollcommand'] = scrollbar.set
        
        self.log_text.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Port config (Optional, hidden for simplicity or if needed)
        # ttk.Label(btn_frame, text="Port:").pack(side="left")
        # self.port_entry = ttk.Entry(btn_frame, width=6)
        # self.port_entry.insert(0, "6000")
        # self.port_entry.pack(side="left")

    def log(self, message):
        timestamp = time.strftime("%H:%M:%S")
        
        # Thread-safe UI update
        def _update_ui():
            self.log_text.config(state="normal")
            self.log_text.insert("end", f"[{timestamp}] {message}\n")
            self.log_text.see("end")
            self.log_text.config(state="disabled")
        
        self.root.after_idle(_update_ui)
        print(message, flush=True) # Mirror to stdout for system integration

    def start_server(self):
        if self.is_running:
            return
            
        if not self.lsl_stream:
            self.log("❌ Cannot start: LSL stream not initialized.")
            return

        self.is_running = True
        self.btn_start.config(state="disabled")
        self.btn_stop.config(state="normal")
        self.status_var.set(f"Listening on Ports 6000, 6001, 6002...")
        
        # Start Raw Server (6000)
        self.thread_raw = threading.Thread(target=self._server_loop, args=(6000, "Raw"), daemon=True)
        self.thread_raw.start()
        
        # Start Processed Server (6001) - Dummy/Placeholder for compatibility
        self.thread_proc = threading.Thread(target=self._server_loop, args=(6001, "Processed"), daemon=True)
        self.thread_proc.start()

        # Start Events Server (6002) - Dummy/Placeholder for compatibility
        self.thread_events = threading.Thread(target=self._server_loop, args=(6002, "Events"), daemon=True)
        self.thread_events.start()
        
    def stop_server(self):
        self.is_running = False
        # Close all sockets
        for s in [self.server_socket_raw, self.server_socket_proc, self.server_socket_events]:
            if s:
                try:
                    s.close()
                except:
                    pass
        self.server_socket_raw = None
        self.server_socket_proc = None
        self.server_socket_events = None

        self.status_var.set("Stopped")
        self.connection_var.set("No Client Connected")
        self.btn_start.config(state="normal")
        self.btn_stop.config(state="disabled")
        self.log("All servers stopped.")

    def _server_loop(self, port, name):
        server_socket = None
        try:
            server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server_socket.bind(('0.0.0.0', port))
            server_socket.listen(1)
            self.log(f"{name} Server started on 0.0.0.0:{port}")
            
            # Store socket reference based on port/name for closing later
            if name == "Raw": self.server_socket_raw = server_socket
            elif name == "Processed": self.server_socket_proc = server_socket
            elif name == "Events": self.server_socket_events = server_socket

            while self.is_running:
                try:
                    server_socket.settimeout(1.0) 
                    conn, addr = server_socket.accept()
                    
                    if name == "Raw":
                        self.log(f"Raw Client connected from {addr}")
                        # Spin off a thread for EACH client to avoid blocking
                        t = threading.Thread(target=self._handle_client, args=(conn, addr), daemon=True)
                        t.start()
                        self.raw_clients.append((conn, addr))
                        self.connection_var.set(f"Connected (Raw): {len(self.raw_clients)} clients")
                        
                    elif name == "Processed":
                        self.log(f"Processed Source connected from {addr}")
                        t = threading.Thread(target=self._handle_processed_client, args=(conn, addr), daemon=True)
                        t.start()
                        
                    elif name == "Events":
                        self.log(f"Events Source connected from {addr} (Relay Mode)")
                        t = threading.Thread(target=self._handle_relay_client, args=(conn, addr), daemon=True)
                        t.start()
                    
                except socket.timeout:
                    continue
                except OSError:
                    break
                    
        except Exception as e:
            self.log(f"{name} Server Error on {port}: {e}")
            
    def _handle_client(self, conn, addr):
        """
        Reads 1KHz packets:
        [Sync1(0xC7)][Sync2(0x7C)][Timestamp (4)][CH0..CHN_Vals (256 * N * 2)][End(0x01)]
        """
        buffer = b""
        req_len = 2 + 4 + (256 * self.channel_count * 2) + 1
        
        # For ADC -> uV
        vref = 3300.0
        adc_bits = 14
        half_vref = vref / 2.0
        scale = vref / (1 << adc_bits)
        
        try:
            while self.is_running:
                data = conn.recv(1024)
                if not data:
                    break
                buffer += data
                
                # Process buffer
                while len(buffer) >= req_len:
                    # Find Sync bytes
                    if buffer[0] != 0xC7 or buffer[1] != 0x7C:
                        # Scan forward for Sync1
                        found = False
                        for i in range(1, len(buffer) - 1):
                            if buffer[i] == 0xC7 and buffer[i+1] == 0x7C:
                                buffer = buffer[i:] # Discard garbage
                                found = True
                                break
                        if not found:
                            # Keep last byte just in case it's 0xC7
                            buffer = buffer[-1:] if buffer[-1] == 0xC7 else b""
                            break
                    
                    # Check length again after sync search
                    if len(buffer) < req_len:
                        break
                        
                    try:
                        end_byte = buffer[req_len - 1]
                        
                        if end_byte == 0x01:
                            # Valid Packet
                            import struct
                            unpacked = struct.unpack_from(f"<I{256 * self.channel_count}H", buffer, 2)
                            ts = unpacked[0]
                            samples_raw = unpacked[1:]
                            # Convert to uV
                            samples_uv = [(val * scale) - half_vref for val in samples_raw]
                            
                            # Push to LSL Processed Stream (List of Lists for push_chunk)
                            if self.channel_count == 1:
                                chunk_data = [[val] for val in samples_uv]
                            else:
                                chunk_data = [samples_uv[i:i + self.channel_count] for i in range(0, len(samples_uv), self.channel_count)]
                            self.lsl_stream.push_chunk(chunk_data)
                            
                            # Optional: Log occasionally?
                            if self.packet_count % 10 == 0:
                                self.log(f"P: {self.packet_count} (256 samples x {self.channel_count} CH) | {samples_uv[0]:.2f} uV") 
                            self.packet_count += 1
                            
                        # Consume packet
                        buffer = buffer[req_len:]
                        
                    except Exception as e:
                        self.log(f"Parse error: {e}")
                        buffer = buffer[1:] # Skip 1 byte and retry
                        
        except Exception as e:
            self.log(f"Client connection error ({addr}): {e}")
        finally:
            conn.close()
            # Remove from list
            self.raw_clients = [c for c in self.raw_clients if c[1] != addr]
            self.root.after_idle(lambda: self.connection_var.set(f"Connected (Raw): {len(self.raw_clients)} clients"))
            self.log(f"Raw Client disconnected: {addr}")

    def _handle_processed_client(self, conn, addr):
        """
        Handles data from Filter Router (Port 6001).
        Protocol: [0xAA (Sync)] [Count (1 Byte)] [Float 1...N]
        """
        try:
            while self.is_running:
                # 1. Read Header (2 bytes)
                header = conn.recv(2)
                if not header or len(header) < 2:
                    break
                
                sync, count = header[0], header[1]
                
                if sync != 0xAA:
                    # Sync lost - drain a bit
                    continue

                # 2. Read Payload (Count * 4 bytes)
                payload_size = count * 4
                data = b""
                while len(data) < payload_size:
                    chunk = conn.recv(payload_size - len(data))
                    if not chunk:
                        return
                    data += chunk
                
                # 3. Process
                fmt = f'<{count}f'
                samples = struct.unpack(fmt, data)
                
                # Push to LSL Processed Stream
                if self.lsl_processed:
                    self.lsl_processed.push_sample(samples)
                    
        except Exception as e:
            self.log(f"Processed Handler Error: {e}")
        finally:
            conn.close()
            self.log(f"Processed Source disconnected: {addr}")

    def _handle_relay_client(self, conn, addr):
        """
        Relays incoming data from Port 6002 to all Port 6000 clients (phones).
        This port is used by ServoController to send DEG commands.
        """
        buffer = b""
        try:
            while self.is_running:
                data = conn.recv(1024)
                if not data:
                    break
                
                buffer += data
                
                # If there's a newline, it's a command like "DEG 90\n"
                while b'\n' in buffer:
                    line_end = buffer.find(b'\n')
                    msg = buffer[:line_end].decode('ascii', errors='ignore').strip()
                    if msg:
                        self.log(f"Control: {msg}")
                    
                    # Relay the full command including newline to raw clients (ESP32/Arduino)
                    relay_data = buffer[:line_end+1]
                    if self.raw_clients:
                        for r_conn, r_addr in self.raw_clients:
                            try:
                                r_conn.sendall(relay_data)
                            except:
                                pass
                    
                    buffer = buffer[line_end+1:]

        except Exception as e:
            self.log(f"Relay Handler Error: {e}")
        finally:
            conn.close()
            self.log(f"Relay Source disconnected: {addr}")

def main():
    root = tk.Tk()
    app = StreamManagerApp(root)
    
    # Handle window close
    def on_closing():
        app.is_running = False
        app.stop_server()
        root.destroy()
        sys.exit(0)
        
    root.protocol("WM_DELETE_WINDOW", on_closing)
    root.mainloop()

if __name__ == "__main__":
    main()
