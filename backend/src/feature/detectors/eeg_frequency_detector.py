import time
from collections import deque
from pathlib import Path

import joblib
import numpy as np

from src.feature.ssvep_utils import DEFAULT_TARGET_FREQS, compute_ssvep_features
from src.utils.paths import get_models_dir


class EEGFrequencyDetector:
    """
    SSVEP detector using FBCCA-derived features with optional LDA inference.
    """

    FEATURE_ORDER = [
        "score_1",
        "score_2",
        "score_3",
        "score_4",
        "score_5",
        "score_6",
        "max_score",
        "second_max_score",
        "score_ratio",
        "score_mean",
        "score_std",
    ]

    def __init__(self, config: dict):
        self.config = config
        self.model = None
        self.scaler = None
        self.model_name = None
        self._load_config()

    def _load_config(self):
        eeg_config = self.config.get("features", {}).get("EEG", {})

        self.sampling_rate = int(self.config.get("sampling_rate", 1000))
        self.target_freqs = [float(freq) for freq in eeg_config.get("target_freqs", DEFAULT_TARGET_FREQS)]
        self.window_len_sec = float(eeg_config.get("window_len_sec", 1.5))
        self.num_harmonics = int(eeg_config.get("num_harmonics", 4))
        self.rest_threshold = float(eeg_config.get("rest_threshold", 0.6))
        self.ratio_threshold = float(eeg_config.get("ratio_threshold", 1.2))
        self.debounce_ms = int(eeg_config.get("debounce_ms", 500))
        self.smoothing_windows = int(eeg_config.get("smoothing_windows", 7))
        self.classifier_mode = str(eeg_config.get("classifier", "fbcca")).lower()
        self.window_samples = int(self.window_len_sec * self.sampling_rate)

        self.prediction_history = deque(maxlen=max(1, self.smoothing_windows))
        self.current_stable_target = "REST"
        self.stable_target_start = time.time()
        self.last_emitted_ts = 0.0

        self._load_model()

    def _load_model(self):
        self.model = None
        self.scaler = None
        self.model_name = None

        active_models = self.config.get("active_models", {})
        requested_model = active_models.get("EEG")
        if not requested_model:
            return

        models_dir = get_models_dir("EEG")
        model_path = models_dir / f"{requested_model}.joblib"
        scaler_path = models_dir / f"{requested_model}_scaler.joblib"
        if not model_path.exists():
            return

        try:
            self.model = joblib.load(model_path)
            self.scaler = joblib.load(scaler_path) if scaler_path.exists() else None
            self.model_name = requested_model
            print(f"\n{'='*50}\n[EEGFrequencyDetector] MODEL LOADED SUCCESSFULLY: {requested_model}\n{'='*50}\n", flush=True)
        except Exception as e:
            print(f"[EEGFrequencyDetector] Failed to load model {requested_model}: {e}")
            self.model = None
            self.scaler = None
            self.model_name = None

    def _normalize_event(self, prediction_idx: int | None) -> str:
        if prediction_idx is None or prediction_idx <= 0:
            return "REST"
        target_idx = prediction_idx - 1
        if 0 <= target_idx < len(self.target_freqs):
            freq = self.target_freqs[target_idx]
            return f"TARGET_{str(freq).replace('.', '_')}HZ"
        return "REST"

    def _fbcca_decision(self, features: dict) -> tuple[str, float, float]:
        score_vector = np.asarray(features.get("score_vector") or [
            features.get("score_1", 0.0),
            features.get("score_2", 0.0),
            features.get("score_3", 0.0),
            features.get("score_4", 0.0),
            features.get("score_5", 0.0),
            features.get("score_6", 0.0),
        ], dtype=float)

        if score_vector.size == 0 or np.all(score_vector <= 0):
            return "REST", 0.0, 0.0

        best_idx = int(np.argmax(score_vector))
        best_score = float(score_vector[best_idx])
        second_best = float(np.partition(score_vector, -2)[-2]) if score_vector.size > 1 else 0.0
        ratio = float(best_score / second_best) if second_best > 1e-8 else float(best_score)

        if best_score < self.rest_threshold or ratio < self.ratio_threshold:
            return "REST", best_score, ratio

        event_name = self._normalize_event(best_idx + 1)
        return event_name, best_score, ratio

    def _lda_decision(self, features: dict) -> tuple[str, float]:
        if self.model is None:
            return "REST", 0.0

        vector = np.array([[float(features.get(key, 0.0)) for key in self.FEATURE_ORDER]], dtype=float)
        if self.scaler is not None:
            vector = self.scaler.transform(vector)

        prediction = int(self.model.predict(vector)[0])
        confidence = 0.0
        if hasattr(self.model, "predict_proba"):
            try:
                confidence = float(np.max(self.model.predict_proba(vector)))
            except Exception:
                confidence = 0.0

        if prediction <= 0:
            return "REST", confidence

        return self._normalize_event(prediction), confidence

    def detect(self, features: dict):
        if not features:
            return None

        if "score_vector" not in features and "raw_window" in features:
            features = compute_ssvep_features(
                features["raw_window"],
                sr=self.sampling_rate,
                target_freqs=self.target_freqs,
                num_harmonics=self.num_harmonics,
            )
        elif "score_vector" not in features:
            return None

        fbcca_event, fbcca_score, ratio = self._fbcca_decision(features)
        live_event = fbcca_event
        confidence = fbcca_score

        if self.classifier_mode == "lda" and self.model is not None:
            lda_event, lda_confidence = self._lda_decision(features)
            if lda_event != "REST" and lda_confidence >= self.rest_threshold:
                live_event = lda_event
                confidence = lda_confidence
            elif fbcca_event == "REST":
                live_event = "REST"

        self.prediction_history.append(live_event)
        if len(self.prediction_history) == 0:
            smoothed_event = live_event
        else:
            vote_counts = {}
            for event in self.prediction_history:
                vote_counts[event] = vote_counts.get(event, 0) + 1
            smoothed_event = max(vote_counts.items(), key=lambda item: item[1])[0]

        current_time = time.time()
        if smoothed_event != self.current_stable_target:
            self.current_stable_target = smoothed_event
            self.stable_target_start = current_time

        confirmed = None
        if (current_time - self.stable_target_start) * 1000 >= self.debounce_ms:
            if (current_time - self.last_emitted_ts) * 1000 >= self.debounce_ms:
                confirmed = self.current_stable_target
                self.last_emitted_ts = current_time

        enriched_features = dict(features)
        enriched_features["detector_confidence"] = confidence
        enriched_features["score_ratio_runtime"] = ratio
        enriched_features["peak_freq"] = features.get("peak_freq", 0.0)

        return smoothed_event, confirmed, enriched_features

    def update_config(self, config: dict):
        self.config = config
        self._load_config()

