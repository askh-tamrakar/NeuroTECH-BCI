class EEGFrequencyDetector:
    """
    Detects if specific EEG frequency bands exceed a defined threshold.
    
    === EEG FREQUENCY WAVE LIMITS (REFERENCE) ===
    - Delta : 0.5 - 4.0 Hz   (Deep sleep, Unconscious)
    - Theta : 4.0 - 8.0 Hz   (Meditation, Light sleep)
    - Alpha : 8.0 - 13.0 Hz  (Relaxed, Awake but eyes closed)
    - Beta  : 13.0 - 30.0 Hz (Active thinking, Focus)
    - Gamma : 30.0 - 100.0 Hz (High cognitive processing)
    """
    
    def __init__(self, config: dict):
        self.config = config
        self.wave_thresholds = {}
        self.debounce_ms = 100
        self.last_event_ts = 0.0
        self._load_config()
        
    def _load_config(self):
        eeg_config = self.config.get("features", {}).get("EEG", {})
        
        # Debounce timing (e.g., from FOCUS_DEBOUNCE_MS)
        self.debounce_ms = eeg_config.get("debounce_ms", 100)
        
        # Amplitude Limits / Thresholds for each frequency wave
        # Taking reference from the image structure (e.g., BETA_THRESHOLD = 2.0)
        self.wave_thresholds = eeg_config.get("wave_thresholds", {
            "bp_delta": 50.0,   # Lower limit threshold for Delta power
            "bp_theta": 30.0,   # Lower limit threshold for Theta power
            "bp_alpha": 15.0,   # Lower limit threshold for Alpha power 
            "bp_beta": 2.0,     # Lower limit threshold for Beta power
            "bp_gamma": 1.0     # Lower limit threshold for Gamma power
        })
        
    def detect(self, features: dict) -> str | None:
        """
        Check if any extracted frequency wave feature exceeds its limit.
        """
        if not features or not self.wave_thresholds:
            return None
            
        import time
        current_time = time.time()
        
        # Apply Debounce
        if (current_time - self.last_event_ts) * 1000 < self.debounce_ms:
            return None
            
        best_event = None
        max_margin = -1.0
        
        for feat_name, threshold in self.wave_thresholds.items():
            if feat_name in features:
                val = features[feat_name]
                if val >= threshold:
                    margin = val - threshold
                    if margin > max_margin:
                        max_margin = margin
                        best_event = f"HIGH_{feat_name.upper()}"
        
        if best_event:
            self.last_event_ts = current_time
            print(f"[EEGFrequencyDetector] Detected: {best_event}")
            return best_event
            
        return None

    def update_config(self, config: dict):
        self.config = config
        self._load_config()
