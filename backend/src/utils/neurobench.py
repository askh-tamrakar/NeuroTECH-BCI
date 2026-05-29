import sys
import os
import math
import time
import json
import struct
import random
import threading
import queue
from pathlib import Path

# --- Path Bootstrapping ---
# Add the 'backend' directory to sys.path to support 'src' imports when run directly
backend_root = Path(__file__).resolve().parents[2]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))
# --------------------------

from datetime import datetime
from PySide6 import QtCore, QtWidgets, QtGui
import pyqtgraph as pg
import numpy as np
import socket
import brainflow
from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds
from src.utils.paths import get_config_dir

# Optional: serial backend
try:
    import serial
    from serial.tools import list_ports
except Exception:
    serial = None
    list_ports = None

APP_NAME = "SignalForge (mock device)"
CONFIG_PATH = get_config_dir() / "sensor_config.json"
SYNC1 = 0xC7
SYNC2 = 0x7C
END_BYTE = 0x01
ADC_BITS = 14
ADC_MAX = (1 << ADC_BITS) - 1

# -------------------------
# Signal generation helpers
# -------------------------
DEFAULT_RANGE = 5.0  # Range in "units" (e.g. uV approx or just abstract). Allows signals > 1.5 threshold.

def clamp(v, a=-DEFAULT_RANGE, b=DEFAULT_RANGE):
    return max(a, min(b, v))

