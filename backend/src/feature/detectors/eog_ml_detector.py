import joblib
import pandas as pd
import numpy as np
from pathlib import Path
from src.utils.paths import get_models_dir

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
        self.last_confidence = 0.0
        self.feature_columns = [
            'amplitude', 'duration_ms', 'rise_time_ms', 'fall_time_ms',
            'asymmetry', 'peak_count', 'kurtosis', 'skewness'
        ]
        
        # Configuration
        # We can reuse RPS thresholds or define new ones if needed
        # For blinking, we usually want discrete events, so exact classification is key

        self.update_config(config)
        self.load_model()

    @staticmethod
    def _normalize_model_name(name: str) -> str:
        return "".join(ch.lower() for ch in str(name or "") if ch.isalnum())

    def _resolve_model_stem(self, models_dir: Path, model_name: str) -> str | None:
        """
        Resolve a requested model name against on-disk stems while being tolerant of
        spaces / hyphens / underscores. This keeps frontend labels like "dino ml"
        compatible with files such as "dino-ml.joblib".
        """
        requested = self._normalize_model_name(model_name)
        if not requested:
            return None

        direct_stem = "".join([c for c in model_name if c.isalnum() or c in ('_', '-')])
        if direct_stem and (models_dir / f"{direct_stem}.joblib").exists():
            return direct_stem

        for candidate in models_dir.glob("*.joblib"):
            if candidate.name.endswith("_scaler.joblib"):
                continue
            if self._normalize_model_name(candidate.stem) == requested:
                return candidate.stem

        return direct_stem or None
        
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
            models_dir = get_models_dir('EOG')

            # If default eog_rf is not found, use dino-ml which is the available EOG model
            if model_name == "eog_rf" and not (models_dir / "eog_rf.joblib").exists():
                 model_name = "dino-ml"
            
            clean_name = self._resolve_model_stem(models_dir, model_name)
            if not clean_name:
                clean_name = "".join([c for c in model_name if c.isalnum() or c in ('_', '-')])
            
            model_path = models_dir / f"{clean_name}.joblib"
            scaler_path = models_dir / f"{clean_name}_scaler.joblib"
            
            if model_path.exists() and scaler_path.exists():
                self.model = joblib.load(model_path)
                self.scaler = joblib.load(scaler_path)
                if self.online_adaptation_enabled:
                    try:
                        from src.calibration.calibration_manager import calibration_manager
                        calibration_manager.prime_eog_running_stats_from_scaler(self.scaler, self.feature_columns)
                    except Exception as exc:
                        if verbose:
                            print(f"[WARN] EOG online adaptation priming failed: {exc}")
                if verbose:
                    print(f"\n{'='*50}\n[EOGMLDetector] MODEL LOADED SUCCESSFULLY: {model_name}\n{'='*50}\n", flush=True)
            else:
                if verbose:
                    missing = []
                    if not model_path.exists(): missing.append(f"Model ({model_path.name})")
                    if not scaler_path.exists(): missing.append(f"Scaler ({scaler_path.name})")
                    print(f"[WARN] Model files missing for {model_name}: {', '.join(missing)}")
                    print(f"       Searched in: {models_dir}")
                    print(f"[INFO] Attempting to auto-load first available model...")
                
                # Auto-load the most recently modified model
                available_models = list(models_dir.glob("*.joblib"))
                models_only = [p for p in available_models if not p.name.endswith("_scaler.joblib")]
                if models_only:
                    models_only.sort(key=lambda p: p.stat().st_mtime, reverse=True)
                    first_model = models_only[0].stem
                    model_path = models_dir / f"{first_model}.joblib"
                    scaler_path = models_dir / f"{first_model}_scaler.joblib"
                    if model_path.exists() and scaler_path.exists():
                        self.model = joblib.load(model_path)
                        self.scaler = joblib.load(scaler_path)
                        if self.online_adaptation_enabled:
                            try:
                                from src.calibration.calibration_manager import calibration_manager
                                calibration_manager.prime_eog_running_stats_from_scaler(self.scaler, self.feature_columns)
                            except Exception as exc:
                                if verbose:
                                    print(f"[WARN] EOG online adaptation priming failed: {exc}")
                        if verbose:
                            print(f"\n{'='*50}\n[EOGMLDetector] MODEL AUTO-LOADED FALLBACK: {first_model}\n{'='*50}\n", flush=True)
                        
                        # Update config to reflect backend fallback load!
                        try:
                            from src.utils.config import config_manager
                            config_manager.set_active_model('EOG', first_model)
                        except Exception as ce:
                            print(f"[WARN] Failed to update config manager with auto-loaded model: {ce}")
                    else:
                        if verbose: print("[ERROR] Found a model but its scaler is missing.")
                else:
                    if verbose: print("[WARN] No fallback models available.")
                
        except Exception as e:
            print(f"[FATAL] Error loading model {model_name}: {e}")

        
    def _transform_features(self, features: dict):
        row = {
            col: float(np.nan_to_num(features.get(col, 0.0), nan=0.0, posinf=1e6, neginf=-1e6))
            for col in self.feature_columns
        }

        if self.online_adaptation_enabled:
            try:
                from src.calibration.calibration_manager import calibration_manager
                if calibration_manager.eog_running_mean:
                    normalized = calibration_manager.normalize_eog_features_online(row, self.feature_columns)
                    return np.asarray([[normalized[col] for col in self.feature_columns]], dtype=float)
            except Exception as exc:
                print(f"[EOGMLDetector] Online normalization fallback: {exc}")

        X = pd.DataFrame([[row[col] for col in self.feature_columns]], columns=self.feature_columns)
        return self.scaler.transform(X)

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
            X_scaled = self._transform_features(features)
            
            # 3. Predict PROBABILITY
            probs = self.model.predict_proba(X_scaled)[0]
            pred_idx = np.argmax(probs)
            confidence = probs[pred_idx]
            self.last_confidence = float(confidence)
            
            # Must stay aligned with the saved EOG sessions / SQLite labels:
            # 0=Rest, 1=SingleBlink, 2=DoubleBlink
            label_map = {0: 'Rest', 1: 'SingleBlink', 2: 'DoubleBlink'}
            
            pred_label = label_map.get(int(self.model.classes_[pred_idx]), 'Unknown')
            
            print(f"Probs: {probs} (Classes: {self.model.classes_}) -> Prediction: {pred_label} ({confidence:.2f})")
            
            if pred_label == 'Rest' or pred_label == 'Unknown':
                return None
                
            return pred_label

        except Exception as e:
            print(f"Prediction Error: {e}")
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
        prediction = self.predict_class(features)

        if prediction and self.online_adaptation_enabled and self.last_confidence >= self.online_confidence_threshold:
            try:
                from src.calibration.calibration_manager import calibration_manager
                calibration_manager.update_eog_running_stats(
                    features,
                    alpha=self.online_alpha,
                    feature_columns=self.feature_columns,
                )
            except Exception as exc:
                print(f"[EOGMLDetector] Online stats update failed: {exc}")

        return prediction

    def update_config(self, config: dict):
        self.config = config
        # Reload model if active model changed? 
        # FeatureRouter handles this by re-instantiating, or we can check here.
        # But FeatureRouter re-instantiates the whole pipeline on config change.
        # So we don't need to do anything here if FeatureRouter does its job.
        eog_cfg = config.get("features", {}).get("EOG", {})
        self.online_adaptation_enabled = bool(eog_cfg.get("online_adaptation_enabled", True))
        self.online_confidence_threshold = float(eog_cfg.get("online_confidence_threshold", 0.9))
        self.online_alpha = float(eog_cfg.get("online_alpha", 0.004))
