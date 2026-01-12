import logging
from pathlib import Path
from collections import Counter

logger = logging.getLogger(__name__)

try:
    import joblib
    import pandas as pd
    import numpy as np
    ML_AVAILABLE = True
except ImportError as e:
    logger.warning(f"ML Dependencies missing: {e}. RPS Detection disabled.")
    ML_AVAILABLE = False

class RPSDetector:
    """
    Classifies EMG features into Rock, Paper, or Scissors gestures.
    Uses a pre-trained Random Forest model.
    """
    
    def __init__(self, config: dict = None):
        self.config = config or {}
        self.model = None
        self.scaler = None
        
        # State tracking for candidate-based detection
        self.collecting_candidates = False
        self.candidates = []
        self.last_active_ts = 0.0
        
        # Configuration for state machine
        rps_cfg = self.config.get("features", {}).get("RPS", {})
        self.confidence_threshold = rps_cfg.get("confidence_threshold", 0.6)
        
        self._load_model()
        
    def _load_model(self):
        if not ML_AVAILABLE:
            return

        try:
            # backend/analysis/ml/rps_detector.py
            # parent -> ml
            # parent.parent -> analysis
            # parent.parent.parent -> backend
            
            current_file = Path(__file__).resolve()
            backend_root = current_file.parents[2] 
            
            models_dir = backend_root / "data" / "models"
            
            model_path = models_dir / "emg_rf.joblib"
            scaler_path = models_dir / "emg_scaler.joblib"
            
            if model_path.exists() and scaler_path.exists():
                self.model = joblib.load(model_path)
                self.scaler = joblib.load(scaler_path)
                logger.info(f"[RPSDetector] [OK] Loaded ML Model from {model_path}")
            else:
                logger.warning(f"[RPSDetector] [WARN] Model not found at {model_path}")
                
        except Exception as e:
            logger.error(f"[RPSDetector] [ERROR] Error loading model: {e}")
        
    def _predict_instant(self, features: dict) -> tuple[str, float]:
        if not ML_AVAILABLE or not self.model or not self.scaler:
             return "Unknown", 0.0
             
        try:
            feature_cols = ['rms', 'mav', 'var', 'wl', 'peak', 'range', 'iemg', 'entropy', 'energy', 'kurtosis', 'skewness', 'ssc', 'wamp']
            
            row = []
            for col in feature_cols:
                val = features.get(col, 0.0)
                if col == 'range' and 'range' not in features and 'rng' in features:
                   val = features['rng']
                row.append(val)
            
            X = pd.DataFrame([row], columns=feature_cols)
            X_scaled = self.scaler.transform(X)
            
            probs = self.model.predict_proba(X_scaled)[0]
            pred_idx = np.argmax(probs)
            confidence = probs[pred_idx]
            
            pred_label_int = self.model.classes_[pred_idx]
            label_map = {0: 'Rest', 1: 'Rock', 2: 'Paper', 3: 'Scissors'}
            
            if isinstance(pred_label_int, str):
                 pred_label_str = pred_label_int
            else:
                 pred_label_str = label_map.get(int(pred_label_int), 'Unknown')

            return pred_label_str, confidence

        except Exception as e:
            logger.error(f"[RPSDetector] Prediction Error: {e}")
            return "Error", 0.0

    def detect(self, features: dict) -> str | None:
        label, confidence = self._predict_instant(features)
        
        is_confident = confidence > self.confidence_threshold
        is_active = is_confident and label in ['Rock', 'Paper', 'Scissors']
        is_rest = is_confident and label == 'Rest'
        
        if is_active:
            if not self.collecting_candidates:
                self.collecting_candidates = True
                self.candidates = []
            
            self.candidates.append(label)
            return None 
            
        elif is_rest:
            if self.collecting_candidates:
                if self.candidates:
                    counts = Counter(self.candidates)
                    most_common = counts.most_common(1)[0][0]
                    self.collecting_candidates = False
                    self.candidates = []
                    return most_common
                else:
                    self.collecting_candidates = False
                    return "Rest"
            else:
                return "Rest"
        else:
            return None
