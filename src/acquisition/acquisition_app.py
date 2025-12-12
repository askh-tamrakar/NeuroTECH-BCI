# import tkinter as tk
# from tkinter import ttk, messagebox, filedialog
# import json
# import time
# import threading
# from pathlib import Path
# from datetime import datetime
# import numpy as np
# import sys
# import os
# import queue

# # Ensure we can import sibling packages
# current_dir = os.path.dirname(os.path.abspath(__file__))
# src_dir = os.path.abspath(os.path.join(current_dir, '..'))
# if src_dir not in sys.path:
#     sys.path.insert(0, src_dir)

# # Local imports
# from .serial_reader import SerialPacketReader
# from .packet_parser import PacketParser, Packet
# from .lsl_streams import LSLStreamer, LSL_AVAILABLE

# # matplotlib imports
# import matplotlib
# matplotlib.use('TkAgg')
# from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
# from matplotlib.figure import Figure

# # scipy for filtering
# try:
#     from scipy.signal import butter, sosfilt, sosfilt_zi
#     SCIPY_AVAILABLE = True
# except Exception:
#     SCIPY_AVAILABLE = False

# # UTF-8 encoding
# try:
#     sys.stdout.reconfigure(encoding='utf-8')
# except Exception:
#     pass

# def adc_to_uv(adc_value: int, adc_bits: int = 14, vref: float = 3300.0) -> float:
#     """Convert ADC to microvolts"""
#     return ((adc_value / (2 ** adc_bits)) * vref) - (vref / 2.0)

# class AcquisitionApp:
#     def __init__(self, root):
#         self.root = root
#         self.root.title("Acquisition App")
#         self.root.geometry("1600x950")
#         self.root.configure(bg='#f0f0f0')
        
#         # Load configuration
#         self.config = self._load_config()
        
#         # Paths
#         # Paths
#         # Resolve project root relative to this file: src/acquisition -> src -> root
#         project_root = Path(__file__).resolve().parent.parent.parent
#         self.save_path = project_root / "data" / "raw" / "session"
#         self.config_path = project_root / "config" / "sensor_config.json"
        
#         # Serial reader & parser
#         self.serial_reader = None
#         self.packet_parser = PacketParser()
        
#         # LSL streams
#         self.lsl_raw_uV = None
#         self.lsl_processed = None
        
#         # State
#         self.is_connected = False
#         self.is_acquiring = False
#         self.is_paused = False
#         self.is_recording = False
#         self.session_start_time = None
#         self.packet_count = 0
#         self.last_packet_counter = None
        
#         # Channel mapping
#         self.ch0_type = "EMG"
#         self.ch1_type = "EOG"
        
#         # Data buffers for real-time plotting
#         self.window_seconds = self.config.get("ui_settings", {}).get("window_seconds", 5.0)
#         self.buffer_size = int(self.config.get("sampling_rate", 512) * self.window_seconds)
        
#         # Ring buffers
#         self.ch0_buffer = np.zeros(self.buffer_size)
#         self.ch1_buffer = np.zeros(self.buffer_size)
#         self.buffer_ptr = 0
        
#         # Time axis
#         self.time_axis = np.linspace(0, self.window_seconds, self.buffer_size)
        
#         # Session data
#         self.session_data = []
#         self.latest_packet = {}
        
#         # Build UI
#         self._build_ui()
#         self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        
#         # Start main loop
#         self.main_loop()

#     def _load_config(self) -> dict:
#         """Load configuration from JSON file"""
#         # Resolve project root relative to this file: src/acquisition -> src -> root
#         project_root = Path(__file__).resolve().parent.parent.parent
#         config_path = project_root / "config" / "sensor_config.json"
#         if config_path.exists():
#             try:
#                 with open(config_path, 'r') as f:
#                     return json.load(f)
#             except Exception as e:
#                 print(f"[App] Error loading config: {e}")
#                 return self._default_config()
#         return self._default_config()

#     def _default_config(self) -> dict:
#         """Default configuration"""
#         return {
#             "sampling_rate": 512,
#             "channel_mapping": {
#                 "ch0": {"sensor": "EMG", "enabled": True, "label": "EMG Channel 0"},
#                 "ch1": {"sensor": "EOG", "enabled": True, "label": "EOG Channel 1"}
#             },
#             "filters": {
#                 "EMG": {"type": "high_pass", "cutoff": 70.0, "order": 4, "enabled": True},
#                 "EOG": {"type": "low_pass", "cutoff": 10.0, "order": 4, "enabled": True}
#             },
#             "adc_settings": {
#                 "bits": 14,
#                 "vref": 3300.0,
#                 "sync_byte_1": "0xC7",
#                 "sync_byte_2": "0x7C",
#                 "end_byte": "0x01"
#             },
#             "ui_settings": {
#                 "window_seconds": 5.0,
#                 "update_interval_ms": 30,
#                 "graph_height": 8,
#                 "y_axis_limits": [-2000, 2000]
#             }
#         }

#     def _save_config(self):
#         """Save configuration to JSON file"""
        
#         # UPDATE channel mapping from UI BEFORE saving
#         self.config["channel_mapping"] = {
#             "ch0": {"sensor": self.ch0_var.get(), "enabled": True},
#             "ch1": {"sensor": self.ch1_var.get(), "enabled": True}
#         }
        
#         # NOW save the updated config
#         self.config_path.parent.mkdir(parents=True, exist_ok=True)
#         try:
#             with open(self.config_path, 'w') as f:
#                 json.dump(self.config, f, indent=2)
#             print(f"[App] Config saved to {self.config_path}")
#         except Exception as e:
#             print(f"[App] Error saving config: {e}")
#             messagebox.showerror("Error", f"Failed to save config: {e}")

#     def _build_ui(self):
#         """Build the entire UI"""
#         main_frame = ttk.Frame(self.root)
#         main_frame.pack(fill="both", expand=True, padx=5, pady=5)
        
