class BlinkDetector:
    """
    Classifies an event as a blink based on extracted features.
    Refactored to focus on robust amplitude and duration checks, removing brittle shape checks.
    """
    
    def __init__(self, config: dict):
        eog_cfg = config.get("features", {}).get("EOG", {})
        
        # Simplified thresholds
        self.min_duration = eog_cfg.get("min_duration_ms", 50.0)    # Relaxed from 100
        self.max_duration = eog_cfg.get("max_duration_ms", 800.0)   # Relaxed from 600
        self.threshold_amp = eog_cfg.get("amp_threshold", 300.0)    # Aligned with Extractor default
        
        # Debounce/Cooldown state
        self.last_detection_ts = 0.0
        self.cooldown_seconds = 0.1  # Reduced to minimize lag while keeping safety margin
        
    def detect(self, features: dict) -> str | None:
        """
        Decision logic based on features.
        Returns the event name if detected, else None.
        """
        if not features:
            return None
            
        dur = features.get("duration_ms", 0)
        amp = features.get("amplitude", 0)
        ts = features.get("timestamp", 0)
        peak_count = features.get("peak_count", 1)
        
        # Cooldown Check
        if (ts - self.last_detection_ts) < self.cooldown_seconds:
             return None

        # Robust Logic:
        # 1. Amplitude must be significant
        # 2. Duration must be physiological
        
        is_valid_amp = amp >= (self.threshold_amp * 0.8) # Allow slightly lower if extractor caught it
        is_valid_duration = self.min_duration <= dur <= self.max_duration
        
        print("detecting by thresholds...")
        if is_valid_amp and is_valid_duration:
            self.last_detection_ts = ts
            # Determine event type based on peak count
            if peak_count >= 2:
                return "DoubleBlink"
            return "SingleBlink"
            
        return None

    def update_config(self, config: dict):
        eog_cfg = config.get("features", {}).get("EOG", {})
        self.min_duration = eog_cfg.get("min_duration_ms", self.min_duration)
        self.max_duration = eog_cfg.get("max_duration_ms", self.max_duration)
        self.threshold_amp = eog_cfg.get("amp_threshold", self.threshold_amp)
