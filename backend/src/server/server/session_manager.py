from src.database.db_manager import db_manager

class SessionManager:
    def __init__(self):
        self.reset()
    
    def reset(self):
        self.is_recording = False
        self.recording_type = None  # 'EMG' or 'EOG'
        self.current_label = None
        
        # New: Store current session table
        self.current_session_name = None
        self.current_table_name = None
        
        self.data_store = {
            'EMG': {},
            'EOG': {}
        }
        # Counts per label
        self.counts = {
            'EMG': {},
            'EOG': {}
        }
        self.prediction_active = {
            'EMG': False,
            'EOG': False
        }
        
    def start_recording(self, sensor_type, label, session_name="Default"):
        self.is_recording = True
        self.recording_type = sensor_type
        self.current_label = label
        # self.current_session_name = session_name # Removed logic to store name directly if not needed, but kept for safe-keeping
        self.current_session_name = session_name
        
        # Create/Get Table immediately
        # Note: We do this synchronously; in prod maybe async? 
        # SQLite is fast enough.
        self.current_table_name = db_manager.create_session_table(sensor_type, session_name)
        print(f"Started {sensor_type} rec on table: {self.current_table_name}")

        if label not in self.counts[sensor_type]:
            self.counts[sensor_type][label] = 0
            self.data_store[sensor_type][label] = []
            
    def stop_recording(self):
        # Mark recording as stopped but keep session/table metadata until the
        # caller finishes post-processing and persists the buffered windows.
        self.is_recording = False
        return self.current_table_name
        
    def reset_recording_state(self):
        self.is_recording = False
        self.recording_type = None
        self.current_label = None
        self.current_session_name = None
        self.current_table_name = None
        
    def add_sample(self, sensor_type, sample):
        if not self.is_recording or self.recording_type != sensor_type:
            return
            
        label = self.current_label
        if label is not None:
            self.data_store[sensor_type][label].append(sample)
            self.counts[sensor_type][label] += 1
            
    def clear_data(self, sensor_type):
        self.data_store[sensor_type] = {}
        self.counts[sensor_type] = {}

    def get_status(self, sensor_type):
        return {
            "recording": self.is_recording and self.recording_type == sensor_type,
            "current_label": self.current_label if self.recording_type == sensor_type else "",
            "counts": self.counts.get(sensor_type, {}),
            "session": self.current_session_name if self.recording_type == sensor_type else None
        }
