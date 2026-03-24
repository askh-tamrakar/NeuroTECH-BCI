import collections
from src.core.mode_manager import ModeManager

class WebServerState:
    def __init__(self):
        self.inlet = None
        self.event_inlet = None
        self.channel_mapping = {}
        self.running = False
        self.connected = False
        self.sample_count = 0
        self.clients = 0
        self.sr = 1000 # Default, will be updated from inlet
        self.num_channels = 0
        self.config = {}
        self.rps_detector = None
        self.emg_buffer = collections.deque(maxlen=1000) # 1 second buffer at 1kHz
        self.last_pred_time = 0
        self.session = None # Assigned by main app or initialized here? Initialize in app setup.
        self.mode_manager = ModeManager()

# Global instance
state = WebServerState()