class ChannelGenerator:
    """Generates normalized samples for a single logical channel."""
    def __init__(self, role="EMG"):
        self.role = role  # "EMG" | "EEG" | "EOG" | "NONE"
        self.lock = threading.Lock()
        # dynamic state
        self.events = []  # queued transient events (tuples)
        self.ssv_ep_on = False
        self.ssv_freq = None
        self.sampling_rate = 1000.0
        self.scale = 1.0
        self.random = random.Random(12345 + (1 if role == "EMG" else 0)) # Slight seed diff
        self._noise_freqs = [50.0, 60.0]  # Line noise only to avoid false SSVEP triggers
        self._noise_amps = [0.05, 0.05]
        
        # Brain Wave Bands (Hz)
        self.bands = {
            "delta": (1.0, 4.0),
            "theta": (4.0, 8.0),
            "alpha": (8.0, 13.0),
            "beta": (13.0, 30.0),
            "gamma": (30.0, 45.0)
        }
        # Band Powers (0.0 to 1.0)
        self.band_powers = {
            "delta": 0.05,
            "theta": 0.05,
            "alpha": 0.1,
            "beta": 0.05,
            "gamma": 0.02
        }
        self.current_state = "Neutral"
        self.emg_hold = None

    def set_role(self, role):
        with self.lock:
            self.role = role

    def set_band_power(self, band, power):
        with self.lock:
            if band in self.band_powers:
                self.band_powers[band] = float(power)

    def set_brain_state(self, state_name):
        with self.lock:
            self.current_state = state_name
            if state_name == "Focus":
                self.band_powers = {"delta": 0.02, "theta": 0.06, "alpha": 0.16, "beta": 0.72, "gamma": 0.08}
            elif state_name == "Calm":
                self.band_powers = {"delta": 0.05, "theta": 0.1, "alpha": 0.6, "beta": 0.1, "gamma": 0.02}
            elif state_name == "Stress":
                self.band_powers = {"delta": 0.02, "theta": 0.05, "alpha": 0.1, "beta": 0.7, "gamma": 0.2}
            elif state_name == "Drowsy":
                self.band_powers = {"delta": 0.4, "theta": 0.5, "alpha": 0.1, "beta": 0.05, "gamma": 0.01}
            elif state_name == "Deep Sleep":
                self.band_powers = {"delta": 0.8, "theta": 0.1, "alpha": 0.05, "beta": 0.02, "gamma": 0.01}
            else: # Neutral
                self.band_powers = {"delta": 0.05, "theta": 0.05, "alpha": 0.1, "beta": 0.05, "gamma": 0.02}

    def set_rate(self, rate):
        with self.lock:
            self.sampling_rate = float(rate)

    def set_scale(self, scale):
        with self.lock:
            self.scale = float(scale)

    def _get_emg_profile(self, intensity):
        intensity = (intensity or "light").lower()
        return {
            "light": (0.12, 0.35),
            "medium": (0.25, 0.75),
            "strong": (0.45, 1.25),
        }.get(intensity, (0.12, 0.35))

    def _queue_emg_burst(self, intensity="light", duration=None):
        dur, amp = self._get_emg_profile(intensity)
        ev = {
            "type": "emg_burst",
            "t0": None,
            "dur": dur if duration is None else duration,
            "amp": amp,
        }
        self.events.append(ev)

    def trigger_emg(self, intensity="light"):
        """Intensity: light | medium | strong -> enqueue burst event"""
        with self.lock:
            self._queue_emg_burst(intensity)

    def start_emg_hold(self, intensity="light"):
        with self.lock:
            self.emg_hold = {
                "intensity": (intensity or "light").lower(),
                "started_at": time.perf_counter(),
            }

    def stop_emg_hold(self, intensity=None, keep_min_duration=True):
        with self.lock:
            hold = self.emg_hold
            if not hold:
                return False
            if intensity is not None and hold["intensity"] != intensity:
                return False

            self.emg_hold = None
            if keep_min_duration:
                min_duration, _ = self._get_emg_profile(hold["intensity"])
                elapsed = max(0.0, time.perf_counter() - hold["started_at"])
                remaining = min_duration - elapsed
                if remaining > 0:
                    self._queue_emg_burst(hold["intensity"], duration=remaining)
            return True

    def clear_emg_hold(self):
        with self.lock:
            was_active = self.emg_hold is not None
            self.emg_hold = None
            return was_active

    def trigger_eog(self, dir_name="blink"):
        with self.lock:
            # Matches Extractor/Detector requirements:
            # Min Duration: 100ms (we use 250ms for blink)
            # Min Amplitude: 1.5 (we use 3.0 for blink)
            if dir_name == "blink":
                dur = self.random.uniform(0.22, 0.9) # Target efficient width ~100-500ms
                amp = 3.0
            else:
                dur = 0.35
                amp = 2.0
                
            ev = {"type": "eog_pulse", "t0": None, "dur": dur, "amp": amp, "dir": dir_name}
            self.events.append(ev)

    def toggle_ssvep(self, freq=None, enabled=False):
        with self.lock:
            if enabled:
                self.ssv_ep_on = True
                self.ssv_freq = freq
            else:
                self.ssv_ep_on = False
                self.ssv_freq = None

    def synth_now(self, t_seconds, bg_uv=0.0):
        """Return value at a given continuous time (seconds)."""
        with self.lock:
            role = self.role
            ssv_on = self.ssv_ep_on
            ssv_freq = self.ssv_freq
            scale = self.scale
            band_powers = dict(self.band_powers)
            events = list(self.events)  # shallow copy
            emg_hold = dict(self.emg_hold) if self.emg_hold else None
            
        # Convert bg_uv (microvolts) to internal "units" 
        # (Original neurobench scale was approx 1 unit = 330 uV)
        val = bg_uv / 330.0
        
        # Output the frequency of 1kHz for every sensor
        val += 0.01 * math.sin(2 * math.pi * 1000.0 * t_seconds)

        # continuous components
        if role == "EEG":
            # SSVEP if toggled
            if ssv_on and ssv_freq:
                # fundamental + small harmonic
                val += 0.25 * math.sin(2 * math.pi * ssv_freq * t_seconds)
                val += 0.08 * math.sin(2 * math.pi * (2 * ssv_freq) * t_seconds)
            
            # Brain Wave Bands
            for band, power in band_powers.items():
                if power <= 0: continue
                low, high = self.bands[band]
                center = (low + high) / 2.0
                # Multiple frequencies per band for a more realistic spectral peak
                for offset in [-1.0, 0, 1.0]:
                    f = center + offset
                    if f < low or f > high: continue
                    # Jitter the phase slightly based on band type
                    phase = 0.5 * math.sin(2 * math.pi * 0.1 * t_seconds)
                    val += (power / 3.0) * math.sin(2 * math.pi * f * t_seconds + phase)

            # fallback EEG noise if no background provided
            if bg_uv == 0.0:
                for f, a in zip(self._noise_freqs, self._noise_amps):
                    val += a * math.sin(2 * math.pi * f * t_seconds)
                val += 0.01 * self.random.gauss(0, 1)
        elif role == "EMG":
            # baseline noise if no background provided
            if bg_uv == 0.0:
                noise = self.random.gauss(0, 0.06)
                env = 0.05 * (1 + 0.5 * math.sin(2 * math.pi * 0.15 * t_seconds))
                val += env * noise
        elif role == "EOG" and bg_uv == 0.0:
            val += 0.0  # Clean baseline, actions only
        else:
            val += 0.0

        if emg_hold:
            _, hold_amp = self._get_emg_profile(emg_hold["intensity"])
            hold_age = max(0.0, time.perf_counter() - emg_hold["started_at"])
            attack = min(1.0, hold_age / 0.05)
            modulation = 0.7 + 0.3 * math.sin(2 * math.pi * 3.0 * t_seconds)
            texture = (
                0.55 * self.random.gauss(0, 1)
                + 0.25 * math.sin(2 * math.pi * 80.0 * t_seconds)
                + 0.20 * math.sin(2 * math.pi * 130.0 * t_seconds)
            )
            val += hold_amp * attack * modulation * texture

        # event processing (bursts / pulses) — events store t0 when first used
        with self.lock:
            remaining = []
            for ev in self.events:
                if ev.get("t0") is None:
                    ev["t0"] = t_seconds
                dt = t_seconds - ev["t0"]
                if ev["type"] == "emg_burst":
                    dur = ev["dur"]
                    amp = ev["amp"]
                    if dt <= dur:
                        # triangular-ish burst * noise
                        env = (1.0 - abs((dt / dur) * 2 - 1))  # triangle
                        val += amp * env * (0.6 * self.random.gauss(0, 1))
                        remaining.append(ev)
                    # else: event ends (don't re-add)
                elif ev["type"] == "eog_pulse":
                    dur = ev["dur"]
                    amp = ev["amp"]
                    if dt <= dur:
                        # Asymmetric shape for BlinkDetector
                        # BlinkDetector requires min_asymmetry=0.05 (Rise / Fall)
                        # We use a skewed triangle with fast rise (30%) and slower fall (70%)
                        # Asymmetry = 0.3 / 0.7 = 0.42, which is > 0.05 and < 2.5 (valid)
                        
                        rise_ratio = 0.3
                        peak_t = dur * rise_ratio
                        
                        if dt < peak_t:
                            # Rise phase
                            pulse = amp * (dt / peak_t)
                        else:
                            # Fall phase
                            pulse = amp * (1.0 - (dt - peak_t) / (dur - peak_t))

                        # direction mapping: up/down/left/right/blink
                        if ev.get("dir") == "up":
                            val += pulse * 0.6
                        elif ev.get("dir") == "down":
                            val -= pulse * 0.6
                        elif ev.get("dir") == "left":
                            val -= pulse * 0.4
                        elif ev.get("dir") == "right":
                            val += pulse * 0.4
                        else:  # blink
                            val += pulse * 1.0 # Positive deflection
                            
                        remaining.append(ev)
                    # else finished
            # commit remaining events back (thread-safe)
            self.events = remaining

        # final scale and clamp
        out = clamp(val * scale)
        return out

class CustomAxisItem(pg.AxisItem):
    """Custom axis to limit decimal places on Y-axis."""
    def tickStrings(self, values, scale, spacing):
        # Return values formatted to 2 decimal places
        return [f"{v:.2f}" for v in values]