#         # LEFT PANEL - Scrollable
#         left_container = ttk.Frame(main_frame)
#         left_container.pack(side="left", fill="y", expand=False)
#         left_panel = self._make_scrollable_panel(left_container, width=350)
#         self._build_control_panel(left_panel)
        
#         # RIGHT PANEL - Graphs
#         right_panel = ttk.Frame(main_frame)
#         right_panel.pack(side="right", fill="both", expand=True, padx=5)
#         self._build_graph_panel(right_panel)

#     def _make_scrollable_panel(self, parent, width=320):
#         """Create a scrollable frame"""
#         canvas = tk.Canvas(parent, width=width, highlightthickness=0, bg='white')
#         scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
#         scrollable_frame = ttk.Frame(canvas)
        
#         scrollable_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
#         canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
#         canvas.configure(yscrollcommand=scrollbar.set)
        
#         def _on_mousewheel(event):
#             if event.num == 5 or event.delta < 0:
#                 canvas.yview_scroll(1, "units")
#             elif event.num == 4 or event.delta > 0:
#                 canvas.yview_scroll(-1, "units")
        
#         canvas.bind_all("<MouseWheel>", _on_mousewheel)
#         canvas.bind_all("<Button-4>", _on_mousewheel)
#         canvas.bind_all("<Button-5>", _on_mousewheel)
        
#         canvas.pack(side="left", fill="y", expand=False)
#         scrollbar.pack(side="right", fill="y")
#         return scrollable_frame

#     def _build_control_panel(self, parent):
#         """Build left control panel"""
#         # CONNECTION SECTION
#         conn_frame = ttk.LabelFrame(parent, text="🔌 Connection", padding=10)
#         conn_frame.pack(fill="x", pady=5)
        
#         ttk.Label(conn_frame, text="COM Port:").pack(anchor="w")
#         self.port_var = tk.StringVar()
#         self.port_combo = ttk.Combobox(
#             conn_frame, textvariable=self.port_var, width=30, state="readonly"
#         )
#         self.port_combo.pack(fill="x", pady=5)
#         ttk.Button(conn_frame, text="Refresh Ports", command=self.update_port_list).pack(fill="x", pady=2)
        
#         # CHANNEL MAPPING
#         map_frame = ttk.LabelFrame(parent, text="📊 Channel Mapping", padding=10)
#         map_frame.pack(fill="x", pady=5)
        
#         ttk.Label(map_frame, text="Channel 0:").pack(anchor="w")
#         self.ch0_var = tk.StringVar(value="EMG")
#         ttk.Combobox(
#             map_frame, textvariable=self.ch0_var, values=['EMG', 'EOG', 'EEG'], state="readonly"
#         ).pack(fill="x", pady=2)
        
#         ttk.Label(map_frame, text="Channel 1:").pack(anchor="w")
#         self.ch1_var = tk.StringVar(value="EOG")
#         ttk.Combobox(
#             map_frame, textvariable=self.ch1_var, values=['EMG', 'EOG', 'EEG'], state="readonly"
#         ).pack(fill="x", pady=2)
        
#         # CONTROL BUTTONS
#         btn_frame = ttk.LabelFrame(parent, text="⚙️ Control", padding=10)
#         btn_frame.pack(fill="x", pady=5)
        
#         self.connect_btn = ttk.Button(
#             btn_frame, text="🔌 Connect", command=self.connect_device
#         )
#         self.connect_btn.pack(fill="x", pady=3)
        
#         self.disconnect_btn = ttk.Button(
#             btn_frame, text="❌ Disconnect", command=self.disconnect_device, state="disabled"
#         )
#         self.disconnect_btn.pack(fill="x", pady=3)
        
#         self.start_btn = ttk.Button(
#             btn_frame, text="▶️ Start Acquisition", command=self.start_acquisition, state="disabled"
#         )
#         self.start_btn.pack(fill="x", pady=3)
        
#         self.stop_btn = ttk.Button(
#             btn_frame, text="⏹️ Stop Acquisition", command=self.stop_acquisition, state="disabled"
#         )
#         self.stop_btn.pack(fill="x", pady=3)
        
#         self.pause_btn = ttk.Button(
#             btn_frame, text="⏸️ Pause", command=self.toggle_pause, state="disabled"
#         )
#         self.pause_btn.pack(fill="x", pady=3)
        
#         # RECORDING
#         rec_frame = ttk.LabelFrame(parent, text="🔴 Recording", padding=10)
#         rec_frame.pack(fill="x", pady=5)
        
#         self.rec_btn = ttk.Button(
#             rec_frame, text="⚫ Start Recording", command=self.toggle_recording, state="disabled"
#         )
#         self.rec_btn.pack(fill="x", pady=3)
        
#         # SAVE
#         save_frame = ttk.LabelFrame(parent, text="💾 Save", padding=10)
#         save_frame.pack(fill="x", pady=5)
        
#         ttk.Button(save_frame, text="Choose Path", command=self.choose_save_path).pack(fill="x", pady=2)
#         self.path_label = ttk.Label(save_frame, text=str(self.save_path), wraplength=250)
#         self.path_label.pack(fill="x", pady=2)
        
#         self.save_btn = ttk.Button(
#             save_frame, text="💾 Save Session", command=self.save_session, state="disabled"
#         )
#         self.save_btn.pack(fill="x", pady=3)
        
#         ttk.Button(save_frame, text="⚙️ Map Sensors", command=self._save_config).pack(fill="x", pady=2)
        
#         # STATUS
#         status_frame = ttk.LabelFrame(parent, text="📈 Status", padding=10)
#         status_frame.pack(fill="x", pady=5)
        
