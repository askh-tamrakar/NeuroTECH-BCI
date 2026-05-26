"""
Model Manager Module
Handles loading and predicting with pre-trained ML models.
"""
import os
import pickle
import logging

log = logging.getLogger(__name__)

class ModelManager:
    def __init__(self, models_dir="models"):
        # Resolve to backend/models by default, adjusting path from core/
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.models_dir = os.path.join(base_dir, models_dir)
        self.models = {}

    def load_model(self, model_name, filename):
        """Loads a model from a pickle file."""
        filepath = os.path.join(self.models_dir, filename)
        if not os.path.exists(filepath):
            log.warning(f"Model file barely exists: {filepath}")
            return False
            
        try:
            with open(filepath, 'rb') as f:
                self.models[model_name] = pickle.load(f)
            log.info(f"Loaded model {model_name} from {filename}")
            return True
        except Exception as e:
            log.error(f"Failed to load model {model_name}: {e}")
            return False

    def predict(self, model_name, features):
        """Predicts using a loaded model."""
        if model_name not in self.models:
            log.warning(f"Model {model_name} is not loaded.")
            return None
            
        try:
            # Most scikit-learn models expect a 2D array: [n_samples, n_features]
            prediction = self.models[model_name].predict([features])
            return prediction[0]
        except Exception as e:
            log.error(f"Prediction error with model {model_name}: {e}")
            return None