# -------------------------
# Serial writer thread
# -------------------------
class SerialWriter(threading.Thread):
    def __init__(self, port_name, baud, sample_rate, channels, data_queue, binary=True, quiet=False):
        super().__init__(daemon=True)
        self.port_name = port_name
        self.baud = baud
        self.sample_rate = sample_rate
        self.channels = channels
        self.data_queue = data_queue  # receives tuples (adc0, adc1, timestamp)
        self._stop_event = threading.Event()
        self.binary = binary
        self.quiet = quiet
        self.counter = 0
        self.ser = None

    def open_port(self):
        if serial is None:
            print("pyserial missing; running in loopback-only mode")
            return False
        try:
            self.ser = serial.Serial(self.port_name, baudrate=self.baud, timeout=1, write_timeout=1)
            return True
        except Exception as e:
            print(f"Failed to open {self.port_name}: {e}")
            self.ser = None
            return False

    def stop(self):
        self._stop_event.set()

    def run(self):
        opened = self.open_port()
        interval = 1.0 / float(self.sample_rate)
        while not self._stop_event.is_set():
            try:
                adc0, adc1, ts = self.data_queue.get(timeout=0.1) # Reduced timeout for faster stop check
            except queue.Empty:
                continue
            # Build packet according to the expected layout
            ctr = self.counter & 0xFF
            ch0 = int(adc0) & 0xFFFF
            ch1 = int(adc1) & 0xFFFF
            # packet bytes indices: sync1 sync2 counter ch0_hi ch0_lo ch1_hi ch1_lo end
            packet = bytes([SYNC1, SYNC2, ctr,
                            (ch0 >> 8) & 0xFF, ch0 & 0xFF,
                            (ch1 >> 8) & 0xFF, ch1 & 0xFF,
                            END_BYTE])
            # write
            if opened and self.ser:
                try:
                    self.ser.write(packet)
                except Exception as e:
                    print("write error:", e)
            # show console print (parsed)
            # if not self.quiet:
            # uncomment to enable logging of data sent to serial port
            # print(f"sent ctr={ctr:03d} ch0={ch0} ch1={ch1} time={datetime.fromtimestamp(ts).isoformat()}")
            self.counter += 1

        # close serial
        if self.ser:
            try:
                self.ser.close()
            except:
                pass

# -------------------------
# TCP writer thread
# -------------------------
class TCPWriter(threading.Thread):
    def __init__(self, ip, port, sample_rate, data_queue, quiet=False):
        super().__init__(daemon=True)
        self.ip = ip
        self.port = port
        self.sample_rate = sample_rate
        self.data_queue = data_queue
        self._stop_event = threading.Event()
        self.quiet = quiet
        self.counter = 0
        self.sock = None
        self.is_connected = False

    def connect(self):
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(5)
            self.sock.connect((self.ip, self.port))
            self.is_connected = True
            return True
        except Exception as e:
            print(f"Failed to connect to {self.ip}:{self.port}: {e}")
            self.is_connected = False
            return False

    def stop(self):
        self._stop_event.set()

    def run(self):
        connected = self.connect()
        while not self._stop_event.is_set():
            try:
                adc0, adc1, ts = self.data_queue.get(timeout=0.1)
            except queue.Empty:
                continue
            
            # Build packet (same as SerialWriter)
            ctr = self.counter & 0xFF
            ch0 = int(adc0) & 0xFFFF
            ch1 = int(adc1) & 0xFFFF
            packet = bytes([SYNC1, SYNC2, ctr,
                            (ch0 >> 8) & 0xFF, ch0 & 0xFF,
                            (ch1 >> 8) & 0xFF, ch1 & 0xFF,
                            END_BYTE])
            
            if self.is_connected and self.sock:
                try:
                    self.sock.sendall(packet)
                except Exception as e:
                    print("send error:", e)
                    self.is_connected = False
            
            self.counter += 1

        if self.sock:
            try:
                self.sock.close()
            except:
                pass