#         ttk.Label(status_frame, text="Connection:").pack(anchor="w")
#         self.status_label = ttk.Label(status_frame, text="❌ Disconnected", foreground="red")
#         self.status_label.pack(anchor="w", pady=2)
        
#         ttk.Label(status_frame, text="Packets:").pack(anchor="w")
#         self.packet_label = ttk.Label(status_frame, text="0")
#         self.packet_label.pack(anchor="w", pady=2)
        
#         ttk.Label(status_frame, text="Recording:").pack(anchor="w")
#         self.recording_label = ttk.Label(status_frame, text="❌ No", foreground="red")
#         self.recording_label.pack(anchor="w")

#     def _build_graph_panel(self, parent):
#         """Build right graph panel - FIXED: No overlapping labels"""
#         fig = Figure(figsize=(12, 8), dpi=100)
#         fig.subplots_adjust(left=0.06, right=0.98, top=0.96, bottom=0.08, hspace=0.35)
        
#         # Subplot 1: Channel 0
#         self.ax0 = fig.add_subplot(211)
#         # Use position to move title up and away from bottom subplot
#         self.ax0.set_title("📍 Channel 0 (EMG)", fontsize=12, fontweight='bold', pad=10)
#         self.ax0.set_xlabel("Time (seconds)")
#         self.ax0.set_ylabel("Amplitude (µV)")
#         self.ax0.grid(True, alpha=0.3)
#         y_limits = self.config.get("ui_settings", {}).get("y_axis_limits", [-2000, 2000])
#         self.ax0.set_ylim(y_limits[0], y_limits[1])
#         self.ax0.set_xlim(0, self.window_seconds)  # Set X-axis to start at 0
#         self.line0, = self.ax0.plot(self.time_axis, self.ch0_buffer,
#                                     color='red', linewidth=1.5, label='CH0')
#         self.ax0.legend(loc='upper right', fontsize=9)
        
#         # Subplot 2: Channel 1
#         self.ax1 = fig.add_subplot(212)
#         # Use position to move title down and away from top subplot
#         self.ax1.set_title("📍 Channel 1 (EOG)", fontsize=12, fontweight='bold', pad=10)
#         self.ax1.set_xlabel("Time (seconds)")
#         self.ax1.set_ylabel("Amplitude (µV)")
#         self.ax1.grid(True, alpha=0.3)
#         self.ax1.set_ylim(y_limits[0], y_limits[1])
#         self.ax1.set_xlim(0, self.window_seconds)  # Set X-axis to start at 0
#         self.line1, = self.ax1.plot(self.time_axis, self.ch1_buffer,
#                                     color='blue', linewidth=1.5, label='CH1')
#         self.ax1.legend(loc='upper right', fontsize=9)
        
#         # Create canvas
#         self.canvas = FigureCanvasTkAgg(fig, master=parent)
#         self.canvas.get_tk_widget().pack(fill="both", expand=True)
#         self.fig = fig

#     def update_port_list(self):
#         """Update available COM ports"""
#         try:
#             import serial.tools.list_ports
#             ports = []
#             for p, desc, hwid in serial.tools.list_ports.comports():
#                 ports.append(f"{p} - {desc}")
#             self.port_combo['values'] = ports if ports else ["No ports found"]
#             if ports:
#                 self.port_combo.current(0)
#         except Exception as e:
#             messagebox.showerror("Error", f"Failed to scan ports: {e}")

#     def connect_device(self):
#         """Connect to Arduino"""
#         if not self.port_var.get():
#             messagebox.showerror("Error", "Select a COM port")
#             return
        
#         port = self.port_var.get().split(" ")[0]
        
#         # Create serial reader
#         self.serial_reader = SerialPacketReader(port=port)
#         if not self.serial_reader.connect():
#             messagebox.showerror("Error", f"Failed to connect to {port}")
#             return
        
#         self.serial_reader.start()
#         self.is_connected = True
        
#         # Update UI
#         self.status_label.config(text="✅ Connected", foreground="green")
#         self.connect_btn.config(state="disabled")
#         self.disconnect_btn.config(state="normal")
#         self.start_btn.config(state="normal")
        
#         # Store channel types
#         self.ch0_type = self.ch0_var.get()
#         self.ch1_type = self.ch1_var.get()
        
#         # Create LSL outlets if available
#         if LSL_AVAILABLE:
#             ch_types = [self.ch0_type, self.ch1_type]
#             ch_labels = [f"{self.ch0_type}_0", f"{self.ch1_type}_1"]
#             self.lsl_raw_uV = LSLStreamer(
#                 "BioSignals-Raw-uV",
#                 channel_types=ch_types,
#                 channel_labels=ch_labels,
#                 channel_count=2,
#                 nominal_srate=float(self.config.get("sampling_rate", 512))
#             )
#             self.lsl_processed = LSLStreamer(
#                 "BioSignals-Pure",
#                 channel_types=ch_types,
#                 channel_labels=ch_labels,
#                 channel_count=2,
#                 nominal_srate=float(self.config.get("sampling_rate", 512))
#             )
        

#     def disconnect_device(self):
#         """Disconnect from Arduino"""
#         if self.is_acquiring:
#             self.stop_acquisition()
        
#         self.is_connected = False
#         if self.serial_reader:
#             self.serial_reader.disconnect()
        
#         self.status_label.config(text="❌ Disconnected", foreground="red")
#         self.connect_btn.config(state="normal")
#         self.disconnect_btn.config(state="disabled")
#         self.start_btn.config(state="disabled")
#         self.stop_btn.config(state="disabled")

#     def start_acquisition(self):
#         """Start acquiring data"""
#         if not (self.serial_reader and self.is_connected):
#             messagebox.showerror("Error", "Device not connected")
#             return
        
#         self.serial_reader.send_command("START")
#         self.is_acquiring = True
#         self.is_recording = True
#         self.session_start_time = datetime.now()
#         self.packet_count = 0
#         self.session_data = []
#         self.last_packet_counter = None
        
