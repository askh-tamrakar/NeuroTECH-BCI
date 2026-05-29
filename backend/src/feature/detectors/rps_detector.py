import time
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
from collections import Counter

class RPSDetector:
    """
    Classifies EMG features into Rock, Paper, or Scissors gestures.
    Uses a pre-trained Random Forest model.
    
    Refactored to use a Candidate/State-based approach:
    - Buffers predictions while the gesture is active (not Rest).
    - Emits the most frequent prediction when the gesture returns to Rest.
    """
    
    def __init__(self, config: dict):
        self.config = config
        self.model = None
        self.scaler = None
        
        # State tracking for candidate-based detection
        self.collecting_candidates = False
        self.candidates = []
        self.last_active_ts = 0.0
        self.gesture_start_time = 0.0
        
        # Configuration for state machine
        rps_cfg = config.get("features", {}).get("RPS", {})
        self.confidence_threshold = rps_cfg.get("confidence_threshold", 0.6)
        
        self.load_model()
        
    def load_model(self, model_name=None, verbose=True):
        try:
            # If no model name provided, check config for current active model
            if model_name is None:
                from src.utils.config import config_manager
                model_name = config_manager.get_active_model('EMG') or "emg_rf"

            # Locate model paths via centralized data directory
            from src.utils.paths import get_models_dir
            models_dir = get_models_dir('EMG')
            
            clean_name = "".join([c for c in model_name if c.isalnum() or c in ('_', '-')])
            
            model_path = models_dir / f"{clean_name}.joblib"
            scaler_path = models_dir / f"{clean_name}_scaler.joblib"
            
            if model_path.exists() and scaler_path.exists():
                self.model = joblib.load(model_path)
                self.scaler = joblib.load(scaler_path)
                
                # Load metadata if exists
                meta_path = models_dir / f"{clean_name}_meta.json"
                self.metadata = {}
                if meta_path.exists():
                    import json
                    try:
                        with open(meta_path, 'r', encoding='utf-8') as f:
                            self.metadata = json.load(f)
                    except Exception as meta_err:
                        print(f"[RPSDetector] Error loading metadata: {meta_err}")
                
                if verbose:
                    shifts_count = len(self.metadata.get('calibration_shifts', {}))
                    print(f"\n{'='*50}\n[RPSDetector] 🔄 MODEL SWITCHED: {model_name} (Shifts: {shifts_count})\n{'='*50}\n", flush=True)
            else:
                print(f"[RPSDetector] [WARN] Model {model_name} not found at {model_path}")
                # Fallback to defaults? or keep previous?
                pass
                
        except Exception as e:
            print(f"[RPSDetector] [ERROR] Error loading model {model_name}: {e}")
        
    def predict_instant(self, features: dict) -> tuple[str, float]:
        """
        Helper: Make a single instant prediction from features.
        Returns: (Label, Confidence)
        """
        if not self.model or not self.scaler:
             return "Unknown", 0.0
             
        try:
            # 1. Prepare Feature Vector (Must match training order)
            # ['rms', 'mav', 'var', 'wl', 'peak', 'range', 'iemg', 'entropy', 'energy', 'kurtosis', 'skewness', 'ssc', 'wamp']
            feature_cols = ['rms', 'mav', 'var', 'wl', 'peak', 'range', 'iemg', 'entropy', 'energy', 'kurtosis', 'skewness', 'ssc', 'wamp']
            
            row = []
            rest_mean = getattr(self, 'metadata', {}).get('rest_mean_features', {}) if hasattr(self, 'metadata') else {}
            rest_std  = getattr(self, 'metadata', {}).get('rest_std_features', {})  if hasattr(self, 'metadata') else {}
            mvc       = getattr(self, 'metadata', {}).get('mvc_features', {})       if hasattr(self, 'metadata') else {}
            old_shifts = getattr(self, 'metadata', {}).get('calibration_shifts', {}) if hasattr(self, 'metadata') else {}
            for col in feature_cols:
                val = features.get(col, 0.0)
                # handle potential missing 'range' vs 'rng' if any
                if col == 'range' and 'range' not in features and 'rng' in features:
                   val = features['rng']

                if rest_mean and col in rest_mean:
                    # Stage 1: REST Z-Score normalization
                    val = (val - rest_mean[col]) / max(rest_std.get(col, 1e-6), 1e-6)
                    # Stage 2: MVC scaling
                    if mvc and col in mvc:
                        val = val / max(mvc[col], 1e-6)
                    # Stage 3: Clamp to [-5, 5]
                    val = float(np.clip(val, -5.0, 5.0))
                elif old_shifts and col in old_shifts:
                    # Backward-compat fallback for models calibrated with old shift system
                    val = val - old_shifts[col]

                row.append(val)
            
            # 2. VALIDATION (Robustness)
            # Check for NaN/Inf/None before passing to sklearn
            if any(v is None or not np.isfinite(v) for v in row):
                # Only log once or rarely to avoid spamming
                if not hasattr(self, '_last_err_time') or time.time() - self._last_err_time > 5.0:
                    print(f"[RPSDetector] [WARN] Invalid feature values detected: {row}")
                    self._last_err_time = time.time()
                return "Rest", 0.0
            
            # 3. Scale
            X = pd.DataFrame([row], columns=feature_cols)
            X_scaled = self.scaler.transform(X)
            
            # 4. Predict PROBABILITY
            probs = self.model.predict_proba(X_scaled)[0]
            pred_idx = np.argmax(probs)
            confidence = probs[pred_idx]
            
            pred_label_int = self.model.classes_[pred_idx]
            
            # Map back to String
            # 0: Rest, 1: Rock, 2: Paper, 3: Scissors
            label_map = {0: 'Rest', 1: 'Rock', 2: 'Paper', 3: 'Scissors'}
            
            if isinstance(pred_label_int, str):
                 pred_label_str = pred_label_int
            else:
                 pred_label_str = label_map.get(int(pred_label_int), 'Unknown')

            return pred_label_str, confidence

        except Exception as e:
            # Only log every 5s
            if not hasattr(self, '_last_err_time') or time.time() - self._last_err_time > 5.0:
                print(f"[RPSDetector] Prediction Error: {e}")
                self._last_err_time = time.time()
            return "Error", 0.0

    def detect(self, features: dict) -> tuple[str, str | None, str]:
        """
        Stateful detection logic:
        - If Rest -> Resolve any pending candidates.
        - If Gesture -> Add to candidates.
        Returns: (InstantLabel, ConfirmedLabel or None, DetectionState)
        """
        label, confidence = self.predict_instant(features)
        
        # Determine if this instant frame is "Active" (valid gesture) or "Rest"
        # Ignoring confidence threshold as per user request to rely purely on predicted label
        is_active = label in ['Rock', 'Paper', 'Scissors']
        is_rest = label == 'Rest' or label == 'Unknown'
        
        # Default state
        detection_state = "waiting"
        
        # State Machine
        if is_active:
            if not self.collecting_candidates:
                self.collecting_candidates = True
                self.candidates = []
                self.gesture_start_time = time.time()
            
            self.candidates.append(label)
            detection_state = "recording"

            # Auto-confirm if gesture is held for too long (prevents getting stuck)
            hold_duration = time.time() - self.gesture_start_time
            gesture_hold_timeout = self.config.get("features", {}).get("RPS", {}).get("gesture_hold_timeout", 1.5)
            if hold_duration >= gesture_hold_timeout and len(self.candidates) >= 5:
                valid_candidates = [c for c in self.candidates if c in ['Rock', 'Paper', 'Scissors']]
                if valid_candidates:
                    counts = Counter(valid_candidates)
                    most_common = counts.most_common(1)[0][0]
                    self.collecting_candidates = False
                    self.candidates = []
                    return label, most_common, "waiting"

            return label, None, detection_state # Don't emit confirmed move yet, but return instant label and state
            
        elif is_rest:
            if self.collecting_candidates:
                # End of a gesture, resolve it!
                if self.candidates:
                    valid_candidates = [c for c in self.candidates if c in ['Rock', 'Paper', 'Scissors']]
                    if valid_candidates:
                        counts = Counter(valid_candidates)
                        most_common = counts.most_common(1)[0][0]
                    else:
                        most_common = "Rest"
                    
                    self.collecting_candidates = False
                    self.candidates = []
                    # Return (InstantLabel, ConfirmedLabel, DetectionState)
                    return label, most_common, "waiting"
                else:
                    self.collecting_candidates = False
                    return label, "Rest", "waiting"
            else:
                return label, "Rest", "waiting"
                
        return label, None, "waiting"

    def update_config(self, config: dict):
        self.config = config
        rps_cfg = config.get("features", {}).get("RPS", {})
        self.confidence_threshold = rps_cfg.get("confidence_threshold", 0.6)
        # self.load_model() # Don't auto reload on config update unless specified?