# -------------------------
# GUI Application
# -------------------------
class MainWindow(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.resize(1100, 700)
        self.setFocusPolicy(QtCore.Qt.StrongFocus)
        self.config = self.load_config()
        # state

        
        self.sample_rate = self.config.get("sampling_rate", 1000.0)
        self.baud = self.config.get("baud", 230400)
        self.port = self.config.get("serial_port", "")
        self.connection_mode = self.config.get("connection_mode", "Serial") # "Serial" or "WiFi"
        self.target_ip = self.config.get("target_ip", "10.235.2.237")
        self.target_port = self.config.get("target_port", 6000)
        self.streaming = False
        self.binary = self.config.get("binary", True)
        self._emg_keymap = {
            int(QtCore.Qt.Key.Key_A): "light",
            int(QtCore.Qt.Key.Key_S): "medium",
            int(QtCore.Qt.Key.Key_D): "strong",
        }
        self._active_emg_keys = {}

        # two channel generators
        self.ch_gens = [ChannelGenerator(), ChannelGenerator()]
        self.ssvep_groups = [QtWidgets.QButtonGroup(self), QtWidgets.QButtonGroup(self)]
        for g in self.ssvep_groups:
            g.setExclusive(True)
        
        # apply config mapping if exist
        mapping = self.config.get("channel_mapping", {})
        for i in range(2):
            role = mapping.get(f"ch{i}", {}).get("sensor", "EMG")
            self.ch_gens[i].set_role(role)

        # queue for inter-thread samples
        self.sample_queue = queue.Queue(maxsize=4096)
        # Bounded queue for plotting to prevent UI freeze if main thread falls behind
        self.plot_queue = queue.Queue(maxsize=1024) 
        self.stream_writer = None
        self.board = None
        
        print(f"[{datetime.now()}] Building UI...")
        self._build_ui()
        print(f"[{datetime.now()}] Building Plot...")
        self._build_plot()
        print(f"[{datetime.now()}] Initial port update...")
        self.update_port_list()
        print(f"[{datetime.now()}] Port update done. Starting timer...")
        self.timer = QtCore.QTimer()
        self.timer.setInterval(100)  # UI refresh ~10 Hz (relaxed)
        self.timer.timeout.connect(self._on_timer)
        self.timer.start()

        app = QtWidgets.QApplication.instance()
        if app is not None:
            app.installEventFilter(self)

        # generator loop in background
        print(f"[{datetime.now()}] Starting generator thread...")
        self.gen_thread = threading.Thread(target=self._generator_loop, daemon=True)
        self._gen_stop = threading.Event()
        self.gen_thread.start()
        print(f"[{datetime.now()}] Init complete.")

    def load_config(self):
        try:
            if CONFIG_PATH.exists():
                return json.loads(CONFIG_PATH.read_text())
        except Exception:
            pass
        # default
        return {
            "sampling_rate": 1000.0,
            "baud": 230400,
            "serial_port": "",
            "connection_mode": "Serial",
            "target_ip": "10.235.2.237",
            "target_port": 6000,
            "binary": True,
            "channel_mapping": {
                "ch0": {"sensor": "EOG"},
                "ch1": {"sensor": "EMG"}
            },
            "display": {
                "manualZoom": False,
                "yMin": -1,
                "yMax": 1
            }
        }

    def save_config(self):
        try:
            CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
            self.config["sampling_rate"] = self.sample_rate
            self.config["baud"] = self.baud
            self.config["serial_port"] = self.port
            self.config["connection_mode"] = self.mode_combo.currentText()
            self.config["target_ip"] = self.ip_input.text().strip()
            self.config["target_port"] = int(self.port_input.text().strip())
            self.config["binary"] = self.binary
            # channel mapping read from UI
            self.config["channel_mapping"] = {
                "ch0": {"sensor": self.ch0_map.currentText()},
                "ch1": {"sensor": self.ch1_map.currentText()}
            }
            CONFIG_PATH.write_text(json.dumps(self.config, indent=2))
            print("Config saved to", CONFIG_PATH)
        except Exception as e:
            print("Failed to save config:", e)

    def _build_ui(self):
        w = QtWidgets.QWidget()
        self.setCentralWidget(w)
        layout = QtWidgets.QHBoxLayout(w)

        # Left pane: controls (use a scroll area so controls never disappear on resize/fullscreen)
        left_content = QtWidgets.QWidget()
        left_layout = QtWidgets.QVBoxLayout(left_content)
        left_layout.setContentsMargins(10, 10, 10, 10)
        left_layout.setSpacing(8)

        # mapping
        left_layout.addWidget(QtWidgets.QLabel("<b>Channel Mapping</b>"))
        self.ch0_map = QtWidgets.QComboBox()
        self.ch0_map.addItems(["EMG", "EEG", "EOG", "NONE"])
        self.ch0_map.setCurrentText(self.config.get("channel_mapping", {}).get("ch0", {}).get("sensor", "EMG"))
        self.ch0_map.currentTextChanged.connect(lambda v: self._on_map_change(0, v))
        self.lbl_ch0 = QtWidgets.QLabel("Channel 0")
        left_layout.addWidget(self.lbl_ch0)
        left_layout.addWidget(self.ch0_map)

        self.ch1_map = QtWidgets.QComboBox()
        self.ch1_map.addItems(["EMG", "EEG", "EOG", "NONE"])
        self.ch1_map.setCurrentText(self.config.get("channel_mapping", {}).get("ch1", {}).get("sensor", "EEG"))
        self.ch1_map.currentTextChanged.connect(lambda v: self._on_map_change(1, v))
        self.lbl_ch1 = QtWidgets.QLabel("Channel 1")
        left_layout.addWidget(self.lbl_ch1)
        left_layout.addWidget(self.ch1_map)

        left_layout.addSpacing(6)

        # dynamic per-channel controls container
        left_layout.addWidget(QtWidgets.QLabel("<b>Channel Controls</b>"))
        # controls for each channel
        self.controls_ch0 = self._build_channel_controls(0)
        self.controls_ch1 = self._build_channel_controls(1)
        ctrl_wrapper = QtWidgets.QWidget()
        ctrl_layout = QtWidgets.QVBoxLayout(ctrl_wrapper)
        ctrl_layout.setContentsMargins(0, 0, 0, 0)
        ctrl_layout.setSpacing(6)
        self.lbl_ctrl_ch0 = QtWidgets.QLabel("Channel 0 controls")
        ctrl_layout.addWidget(self.lbl_ctrl_ch0)
        ctrl_layout.addWidget(self.controls_ch0)
        ctrl_layout.addSpacing(8)
        self.lbl_ctrl_ch1 = QtWidgets.QLabel("Channel 1 controls")
        ctrl_layout.addWidget(self.lbl_ctrl_ch1)
        ctrl_layout.addWidget(self.controls_ch1)
        left_layout.addWidget(ctrl_wrapper)

        left_layout.addWidget(ctrl_wrapper)

        left_layout.addSpacing(12)
        
        # Log Window
        left_layout.addWidget(QtWidgets.QLabel("<b>Event Log</b>"))
        self.left_console = QtWidgets.QPlainTextEdit()
        self.left_console.setReadOnly(True)
        self.left_console.setMaximumHeight(150)
        left_layout.addWidget(self.left_console)
        
        left_layout.addSpacing(12)

        # Serial / Streaming controls
        left_layout.addWidget(QtWidgets.QLabel("<b>Streaming</b>"))
        form = QtWidgets.QFormLayout()
        
        # Mode switch
        self.mode_combo = QtWidgets.QComboBox()
        self.mode_combo.addItems(["Serial", "WiFi"])
        self.mode_combo.setCurrentText(self.connection_mode)
        self.mode_combo.currentTextChanged.connect(self._on_mode_change)
        form.addRow("Mode", self.mode_combo)

        # Serial settings group
        self.serial_group = QtWidgets.QWidget()
        serial_form = QtWidgets.QFormLayout(self.serial_group)
        serial_form.setContentsMargins(0,0,0,0)
        self.port_combo = QtWidgets.QComboBox()
        serial_form.addRow("COM Port", self.port_combo)
        self.baud_input = QtWidgets.QLineEdit(str(self.baud))
        serial_form.addRow("Baud", self.baud_input)
        form.addRow(self.serial_group)

        # WiFi settings group
        self.wifi_group = QtWidgets.QWidget()
        wifi_form = QtWidgets.QFormLayout(self.wifi_group)
        wifi_form.setContentsMargins(0,0,0,0)
        ip_layout = QtWidgets.QHBoxLayout()
        ip_layout.setContentsMargins(0,0,0,0)
        self.ip_input = QtWidgets.QLineEdit(self.target_ip)
        self.btn_auto_ip = QtWidgets.QPushButton("Get IP")
        self.btn_auto_ip.clicked.connect(self._auto_local_ip)
        ip_layout.addWidget(self.ip_input)
        ip_layout.addWidget(self.btn_auto_ip)
        wifi_form.addRow("Target IP", ip_layout)
        self.port_input = QtWidgets.QLineEdit(str(self.target_port))
        wifi_form.addRow("Target Port", self.port_input)
        form.addRow(self.wifi_group)

        # sample rate (common)
        self.rate_input = QtWidgets.QLineEdit(str(self.sample_rate))
        form.addRow("Sample rate (Hz)", self.rate_input)
        left_layout.addLayout(form)

        # Initial visibility
        h = QtWidgets.QHBoxLayout()
        self.btn_refresh = QtWidgets.QPushButton("Refresh ports")
        self.btn_refresh.clicked.connect(self.update_port_list)
        h.addWidget(self.btn_refresh)
        self.btn_start = QtWidgets.QPushButton("Start")
        self.btn_start.clicked.connect(self.start_stream)
        h.addWidget(self.btn_start)
        self.btn_stop = QtWidgets.QPushButton("Stop")
        self.btn_stop.setEnabled(False)
        self.btn_stop.clicked.connect(self.stop_stream)
        h.addWidget(self.btn_stop)
        left_layout.addLayout(h)

        self._on_mode_change(self.connection_mode)

        # plotting options
        left_layout.addSpacing(10)
        left_layout.addWidget(QtWidgets.QLabel("<b>Display</b>"))
        self.autoscale_chk = QtWidgets.QCheckBox("Autoscale Y")
        self.autoscale_chk.setChecked(True)
        left_layout.addWidget(self.autoscale_chk)
        left_layout.addWidget(QtWidgets.QLabel("Y min / max (manual)"))
        ymin_layout = QtWidgets.QHBoxLayout()
        self.ylim_min = QtWidgets.QLineEdit("-1")
        self.ylim_max = QtWidgets.QLineEdit("1")
        ymin_layout.addWidget(self.ylim_min)
        ymin_layout.addWidget(self.ylim_max)
        left_layout.addLayout(ymin_layout)

        left_layout.addStretch()
        # save config button
        save_btn = QtWidgets.QPushButton("Save config")
        save_btn.clicked.connect(self.save_config)
        left_layout.addWidget(save_btn)

        # Put left_content into a QScrollArea so controls remain accessible at all sizes.
        left_scroll = QtWidgets.QScrollArea()
        left_scroll.setWidgetResizable(True)
        left_scroll.setWidget(left_content)
        left_scroll.setMinimumWidth(320)   # nice starting width but not fixed
        left_scroll.setMaximumWidth(520)   # prevents it from taking too much space on ultra-wide screens

        # Right pane: plots + console
        right = QtWidgets.QWidget()
        right_layout = QtWidgets.QVBoxLayout(right)
        right_layout.setContentsMargins(6, 6, 6, 6)
        right_layout.setSpacing(8)
        # plots
        # Use simple custom axis for Y to avoid long floats
        ax0 = CustomAxisItem(orientation='left')
        ax1 = CustomAxisItem(orientation='left')
        self.plot0 = pg.PlotWidget(title="Channel 0", axisItems={'left': ax0})
        self.plot1 = pg.PlotWidget(title="Channel 1", axisItems={'left': ax1})
        self.plot0.showGrid(x=True, y=True)
        self.plot1.showGrid(x=True, y=True)
        self.curve0 = self.plot0.plot(pen=pg.mkPen('c', width=1.4))
        self.curve1 = self.plot1.plot(pen=pg.mkPen('y', width=1.4))
        right_layout.addWidget(self.plot0, 1)
        right_layout.addWidget(self.plot1, 1)

        # console log
        self.console = QtWidgets.QPlainTextEdit()
        self.console.setReadOnly(True)
        self.console.setMaximumHeight(160)
        right_layout.addWidget(self.console)

        # Add both panes to main layout. Right pane gets stretch weight so it expands more.
        layout.addWidget(left_scroll, 0)
        layout.addWidget(right, 1)

    def _build_channel_controls(self, ch_index):
        widget = QtWidgets.QWidget()
        v = QtWidgets.QVBoxLayout(widget)
        # EMG buttons
        emg_box = QtWidgets.QGroupBox("EMG actions")
        emg_layout = QtWidgets.QHBoxLayout()
        b_light = QtWidgets.QPushButton("Light (A)")
        b_med = QtWidgets.QPushButton("Medium (S)")
        b_str = QtWidgets.QPushButton("Strong (D)")
        emg_layout.addWidget(b_light); emg_layout.addWidget(b_med); emg_layout.addWidget(b_str)
        emg_box.setLayout(emg_layout)
        for button, intensity in ((b_light, "light"), (b_med, "medium"), (b_str, "strong")):
            button.pressed.connect(lambda ch=ch_index, level=intensity: self._emg_hold_start(ch, level))
            button.released.connect(lambda ch=ch_index, level=intensity: self._emg_hold_stop(ch, level))
        v.addWidget(emg_box)

        # EEG Brain States & Waves
        brain_box = QtWidgets.QGroupBox("Brain State & Waves (EEG)")
        brain_layout = QtWidgets.QVBoxLayout()
        
        # State Selector
        state_h = QtWidgets.QHBoxLayout()
        state_h.addWidget(QtWidgets.QLabel("State:"))
        state_combo = QtWidgets.QComboBox()
        state_combo.addItems(["Neutral", "Focus", "Calm", "Stress", "Drowsy", "Deep Sleep"])
        state_h.addWidget(state_combo)
        brain_layout.addLayout(state_h)
        
        # Wave Sliders
        sliders_layout = QtWidgets.QGridLayout()
        self.band_sliders = getattr(self, "band_sliders", [{}, {}])
        
        for i, band in enumerate(["delta", "theta", "alpha", "beta", "gamma"]):
            lbl = QtWidgets.QLabel(band.capitalize())
            sld = QtWidgets.QSlider(QtCore.Qt.Horizontal)
            sld.setRange(0, 100)
            sld.setValue(int(self.ch_gens[ch_index].band_powers[band] * 100))
            
            # Label for value
            val_lbl = QtWidgets.QLabel(f"{self.ch_gens[ch_index].band_powers[band]:.2f}")
            val_lbl.setFixedWidth(30)
            
            def on_sld_change(val, b=band, ch=ch_index, vl=val_lbl):
                p = val / 100.0
                self.ch_gens[ch].set_band_power(b, p)
                vl.setText(f"{p:.2f}")

            sld.valueChanged.connect(on_sld_change)
            
            sliders_layout.addWidget(lbl, i, 0)
            sliders_layout.addWidget(sld, i, 1)
            sliders_layout.addWidget(val_lbl, i, 2)
            self.band_sliders[ch_index][band] = (sld, val_lbl)

        brain_layout.addLayout(sliders_layout)
        
        def on_state_change(text, ch=ch_index):
            self.ch_gens[ch].set_brain_state(text)
            # Update sliders to match state
            for b, (s, vl) in self.band_sliders[ch].items():
                p = self.ch_gens[ch].band_powers[b]
                s.blockSignals(True)
                s.setValue(int(p * 100))
                s.blockSignals(False)
                vl.setText(f"{p:.2f}")

        state_combo.currentTextChanged.connect(on_state_change)
        brain_box.setLayout(brain_layout)
        v.addWidget(brain_box)

        # SSVEP Box (moved below Brain States)
        ssvep_box = QtWidgets.QGroupBox("SSVEP (EEG)")
        ssvep_layout = QtWidgets.QHBoxLayout()
        
        spin = QtWidgets.QDoubleSpinBox()
        spin.setRange(1.0, 60.0)
        spin.setValue(10.0)
        spin.setDecimals(1)
        spin.setSuffix(" Hz")
        spin.setFixedWidth(80)
        
        btn = QtWidgets.QPushButton("Set")
        btn.setCheckable(True)
        btn.setStyleSheet("font-weight: bold;")
        
        def on_ssvep_toggle(checked, ch=ch_index, s=spin, b=btn):
            freq = s.value() if checked else None
            enabled = checked
            self.ch_gens[ch].toggle_ssvep(freq, enabled=enabled)
            b.setText("Stop" if checked else "Set")
            b.setStyleSheet("font-weight: bold; background-color: #ff4444;" if checked else "font-weight: bold;")
            s.setEnabled(not checked)

        btn.clicked.connect(on_ssvep_toggle)
        ssvep_layout.addWidget(spin)
        ssvep_layout.addWidget(btn)
        
        ssvep_box.setLayout(ssvep_layout)
        v.addWidget(ssvep_box)

        # EOG controls
        eog_box = QtWidgets.QGroupBox("EOG actions")
        eog_layout = QtWidgets.QHBoxLayout()
        for name in ["Left", "Right", "Up", "Down", "Blink"]:
            b = QtWidgets.QPushButton(name)
            b.clicked.connect(lambda _checked, ch=ch_index, n=name.lower(): self._eog_action(ch, n))
            eog_layout.addWidget(b)
        eog_box.setLayout(eog_layout)
        v.addWidget(eog_box)

        return widget

    def _on_map_change(self, ch, text):
        self.log(f"Mapping ch{ch} -> {text}")
        self.ch_gens[ch].set_role(text)
        
        # Update Labels
        lbl_map = getattr(self, f"lbl_ch{ch}")
        ctrl_lbl = getattr(self, f"lbl_ctrl_ch{ch}")
        
        if text == "EEG":
            pos = "FP1" if ch == 0 else "FP2"
            lbl_map.setText(f"Channel {ch} ({pos})")
            ctrl_lbl.setText(f"Channel {ch} ({pos}) controls")
        else:
            lbl_map.setText(f"Channel {ch}")
            ctrl_lbl.setText(f"Channel {ch} controls")

    def _emg_action(self, ch, intensity):
        self.log(f"EMG trigger ch{ch} intensity={intensity}")
        self.ch_gens[ch].trigger_emg(intensity)

    def _emg_hold_start(self, ch, intensity):
        self.log(f"EMG hold start ch{ch} intensity={intensity}")
        self.ch_gens[ch].start_emg_hold(intensity)

    def _emg_hold_stop(self, ch, intensity):
        if self.ch_gens[ch].stop_emg_hold(intensity=intensity, keep_min_duration=True):
            self.log(f"EMG hold end ch{ch} intensity={intensity}")

    def _keyboard_emg_targets(self):
        return [ch for ch, generator in enumerate(self.ch_gens) if generator.role == "EMG"]

    def _should_handle_emg_key(self):
        focus_widget = QtWidgets.QApplication.focusWidget()
        blocked_types = (
            QtWidgets.QLineEdit,
            QtWidgets.QPlainTextEdit,
            QtWidgets.QTextEdit,
            QtWidgets.QComboBox,
            QtWidgets.QAbstractSpinBox,
        )
        return not isinstance(focus_widget, blocked_types)

    def _handle_emg_key_press(self, event):
        if event.isAutoRepeat() or not self.isActiveWindow() or not self._should_handle_emg_key():
            return False

        key = int(event.key())
        intensity = self._emg_keymap.get(key)
        if intensity is None or key in self._active_emg_keys:
            return False

        targets = self._keyboard_emg_targets()
        if not targets:
            self.log("Keyboard EMG ignored: no channel is mapped to EMG")
            return True

        self._active_emg_keys[key] = [(ch, intensity) for ch in targets]
        for ch in targets:
            self._emg_hold_start(ch, intensity)
        return True

    def _handle_emg_key_release(self, event):
        if event.isAutoRepeat() or not self.isActiveWindow():
            return False

        key = int(event.key())
        active_targets = self._active_emg_keys.pop(key, None)
        if not active_targets:
            return False

        for ch, intensity in active_targets:
            self._emg_hold_stop(ch, intensity)
        return True

    def _clear_emg_holds(self):
        self._active_emg_keys.clear()
        for ch, generator in enumerate(self.ch_gens):
            if generator.clear_emg_hold():
                self.log(f"EMG hold cleared ch{ch}")

    def eventFilter(self, watched, event):
        if event.type() == QtCore.QEvent.Type.KeyPress and self._handle_emg_key_press(event):
            return True
        if event.type() == QtCore.QEvent.Type.KeyRelease and self._handle_emg_key_release(event):
            return True
        return super().eventFilter(watched, event)

    def _eog_action(self, ch, name):
        self.log(f"EOG trigger ch{ch} dir={name}")
        self.ch_gens[ch].trigger_eog(name)

    def _ssvep_toggle(self, ch, freq, checked):
        if checked:
            self.log(f"SSVEP ch{ch} freq={freq}Hz ON")
            self.ch_gens[ch].toggle_ssvep(freq, enabled=True)
        else:
            # Only disable if NO buttons are checked in this group
            any_on = any(b.isChecked() for b in self.ssvep_groups[ch].buttons())
            if not any_on:
                self.log(f"SSVEP ch{ch} OFF")
                self.ch_gens[ch].toggle_ssvep(None, enabled=False)

    def _on_mode_change(self, mode):
        is_serial = (mode == "Serial")
        self.serial_group.setVisible(is_serial)
        self.wifi_group.setVisible(not is_serial)
        self.btn_refresh.setEnabled(is_serial)

    def update_port_list(self):
        self.port_combo.clear()
        ports = []
        if list_ports:
            try:
                print(f"[{datetime.now()}] calling list_ports.comports()...")
                ports = [p.device for p in list_ports.comports()]
                print(f"[{datetime.now()}] list_ports.comports() returned {len(ports)} ports")
            except Exception as e:
                print(f"[{datetime.now()}] Error listing ports: {e}")
                ports = []
        self.port_combo.addItems([""] + ports)

    def _auto_local_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            self.ip_input.setText(ip)
            self.log(f"Auto-filled local IP: {ip}")
        except Exception as e:
            self.log(f"Failed to get local IP: {e}")
            self.ip_input.setText("127.0.0.1")

    def _build_plot(self):
        # rolling buffers for plotting
        self.plot_len = int(self.sample_rate * 4)  # 4 seconds buffer
        self.buf0 = np.zeros(self.plot_len, dtype=float)
        self.buf1 = np.zeros(self.plot_len, dtype=float)
        self.ptr = 0

    def _on_timer(self):
        # update plots from buffers
        if not getattr(self, "_timer_logged", False):
            print(f"[{datetime.now()}] First _on_timer call")
            self._timer_logged = True

        # drain queue
        new_data0 = []
        new_data1 = []
        while True:
            try:
                v0, v1 = self.plot_queue.get_nowait()
                new_data0.append(v0)
                new_data1.append(v1)
            except queue.Empty:
                break
        
        n = len(new_data0)
        if n > 0:
            # Shift buffers and append new data
            # Doing this in main thread is safe
            if n >= self.plot_len:
                self.buf0 = np.array(new_data0[-self.plot_len:], dtype=float)
                self.buf1 = np.array(new_data1[-self.plot_len:], dtype=float)
            else:
                self.buf0 = np.roll(self.buf0, -n)
                self.buf1 = np.roll(self.buf1, -n)
                self.buf0[-n:] = new_data0
                self.buf1[-n:] = new_data1
        
        self.curve0.setData(self.buf0)
        self.curve1.setData(self.buf1)
        
        # apply manual Y limits if needed
        if not self.autoscale_chk.isChecked():
            try:
                ymin = float(self.ylim_min.text()); ymax = float(self.ylim_max.text())
                self.plot0.setYRange(ymin, ymax, padding=0)
                self.plot1.setYRange(ymin, ymax, padding=0)
            except Exception:
                pass

    def start_stream(self):
        if self.streaming:
            return
        # get values
        self.port = self.port_combo.currentText().strip()
        try:
            self.baud = int(self.baud_input.text().strip())
            self.sample_rate = float(self.rate_input.text().strip())
        except Exception:
            QtWidgets.QMessageBox.warning(self, "Invalid", "Please enter valid baud and sample rate")
            return

        # re-initialize plot buffers with new sample rate if it changed
        self._build_plot()

        # update generator rates
        for g in self.ch_gens:
            g.set_rate(self.sample_rate)
            g.set_scale(1.0)

        # prepare writer
        self.sample_queue = queue.Queue(maxsize=8192)
        mode = self.mode_combo.currentText()
        if mode == "Serial":
            self.stream_writer = SerialWriter(self.port, self.baud, self.sample_rate, channels=2,
                                              data_queue=self.sample_queue, binary=self.binary, quiet=False)
            target_str = self.port if self.port else 'LOOPBACK'
        else:
            ip = self.ip_input.text().strip()
            port = int(self.port_input.text().strip())
            self.stream_writer = TCPWriter(ip, port, self.sample_rate, self.sample_queue)
            target_str = f"WiFi ({ip}:{port})"
            
        params = BrainFlowInputParams()
        self.board = BoardShim(BoardIds.SYNTHETIC_BOARD, params)
        self.board.prepare_session()
        self.board.start_stream()

        self.stream_writer.start()
        self.streaming = True
        self.btn_start.setEnabled(False)
        self.btn_stop.setEnabled(True)
        self.log(f"Streaming started on {target_str}")
        # start pushing samples from generator loop (already running)

    def stop_stream(self):
        if not self.streaming:
            return

        self._clear_emg_holds()
        
        # 1. Clear queue to prevent "hangover" data
        with self.sample_queue.mutex:
            self.sample_queue.queue.clear()
            
        # 2. Stop writer
        if self.stream_writer:
            self.stream_writer.stop()
            # Join with timeout to avoid freezing UI if writer is stuck
            self.stream_writer.join(timeout=0.5)
            self.stream_writer = None
            
        if self.board:
            try:
                self.board.stop_stream()
                self.board.release_session()
            except Exception as e:
                print(f"Error closing board: {e}")
            self.board = None
            
        self.streaming = False
        self.btn_start.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.log("Streaming stopped")

    def _generator_loop(self):
        """Background loop that produces samples at sample_rate and enqueues them for serial writer."""
        frame = 0
        bg_vals = [0.0, 0.0]
        
        while True:
            if self._gen_stop.is_set():
                break

            # Poll for background noise from BrainFlow if active
            if self.streaming and self.board:
                try:
                    data = self.board.get_board_data()
                    if data is not None and data.shape[1] > 0:
                        # Grab latest sample for each channel based on role
                        for i in range(2):
                            role = self.ch_gens[i].role
                            # Map role to synthetic board channels
                            # Indices are typical for SYNTHETIC_BOARD
                            if role == "EEG": 
                                idx = BoardShim.get_eeg_channels(BoardIds.SYNTHETIC_BOARD)[i % 8]
                            elif role == "EMG":
                                idx = BoardShim.get_emg_channels(BoardIds.SYNTHETIC_BOARD)[i % 2]
                            elif role == "EOG":
                                idx = BoardShim.get_eog_channels(BoardIds.SYNTHETIC_BOARD)[i % 2]
                            else:
                                idx = -1
                            
                            if idx != -1:
                                bg_vals[i] = data[idx, -1] # Latest value in uV
                except Exception:
                    pass

            # Use a monotonic origin per run to feed channel gens (for sleep timing)
            origin = getattr(self, "_gen_origin", None)
            if origin is None:
                self._gen_origin = time.perf_counter()
                origin = self._gen_origin
                
            # Use perfect discrete time steps to avoid sine-wave phase jitter
            t_seconds = frame / max(1.0, self.sample_rate)
            
            # synth values using triggers AND background noise
            v0 = self.ch_gens[0].synth_now(t_seconds, bg_vals[0])
            v1 = self.ch_gens[1].synth_now(t_seconds, bg_vals[1])

            # map normalized [-5..5] -> 14-bit ADC (PRECISION FORMAT)
            a0 = int(round(((v0 + DEFAULT_RANGE) / (2.0 * DEFAULT_RANGE)) * ADC_MAX))
            a1 = int(round(((v1 + DEFAULT_RANGE) / (2.0 * DEFAULT_RANGE)) * ADC_MAX))
            
            # Ensure physical bounds
            a0 = max(0, min(ADC_MAX, a0))
            a1 = max(0, min(ADC_MAX, a1))

            self._append_plot(v0, v1)
            
            if self.streaming and self.stream_writer:
                try:
                    self.sample_queue.put_nowait((a0, a1, time.time()))
                except queue.Full:
                    pass

            frame += 1
            next_target = origin + frame / max(1.0, self.sample_rate)
            sleep_time = next_target - time.perf_counter()
            if sleep_time > 0:
                time.sleep(sleep_time)
            elif frame % 100 == 0:
                time.sleep(0.001)

    def _append_plot(self, v0, v1):
        # Enqueue for main thread to handle
        try:
            self.plot_queue.put_nowait((v0, v1))
        except queue.Full:
            pass

    def log(self, s):
        now = datetime.now().strftime("%H:%M:%S")
        msg = f"[{now}] {s}"
        self.console.appendPlainText(msg)
        if hasattr(self, 'left_console'):
            self.left_console.appendPlainText(msg)
            # Auto-scroll
            sb = self.left_console.verticalScrollBar()
            sb.setValue(sb.maximum())
        # also print to stdout
        print(f"[{now}] {s}")

    def closeEvent(self, event):
        # stop threads
        self._gen_stop.set()
        self._clear_emg_holds()
        app = QtWidgets.QApplication.instance()
        if app is not None:
            app.removeEventFilter(self)
        if self.stream_writer:
            self.stream_writer.stop()
            self.stream_writer.join(timeout=0.5)
        event.accept()

# -------------------------
# Run
# -------------------------
def main():
    try:
        print(f"[{datetime.now()}] Starting {APP_NAME}...")
        print(f"[{datetime.now()}] Config path: {CONFIG_PATH.resolve()}")
        app = QtWidgets.QApplication(sys.argv)
        win = MainWindow()
        win.show()
        print(f"[{datetime.now()}] Window shown, entering event loop.")
        ret = app.exec()
        print(f"[{datetime.now()}] Event loop exited with {ret}")
        sys.exit(ret)
    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
        print(f"CRITICAL ERROR: {err_msg}")
        try:
            with open("error.log", "w") as f:
                f.write(err_msg)
        except:
            pass
        sys.exit(1)

if __name__ == "__main__":
    main()