#         # Clear buffers
#         self.ch0_buffer.fill(0)
#         self.ch1_buffer.fill(0)
#         self.buffer_ptr = 0
        
#         # Update UI
#         self.start_btn.config(state="disabled")
#         self.stop_btn.config(state="normal")
#         self.pause_btn.config(state="normal")
#         self.rec_btn.config(state="normal")
#         self.save_btn.config(state="normal")
#         self.recording_label.config(text="✅ Yes", foreground="green")

#     def stop_acquisition(self):
#         """Stop acquiring data"""
#         try:
#             if self.serial_reader:
#                 self.serial_reader.send_command("STOP")
#         except:
#             pass
        
#         self.is_acquiring = False
#         self.is_paused = False
#         self.is_recording = False
        
#         self.start_btn.config(state="normal")
#         self.stop_btn.config(state="disabled")
#         self.pause_btn.config(state="disabled")
#         self.rec_btn.config(state="disabled")
#         self.recording_label.config(text="❌ No", foreground="red")

#     def toggle_recording(self):
#         """Toggle recording"""
#         if not self.is_acquiring:
#             messagebox.showerror("Error", "Start acquisition first")
#             return
        
#         self.is_recording = not self.is_recording
#         if self.is_recording:
#             self.rec_btn.config(text="⚫ Stop Recording")
#             self.recording_label.config(text="✅ Yes", foreground="green")
#         else:
#             self.rec_btn.config(text="⚫ Start Recording")
#             self.recording_label.config(text="⏸️ Paused", foreground="orange")

#     def toggle_pause(self):
#         """Toggle pause/resume"""
#         if not self.is_acquiring:
#             return
        
#         self.is_paused = not self.is_paused
#         if self.is_paused:
#             if self.serial_reader:
#                 self.serial_reader.send_command("PAUSE")
#             self.pause_btn.config(text="▶️ Resume")
#             self.status_label.config(text="⏸️ Paused", foreground="orange")
#         else:
#             if self.serial_reader:
#                 self.serial_reader.send_command("RESUME")
#             self.pause_btn.config(text="⏸️ Pause")
#             self.status_label.config(text="✅ Connected", foreground="green")

#     def choose_save_path(self):
#         """Choose save directory"""
#         path = filedialog.askdirectory(
#             title="Select save directory",
#             initialdir=str(self.save_path)
#         )
#         if path:
#             self.save_path = Path(path)
#             self.path_label.config(text=str(self.save_path))

#     def save_session(self):
#         """Save session data"""
#         if not self.session_data:
#             messagebox.showwarning("Empty", "No data to save")
#             return
        
#         timestamp = datetime.now().strftime("%d%m%Y_%H%M%S")
#         self.save_path.mkdir(parents=True, exist_ok=True)
#         filepath = self.save_path / f"session_{timestamp}.json"
        
#         metadata = {
#             "session_info": {
#                 "timestamp": self.session_start_time.isoformat(),
#                 "duration_seconds": (datetime.now() - self.session_start_time).total_seconds(),
#                 "total_packets": self.packet_count,
#                 "sampling_rate_hz": self.config.get("sampling_rate", 512),
#                 "channel_0_type": self.ch0_type,
#                 "channel_1_type": self.ch1_type
#             },
#             "sensor_config": self.config.get("sensor_mapping", {}),
#             "filters": self.config.get("filters", {}),
#             "data": self.session_data
#         }
        
#         with open(filepath, 'w') as f:
#             json.dump(metadata, f, indent=2)
        
#         messagebox.showinfo("Saved", f"Saved {len(self.session_data)} packets to {filepath}")

#     def main_loop(self):
#         """Main acquisition and update loop"""
#         try:
#             if self.is_acquiring and not self.is_paused and self.serial_reader:
#                 # Drain queued packets
#                 while True:
#                     pkt_bytes = self.serial_reader.get_packet(timeout=0.001)
#                     if pkt_bytes is None:
#                         break
                    
#                     try:
#                         pkt = self.packet_parser.parse(pkt_bytes)
#                     except Exception as e:
#                         print(f"Parse error: {e}")
#                         continue
                    
#                     # Duplicate check
#                     if self.last_packet_counter is not None:
#                         if pkt.counter == self.last_packet_counter:
#                             continue
                    
#                     self.last_packet_counter = pkt.counter
                    
#                     # Convert to µV
#                     ch0_uv = adc_to_uv(pkt.ch0_raw)
#                     ch1_uv = adc_to_uv(pkt.ch1_raw)
                    
#                     # Push to LSL
#                     if LSL_AVAILABLE:
#                         if self.lsl_raw_uV:
#                             self.lsl_raw_uV.push_sample([ch0_uv, ch1_uv], None)
#                         if self.lsl_processed:
#                             self.lsl_processed.push_sample([ch0_uv, ch1_uv], None)
                    
#                     # Add to buffers
#                     self.ch0_buffer[self.buffer_ptr] = ch0_uv
#                     self.ch1_buffer[self.buffer_ptr] = ch1_uv
#                     self.buffer_ptr = (self.buffer_ptr + 1) % self.buffer_size
                    
#                     # # Record if enabled
#                     if self.is_recording:
#                         entry = {
#                             "timestamp": pkt.timestamp.isoformat(),
#                             "packet_seq": int(pkt.counter),
#                             "ch0_raw_adc": int(pkt.ch0_raw),
#                             "ch1_raw_adc": int(pkt.ch1_raw),
#                             "ch0_uv": float(ch0_uv),
#                             "ch1_uv": float(ch1_uv),
#                             "ch0_type": self.ch0_type,
#                             "ch1_type": self.ch1_type
#                         }
#                         self.session_data.append(entry)
                        
#                     #     # SEND TO filter_router.py via your bridge/queue
#                     #     self._send_to_filter_router(entry)
                    
