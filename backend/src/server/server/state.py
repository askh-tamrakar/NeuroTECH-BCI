import collections

from src.server.server.session_manager import SessionManager

class WebServerState:
    def __init__(self):
        self.inlet = None
        self.event_inlet = None
        self.channel_mapping = {}
        self.running = False
        self.connected = False
        self.sample_count = 0
        self.clients = 0
        self.sr = 512 # Default, will be updated from inlet
        self.num_channels = 0
        self.config = {}
        self.rps_detector = None
        self.emg_buffer = collections.deque(maxlen=512) # 1 second buffer at 512Hz
        self.last_pred_time = 0
        self.session = SessionManager()

        # Hybrid recording (server-side CSV + metadata.json)
        self.hybrid_recorder = None      # HybridRecorder instance
        self.recording_service = None    # RecordingService instance
        self.muscle_strength_extractors = {}   # ch_idx -> MuscleStrengthExtractor
        self.muscle_melody_extractor = None    # MuscleMelodyExtractor (all EMG channels)

# Global instance
state = WebServerState()
