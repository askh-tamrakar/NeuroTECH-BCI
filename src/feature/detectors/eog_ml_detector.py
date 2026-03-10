import joblib
import pandas as pd
import numpy as np
from pathlib import Path
from collections import Counter

class EOGMLDetector:
    """
    Classifies EOG features using a pre-trained Random Forest model.
    Replaces the rule-based BlinkDetector when an ML model is active.
    """
    
    def __init__(self, config: dict):
        self.config = config
        self.model = None
        self.scaler = None
        
        # Configuration
        # We can reuse RPS thresholds or define new ones if needed
        # For blinking, we usually want discrete events, so exact classification is key
        
        self.load_model()
        
    def load_model(self, model_name=None, verbose=True):
        try:
            # If no model name provided, check config for current active model
            if model_name is None:
                try:
                    from src.utils.config import config_manager
                    model_name = config_manager.get_active_model('EOG')
                except ImportError:
                    # Fallback if config_manager not easily accessible (should not happen in router)
                    model_name = None
                    
            if not model_name:
                # Fallback to default name
                model_name = "eog_rf"

            # Locate model paths relative to project root
            # This file is in src/feature/detectors
            project_root = Path(__file__).resolve().parent.parent.parent.parent
            models_dir = project_root / "frontend" / "public" / "data" / "EOG" / "models"
            
            clean_name = "".join([c for c in model_name if c.isalnum() or c in ('_', '-')])
            
            model_path = models_dir / f"{clean_name}.joblib"
            scaler_path = models_dir / f"{clean_name}_scaler.joblib"
            
            if model_path.exists() and scaler_path.exists():
                self.model = joblib.load(model_path)
                self.scaler = joblib.load(scaler_path)
                if verbose:
                    print(f"\n{'='*50}\n[EOGMLDetector] ✅ MODEL LOADED SUCCESSFULLY: {model_name}\n{'='*50}\n", flush=True)
            else:
                if verbose:
                    missing = []
                    if not model_path.exists(): missing.append(f"Model ({model_path.name})")
                    if not scaler_path.exists(): missing.append(f"Scaler ({scaler_path.name})")
                    print(f"[EOGMLDetector] ❌ [ERROR] Model files missing for {model_name}: {', '.join(missing)}")
                    print(f"               Searched in: {models_dir}")
                # We can choose to keep previous model or set to None
                # self.model = None 
                pass
                
        except Exception as e:
            print(f"[EOGMLDetector] ❌ [FATAL] Error loading model {model_name}: {e}")
        
    def predict_class(self, features: dict) -> str | None:
        """
        Predict label from features.
        Returns: Label String (e.g. 'SingleBlink', 'DoubleBlink') or None if Unknown/Rest
        """
        if not self.model or not self.scaler:
             # Fallback to rule-based or return None?
             # For now return None so we don't emit false positives
             return None
             
        try:
            # 1. Prepare Feature Vector (Must match training order in eog_trainer.py)
            feature_cols = [
                'amplitude', 'duration_ms', 'rise_time_ms', 'fall_time_ms',
                'asymmetry', 'peak_count', 'kurtosis', 'skewness'
            ]
            
            row = []
            for col in feature_cols:
                val = features.get(col, 0.0)
                row.append(val)
            
            # 2. Scale
            X = pd.DataFrame([row], columns=feature_cols)
            X_scaled = self.scaler.transform(X)
            
            # 3. Predict PROBABILITY
            probs = self.model.predict_proba(X_scaled)[0]
            pred_idx = np.argmax(probs)
            confidence = probs[pred_idx]
            
            label_map = {0: 'Rest', 1: 'SingleBlink', 2: 'DoubleBlink'}
            
            pred_label = label_map.get(int(self.model.classes_[pred_idx]), 'Unknown')
            
            print(f"[EOGMLDetector] Probs: {probs} (Classes: {self.model.classes_}) -> Prediction: {pred_label} ({confidence:.2f})")
            
            if pred_label == 'Rest' or pred_label == 'Unknown':
                return None
                
            return pred_label

        except Exception as e:
            print(f"[EOGMLDetector] Prediction Error: {e}")
            return None

    def detect(self, features: dict) -> str | None:
        """
        Main entry point for Router.
        Receive features from Extractor (already means a blink-like event happened).
        Classify it.
        """

        # The Extractor only emits when a potential blink is detected.
        # So we just classify it.
        print("detecting by ML ")
        return self.predict_class(features)

    def update_config(self, config: dict):
        self.config = config
        # Reload model if active model changed? 
        # FeatureRouter handles this by re-instantiating, or we can check here.
        # But FeatureRouter re-instantiates the whole pipeline on config change.
        # So we don't need to do anything here if FeatureRouter does its job.
        pass