#                     self.packet_count += 1
            
#             # Update UI labels
#             self.packet_label.config(text=str(self.packet_count))
            
#             # Update plots
#             self.update_plots()
        
#         except Exception as e:
#             print(f"Main loop error: {e}")
        
#         # Schedule next update
#         if self.root.winfo_exists():
#             self.root.after(30, self.main_loop)

#     # def _send_to_filter_router(self, packet_data: dict):
#     #     """Send data to filter_router.py"""
#     #     # This is where you'd send to your filter_router
#     #     # Example: could use ZMQ, WebSocket, Redis, or file-based queue
#     #     try:
#     #         # Format for filter_router
#     #         msg = {
#     #             "source": "acquisition_app",
#     #             "timestamp": packet_data["timestamp"],
#     #             "channels": {
#     #                 "ch0": {
#     #                     "type": packet_data["ch0_type"],
#     #                     "raw_adc": packet_data["ch0_raw_adc"],
#     #                     "uv": packet_data["ch0_uv"]
#     #                 },
#     #                 "ch1": {
#     #                     "type": packet_data["ch1_type"],
#     #                     "raw_adc": packet_data["ch1_raw_adc"],
#     #                     "uv": packet_data["ch1_uv"]
#     #                 }
#     #             }
#     #         }
#     #         # TODO: Implement your routing mechanism here
#     #         # print(f"[Router] {json.dumps(msg)}")  # Uncomment for debugging
           
#     #     except Exception as e:
#     #         print(f"[Router] Send error: {e}")

#     def update_plots(self):
#         """Update the plot lines"""
#         try:
#             # Rotate buffers so latest data is on the right
#             ch0_rotated = np.roll(self.ch0_buffer, -self.buffer_ptr)
#             ch1_rotated = np.roll(self.ch1_buffer, -self.buffer_ptr)
            
#             # Update line data
#             self.line0.set_ydata(ch0_rotated)
#             self.line1.set_ydata(ch1_rotated)
            
#             # Update titles dynamically if channel type changed
#             self.ax0.set_title(f"📍 Channel 0 ({self.ch0_type})", fontsize=12, fontweight='bold', pad=10)
#             self.ax1.set_title(f"📍 Channel 1 ({self.ch1_type})", fontsize=12, fontweight='bold', pad=10)
            
#             # Redraw
#             self.canvas.draw_idle()
#         except Exception as e:
#             print(f"Plot update error: {e}")

#     def on_closing(self):
#         """Handle window closing"""
#         try:
#             if self.is_acquiring:
#                 self.stop_acquisition()
#             if self.serial_reader:
#                 self.serial_reader.disconnect()
#         finally:
#             self.root.destroy()

# def main():
#     root = tk.Tk()
#     app = AcquisitionApp(root)
#     app.update_port_list()
#     root.mainloop()

# if __name__ == "__main__":
#     main()


import sys
import os
import json
import time
import math
import struct
import threading
import queue
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from datetime import datetime

import numpy as np
from PySide6 import QtCore, QtWidgets
import pyqtgraph as pg

# try to import project modules
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SRC = PROJECT_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

try:
    from .serial_reader import SerialPacketReader
    from .packet_parser import PacketParser
    from .lsl_streams import LSLStreamer, LSL_AVAILABLE
except Exception as e:
    raise SystemExit("Failed to import project modules (serial_reader/packet_parser/lsl_streams). "
                     "Make sure acquisition package exists under src/: " + str(e))

# file paths
CONFIG_PATH = PROJECT_ROOT / "config" / "sensor_config.json"
DEFAULT_SAVE_FOLDER = PROJECT_ROOT / "data" / "sessions"
LOG_DIR = PROJECT_ROOT / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
PACKET_STATS_LOG = LOG_DIR / "packet_stats.log"

# ADC constants consistent with your pipeline
ADC_BITS = 14
ADC_MAX = (1 << ADC_BITS) - 1
VREF = 3300.0  # same semantics as previous conversion

# Packet constants (for console-level checks)
SYNC1 = 0xC7
SYNC2 = 0x7C
END_BYTE = 0x01

# ---------- logging setup ----------
logger = logging.getLogger("packet_stats")
logger.setLevel(logging.INFO)
handler = RotatingFileHandler(str(PACKET_STATS_LOG), maxBytes=1_000_000, backupCount=5, encoding="utf-8")
formatter = logging.Formatter("%(asctime)s %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)

def load_config_or_default() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except Exception:
            pass
    # default matches original defaults
    return {
        "sampling_rate": 512,
        "channel_mapping": {
            "ch0": {"sensor": "EMG", "enabled": True, "label": "EMG Channel 0"},
            "ch1": {"sensor": "EOG", "enabled": True, "label": "EOG Channel 1"}
        },
        "filters": {},
        "adc_settings": {"bits": ADC_BITS, "vref": VREF},
        "ui_settings": {"window_seconds": 5.0, "update_interval_ms": 30, "y_axis_limits": [-2000, 2000]},
    }

def adc_to_uv(adc_val, bits=ADC_BITS, vref=VREF):
    """Map ADC integer to voltage units (same formula used previously)."""
    volts = ((adc_val / (2 ** bits)) * vref) - (vref / 2.0)
    return volts

def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)

# ---------- Main GUI ----------
class AcquisitionWindow(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("AcqQT — PySide6 Acquisition (raw µV)")
        self.resize(1300, 800)

        self.config = load_config_or_default()
        self.sampling_rate = float(self.config.get("sampling_rate", 512))
        self.window_seconds = float(self.config.get("display", {}).get("window_seconds", 5.0))
        self.buffer_size = int(self.sampling_rate * self.window_seconds)

        # Save path & config path same logic as Tk app
        self.save_path = DEFAULT_SAVE_FOLDER
        self.config_path = CONFIG_PATH

        # buffers
        self.ch0_buffer = np.zeros(self.buffer_size, dtype=float)
        self.ch1_buffer = np.zeros(self.buffer_size, dtype=float)
        self.buf_ptr = 0

        # pipeline objects
        self.serial_reader = None
        self.packet_parser = PacketParser()
        self.lsl_raw = None
        self.lsl_proc = None

        # recording/session state
        self.is_connected = False
        self.is_acquiring = False
        self.is_recording = False
        self.session_data = []
        self.save_folder = Path(self.config.get("save_folder", str(DEFAULT_SAVE_FOLDER)))
        ensure_dir(self.save_folder)
        self.save_on_stop = True

        self.packet_count = 0
        self.last_counter = None

        # diagnostics logging throttle
        self._last_diag_log_time = 0.0
        self._diag_log_interval = 1.0  # seconds

        self._build_ui()
        self._init_plotting()

        # UI update timer
        self.ui_timer = QtCore.QTimer()
        self.ui_timer.setInterval(50)
        self.ui_timer.timeout.connect(self._on_ui_timer)
        self.ui_timer.start()

    def _build_ui(self):
        central = QtWidgets.QWidget()
        self.setCentralWidget(central)
        hl = QtWidgets.QHBoxLayout(central)

        # left control panel (scrollable)
        left_scroll = QtWidgets.QScrollArea()
        left_scroll.setWidgetResizable(True)
        left = QtWidgets.QWidget()
        left_layout = QtWidgets.QVBoxLayout(left)
        left_layout.setContentsMargins(10, 10, 10, 10)

        # Serial controls
        left_layout.addWidget(QtWidgets.QLabel("<b>Serial / Stream</b>"))
        self.port_combo = QtWidgets.QComboBox()
        left_layout.addWidget(self.port_combo)
        refresh_btn = QtWidgets.QPushButton("Refresh ports")
        refresh_btn.clicked.connect(self.refresh_ports)
        left_layout.addWidget(refresh_btn)

        row = QtWidgets.QHBoxLayout()
        row.addWidget(QtWidgets.QLabel("Baud"))
        self.baud_edit = QtWidgets.QLineEdit("230400")
        row.addWidget(self.baud_edit)
        left_layout.addLayout(row)

        # Channel mapping
        grp_map = QtWidgets.QGroupBox("Channel Mapping")
        gmap_layout = QtWidgets.QFormLayout(grp_map)
        self.ch0_combo = QtWidgets.QComboBox(); self.ch0_combo.addItems(["EMG","EOG","EEG"])
        self.ch1_combo = QtWidgets.QComboBox(); self.ch1_combo.addItems(["EMG","EOG","EEG"])
        self.ch0_combo.setCurrentText(self.config.get("channel_mapping", {}).get("ch0", {}).get("sensor","EMG"))
        self.ch1_combo.setCurrentText(self.config.get("channel_mapping", {}).get("ch1", {}).get("sensor","EOG"))
        gmap_layout.addRow("Channel 0:", self.ch0_combo)
        gmap_layout.addRow("Channel 1:", self.ch1_combo)
        left_layout.addWidget(grp_map)

        # connect buttons
        self.btn_connect = QtWidgets.QPushButton("Connect")
        self.btn_connect.clicked.connect(self.connect_serial)
        self.btn_disconnect = QtWidgets.QPushButton("Disconnect")
        self.btn_disconnect.clicked.connect(self.disconnect_serial)
        self.btn_disconnect.setEnabled(False)
        left_layout.addWidget(self.btn_connect)
        left_layout.addWidget(self.btn_disconnect)

        left_layout.addSpacing(8)
        # acquisition controls
        left_layout.addWidget(QtWidgets.QLabel("<b>Acquisition</b>"))

        self.btn_start = QtWidgets.QPushButton("Start Acquisition")
        self.btn_start.setEnabled(False)
        self.btn_start.clicked.connect(self.start_acquisition)
        self.btn_stop = QtWidgets.QPushButton("Stop Acquisition")
        
        #save mapping to config
        btn_save_cfg = QtWidgets.QPushButton("Save Mapping to Config")
        btn_save_cfg.clicked.connect(self.save_config)
        left_layout.addWidget(btn_save_cfg)

        self.btn_stop.clicked.connect(self.stop_acquisition)
        left_layout.addWidget(self.btn_start); left_layout.addWidget(self.btn_stop)

        # recording
        left_layout.addWidget(QtWidgets.QLabel("<b>Recording</b>"))
        rec_h = QtWidgets.QHBoxLayout()
        self.btn_record = QtWidgets.QPushButton("Start Recording")
        self.btn_record.setEnabled(False)
        self.btn_record.clicked.connect(self._toggle_record)
        rec_h.addWidget(self.btn_record)
        self.btn_save_now = QtWidgets.QPushButton("Save Session Now")
        self.btn_save_now.clicked.connect(self._save_session_now)
        rec_h.addWidget(self.btn_save_now)
        left_layout.addLayout(rec_h)

        # save folder selector and autosave
        sf_h = QtWidgets.QHBoxLayout()
        self.folder_label = QtWidgets.QLineEdit(str(self.save_folder))
        self.folder_label.setReadOnly(True)
        sf_h.addWidget(self.folder_label)
        choose = QtWidgets.QPushButton("Choose")
        choose.clicked.connect(self._choose_folder)
        sf_h.addWidget(choose)
        left_layout.addLayout(sf_h)
        self.autosave_chk = QtWidgets.QCheckBox("Save on stop (auto)")
        self.autosave_chk.setChecked(self.save_on_stop)
        left_layout.addWidget(self.autosave_chk)

        left_layout.addStretch()
        left_scroll.setWidget(left)
        left_scroll.setMinimumWidth(320)
        hl.addWidget(left_scroll, 0)

        # right panel: plots + diagnostics
        right = QtWidgets.QWidget()
        rlay = QtWidgets.QVBoxLayout(right)
        # plots
        pg.setConfigOptions(antialias=True)
        self.plot0 = pg.PlotWidget(title="Channel 0 (µV)")
        self.plot1 = pg.PlotWidget(title="Channel 1 (µV)")
        self.curve0 = self.plot0.plot(pen=pg.mkPen('c', width=1.4))
        self.curve1 = self.plot1.plot(pen=pg.mkPen('y', width=1.4))
        rlay.addWidget(self.plot0, 1)
        rlay.addWidget(self.plot1, 1)
        # metrics
        metrics = QtWidgets.QWidget()
        mlay = QtWidgets.QHBoxLayout(metrics)
        self.metrics_ch0 = QtWidgets.QLabel("Ch0 RMS: —")
        self.metrics_ch1 = QtWidgets.QLabel("Ch1 RMS: —")
        mlay.addWidget(self.metrics_ch0); mlay.addWidget(self.metrics_ch1)
        rlay.addWidget(metrics)
        # diagnostics & console
        self.diag_box = QtWidgets.QPlainTextEdit(); self.diag_box.setReadOnly(True); self.diag_box.setMaximumHeight(160)
        rlay.addWidget(self.diag_box)
        hl.addWidget(right, 1)

        # initialize port list
        self.refresh_ports()

        # Apply initial plot ranges from config
        self.plot0.setYRange(-1000, 1000)
        self.plot1.setYRange(-1000, 1000)

    def _init_plotting(self):
        self.plot_len = self.buffer_size
        # time axis not necessary; show latest buffer
        self.plot0.setYRange(-1, 1)
        self.plot1.setYRange(-1, 1)

    def refresh_ports(self):
        try:
            import serial.tools.list_ports as lp
            ports = [p.device for p in lp.comports()]
        except Exception:
            ports = []
        self.port_combo.clear()
        self.port_combo.addItems(ports or ["No ports"])

    def connect_serial(self):
        port = self.port_combo.currentText()
        baud = int(self.baud_edit.text().strip() or 230400)
        if not port or port.startswith("No"):
            self._log("No COM port selected")
            return
        self._log(f"Opening {port} @ {baud}")
        self.serial_reader = SerialPacketReader(port=port, baud=baud)
        ok = self.serial_reader.connect()
        if not ok:
            self._log(f"Failed to open {port}")
            self.serial_reader = None
            return
        self.serial_reader.start()
        self.is_connected = True
        self.btn_connect.setEnabled(False)
        self.btn_disconnect.setEnabled(True)
        self.btn_start.setEnabled(True)
        self._log("Serial connected")
        # create LSL if available
        if LSL_AVAILABLE:
            labels = [self.map_ch0.currentText(), self.map_ch1.currentText()]
            try:
                self.lsl_raw = LSLStreamer("Bio-Raw", channel_types=labels, channel_labels=labels, channel_count=2, nominal_srate=self.sampling_rate)
                self.lsl_proc = LSLStreamer("Bio-Proc", channel_types=labels, channel_labels=labels, channel_count=2, nominal_srate=self.sampling_rate)
                self._log("LSL outlets created")
            except Exception as e:
                self._log(f"LSL creation failed: {e}")

    def disconnect_serial(self):
        if self.serial_reader:
            try:
                self.serial_reader.disconnect()
            except Exception:
                pass
            self.serial_reader = None
        self.is_connected = False
        self.btn_connect.setEnabled(True)
        self.btn_disconnect.setEnabled(False)
        self.btn_start.setEnabled(False)
        self._log("Serial disconnected")

    def start_acquisition(self):
        if not self.is_connected or not self.serial_reader:
            self._log("Not connected")
            return
        self.is_acquiring = True
        self.btn_start.setEnabled(False)
        self.btn_stop.setEnabled(True)
        self.btn_record.setEnabled(True)
        self._log("Acquisition started")

    def stop_acquisition(self):
        if self.serial_reader:
            try:
                self.serial_reader.send_command("STOP")
            except Exception:
                pass
        self.is_acquiring = False
        self.btn_start.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self._log("Acquisition stopped")
        if self.autosave_chk.isChecked() and self.is_recording:
            self._log("Auto-saving session on stop")
            self._save_session_now()
        # disable recording on stop
        self.is_recording = False
        self.btn_record.setText("Start Recording")
        self.btn_record.setEnabled(False)

    def _toggle_record(self):
        if not self.is_acquiring:
            self._log("Start acquisition first")
            return
        self.is_recording = not self.is_recording
        self.btn_record.setText("Stop Recording" if self.is_recording else "Start Recording")
        self._log("Recording: " + ("ON" if self.is_recording else "OFF"))
        if self.is_recording:
            self.session_data = []

    def _choose_folder(self):
        dlg = QtWidgets.QFileDialog(self, "Select folder to save sessions")
        dlg.setFileMode(QtWidgets.QFileDialog.Directory)
        if dlg.exec():
            path = dlg.selectedFiles()[0]
            self.save_folder = Path(path)
            self.folder_label.setText(str(self.save_folder))
            ensure_dir(self.save_folder)
            self._log(f"Save folder set to {self.save_folder}")

    def _save_session_now(self):
        if not self.session_data:
            self._log("No session data to save")
            return
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        ensure_dir(self.save_folder)
        out_json = self.save_folder / f"session_{ts}.json"
        out_csv = self.save_folder / f"session_{ts}.csv"
        try:
            with open(out_json, "w") as f:
                json.dump({"meta": {"saved_at": datetime.now().isoformat(), "packets": len(self.session_data)}, "data": self.session_data}, f, indent=2)
            # CSV (flat)
            import csv
            keys = list(self.session_data[0].keys())
            with open(out_csv, "w", newline="") as cf:
                writer = csv.DictWriter(cf, fieldnames=keys)
                writer.writeheader()
                writer.writerows(self.session_data)
            self._log(f"Session saved: {out_json} and {out_csv}")
        except Exception as e:
            self._log(f"Failed to save session: {e}")

    def save_config(self):
        try:
            cfg = self.config
            cfg["channel_mapping"] = {
                "ch0": {"sensor": self.ch0_combo.currentText(), "enabled": True},
                "ch1": {"sensor": self.ch1_combo.currentText(), "enabled": True}
            }
            CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
            CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
            self._log(f"Config saved to {CONFIG_PATH}")
        except Exception as e:
            self._log(f"Save config error: {e}")


    def _on_ui_timer(self):
        if self.is_acquiring and self.serial_reader:
            # drain packets
            while True:
                try:
                    pkt_bytes = self.serial_reader.get_packet(timeout=0.001)
                except Exception:
                    pkt_bytes = None
                if not pkt_bytes:
                    break
                try:
                    pkt = self.packet_parser.parse(pkt_bytes)
                except Exception as e:
                    self._log(f"Parse error: {e}")
                    continue
                # ignore duplicates
                if self.last_counter is not None and pkt.counter == self.last_counter:
                    continue
                self.last_counter = pkt.counter
                self.packet_count += 1

                ch0_uv = adc_to_uv(pkt.ch0_raw)
                ch1_uv = adc_to_uv(pkt.ch1_raw)

                # push to LSL if configured
                if LSL_AVAILABLE and self.lsl_raw:
                    try:
                        self.lsl_raw.push_sample([ch0_uv, ch1_uv], None)
                        self.lsl_proc.push_sample([ch0_uv, ch1_uv], None)
                    except Exception:
                        pass

                # push to buffers (raw µV)
                self.ch0_buffer[self.buf_ptr] = ch0_uv
                self.ch1_buffer[self.buf_ptr] = ch1_uv
                self.buf_ptr = (self.buf_ptr + 1) % self.buffer_size

                # record
                if self.is_recording:
                    entry = {
                        "timestamp": pkt.timestamp.isoformat(),
                        "counter": int(pkt.counter),
                        "ch0_raw": int(pkt.ch0_raw),
                        "ch1_raw": int(pkt.ch1_raw),
                        "ch0_uv": float(ch0_uv),
                        "ch1_uv": float(ch1_uv),
                        "ch0_type": self.map_ch0.currentText(),
                        "ch1_type": self.map_ch1.currentText()
                    }
                    self.session_data.append(entry)

            # update plots
            self._refresh_plots()
            # update metrics
            self._update_metrics()
            # update diagnostics and log them to file periodically
            self._update_diagnostics()

    def _refresh_plots(self):
        try:
            p0 = np.roll(self.ch0_buffer, -self.buf_ptr)
            p1 = np.roll(self.ch1_buffer, -self.buf_ptr)
            self.curve0.setData(p0)
            self.curve1.setData(p1)
        except Exception as e:
            self._log(f"Plot update error: {e}")

    def _update_metrics(self):
        # compute RMS over last 1 second
        n_rms = max(4, int(self.sampling_rate * 1.0))
        seg = min(len(self.ch0_buffer), n_rms)
        seg0 = np.roll(self.ch0_buffer, -self.buf_ptr)[-seg:]
        seg1 = np.roll(self.ch1_buffer, -self.buf_ptr)[-seg:]
        rms0 = np.sqrt(np.mean(np.square(seg0))) if seg0.size else 0.0
        rms1 = np.sqrt(np.mean(np.square(seg1))) if seg1.size else 0.0
        self.metrics_ch0.setText(f"Ch0 RMS: {rms0:.2f}")
        self.metrics_ch1.setText(f"Ch1 RMS: {rms1:.2f}")

    def _update_diagnostics(self):
        # try to extract typical stats from serial_reader if available
        if not self.serial_reader:
            return
        try:
            stats = {}
            # Attempt common attribute names used by serial readers
            for name in ("bytes_read", "packets_read", "sync_errors", "read_errors", "queue_size", "packets_total"):
                val = getattr(self.serial_reader, name, None)
                if val is not None:
                    stats[name] = int(val) if isinstance(val, (int, np.integer)) else val
            # many SerialPacketReader implementations store a stats dict
            sdict = getattr(self.serial_reader, "stats", None)
            if isinstance(sdict, dict):
                stats.update(sdict)
            # Always include last seen packet counter and packet_count
            stats["last_counter"] = int(self.last_counter) if self.last_counter is not None else None
            stats["packet_count_total"] = int(self.packet_count)

            # Update UI (top lines)
            lines = [f"{k}: {v}" for k, v in stats.items()]
            if lines:
                self.diag_box.setPlainText("\n".join(lines[-200:]))

            # Periodically log to rotating file (once per _diag_log_interval)
            nowt = time.time()
            if nowt - self._last_diag_log_time >= self._diag_log_interval:
                try:
                    logger.info(json.dumps(stats, default=str))
                except Exception:
                    logger.info(str(stats))
                self._last_diag_log_time = nowt

        except Exception as e:
            self._log(f"Diag error: {e}")

    def _log(self, s: str):
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {s}"
        print(line)
        cur = self.diag_box.toPlainText()
        if cur:
            cur = cur + "\n" + line
        else:
            cur = line
        lines = cur.splitlines()[-500:]
        self.diag_box.setPlainText("\n".join(lines))

    def closeEvent(self, event):
        # cleanup
        try:
            if self.serial_reader:
                self.serial_reader.disconnect()
        except Exception:
            pass
        if self.is_recording and self.autosave_chk.isChecked():
            self._save_session_now()
        event.accept()

# ----------------- main -----------------
def main():
    app = QtWidgets.QApplication(sys.argv)
    win = AcquisitionWindow()
    win.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    main()

