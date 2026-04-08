import time
from collections import deque
import logging

import joblib
import numpy as np

from src.feature.ssvep_utils import DEFAULT_TARGET_FREQS, compute_ssvep_features
from src.utils.paths import get_models_dir

log = logging.getLogger(__name__)


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
        "peak_freq",
    ]

    def __init__(self, config: dict):
        self.config = config
        self.model = None
        self.scaler = None
        self.model_name = None
        self.detector_mode = "fbcca"
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
        self.use_ml_pipeline = bool(eeg_config.get("use_ml_pipeline", self.classifier_mode == "lda"))
        self.peak_snap_tolerance_hz = float(eeg_config.get("peak_snap_tolerance_hz", 0.75))
        self.peak_support_ratio = float(eeg_config.get("peak_support_ratio", 0.25))
        self.window_samples = int(self.window_len_sec * self.sampling_rate)

        self.prediction_history = deque(maxlen=max(1, self.smoothing_windows))
        self.current_stable_target = "REST"
        self.stable_target_start = time.time()
        self.last_emitted_ts = 0.0

        self._load_model()
        self.detector_mode = "lda" if (self.use_ml_pipeline and self.classifier_mode == "lda" and self.model is not None) else "fbcca"
        log.info(
            "[EEGFrequencyDetector] Config loaded: mode=%s use_ml_pipeline=%s classifier=%s model=%s target_freqs=%s",
            self.detector_mode,
            self.use_ml_pipeline,
            self.classifier_mode,
            self.model_name or "none",
            ",".join(str(freq) for freq in self.target_freqs),
        )

    def _load_model(self):
        self.model = None
        self.scaler = None
        self.model_name = None

        if not self.use_ml_pipeline or self.classifier_mode != "lda":
            log.info(
                "[EEGFrequencyDetector] ML pipeline excluded from runtime (use_ml_pipeline=%s, classifier=%s)",
                self.use_ml_pipeline,
                self.classifier_mode,
            )
            return

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

    def _base_score_vector(self, features: dict) -> np.ndarray:
        return np.asarray(features.get("score_vector") or [
            features.get("score_1", 0.0),
            features.get("score_2", 0.0),
            features.get("score_3", 0.0),
            features.get("score_4", 0.0),
            features.get("score_5", 0.0),
            features.get("score_6", 0.0),
        ], dtype=float)

    def _hybrid_score_vector(self, features: dict) -> np.ndarray:
        hybrid_vector = np.asarray(features.get("hybrid_score_vector") or [], dtype=float)
        if hybrid_vector.size:
            return hybrid_vector

        base_vector = self._base_score_vector(features)
        peak_alignment = np.asarray(features.get("peak_alignment_vector") or np.zeros_like(base_vector), dtype=float)
        if base_vector.size == 0:
            return base_vector

        total = float(np.sum(base_vector))
        normalized = (base_vector / total) if total > 1e-12 else base_vector
        return (0.72 * normalized) + (0.28 * peak_alignment)

    def _alias_penalty_vector(self, features: dict, size: int) -> np.ndarray:
        peak_freq = float(features.get("peak_freq", 0.0) or 0.0)
        if peak_freq <= 0 or size <= 0:
            return np.zeros(size, dtype=float)

        target_arr = np.asarray(self.target_freqs[:size], dtype=float)
        if target_arr.size == 0:
            return np.zeros(size, dtype=float)

        sigma = max(0.55, self.peak_snap_tolerance_hz)
        direct_alignment = np.exp(-0.5 * ((peak_freq - target_arr) / sigma) ** 2)
        subharmonic_alignment = np.exp(-0.5 * ((peak_freq - (target_arr / 2.0)) / sigma) ** 2)
        harmonic_alignment = np.exp(-0.5 * ((peak_freq - (target_arr * 2.0)) / sigma) ** 2)
        return np.maximum(subharmonic_alignment, harmonic_alignment) * (1.0 - direct_alignment)

    def _resolved_score_vector(self, features: dict) -> tuple[np.ndarray, np.ndarray]:
        hybrid_vector = self._hybrid_score_vector(features)
        if hybrid_vector.size == 0:
            return hybrid_vector, np.asarray([], dtype=float)

        alias_penalty = self._alias_penalty_vector(features, hybrid_vector.size)
        resolved = np.clip(hybrid_vector - (0.38 * alias_penalty), 0.0, None)
        total = float(np.sum(resolved))
        if total > 1e-12:
            resolved = resolved / total
        return resolved, alias_penalty

    def _peak_guided_target_idx(self, features: dict, base_scores: np.ndarray, hybrid_scores: np.ndarray) -> int | None:
        peak_freq = float(features.get("peak_freq", 0.0) or 0.0)
        if peak_freq <= 0 or not len(self.target_freqs):
            return None

        target_arr = np.asarray(self.target_freqs[:len(base_scores)], dtype=float)
        if target_arr.size == 0:
            return None

        peak_idx = int(np.argmin(np.abs(target_arr - peak_freq)))
        peak_distance = float(abs(target_arr[peak_idx] - peak_freq))
        if peak_distance > self.peak_snap_tolerance_hz:
            return None

        best_score = float(np.max(base_scores)) if base_scores.size else 0.0
        support_score = float(base_scores[peak_idx]) if peak_idx < len(base_scores) else 0.0
        hybrid_best = int(np.argmax(hybrid_scores)) if hybrid_scores.size else peak_idx

        if peak_idx == hybrid_best:
            return peak_idx
        if best_score <= 1e-8:
            return peak_idx
        if support_score >= best_score * self.peak_support_ratio:
            return peak_idx
        return None

    def _fbcca_decision(self, features: dict) -> tuple[str, float, float, dict]:
        score_vector = self._base_score_vector(features)

        if score_vector.size == 0 or np.all(score_vector <= 0):
            return "REST", 0.0, 0.0, {
                "raw_scores": score_vector.tolist(),
                "hybrid_scores": [],
                "alias_penalties": [],
                "peak_guided_idx": None,
                "peak_freq": float(features.get("peak_freq", 0.0) or 0.0),
            }

        hybrid_vector, alias_penalty = self._resolved_score_vector(features)
        if hybrid_vector.size != score_vector.size:
            hybrid_vector = score_vector.copy()
            alias_penalty = np.zeros_like(score_vector)

        best_idx = int(np.argmax(hybrid_vector))
        best_score = float(hybrid_vector[best_idx])
        support_score = float(score_vector[best_idx])
        second_best = float(np.partition(hybrid_vector, -2)[-2]) if hybrid_vector.size > 1 else 0.0
        ratio = float(best_score / second_best) if second_best > 1e-8 else float(best_score)
        peak_guided_idx = self._peak_guided_target_idx(features, score_vector, hybrid_vector)
        if peak_guided_idx is not None:
            best_idx = peak_guided_idx
            best_score = float(hybrid_vector[best_idx])
            support_score = float(score_vector[best_idx])
            second_best = float(np.partition(hybrid_vector, -2)[-2]) if hybrid_vector.size > 1 else 0.0
            ratio = float(best_score / second_best) if second_best > 1e-8 else float(best_score)

        if support_score < self.rest_threshold or ratio < self.ratio_threshold:
            return "REST", best_score, ratio, {
                "raw_scores": score_vector.tolist(),
                "hybrid_scores": hybrid_vector.tolist(),
                "alias_penalties": alias_penalty.tolist(),
                "peak_guided_idx": peak_guided_idx,
                "peak_freq": float(features.get("peak_freq", 0.0) or 0.0),
            }

        event_name = self._normalize_event(best_idx + 1)
        return event_name, best_score, ratio, {
            "raw_scores": score_vector.tolist(),
            "hybrid_scores": hybrid_vector.tolist(),
            "alias_penalties": alias_penalty.tolist(),
            "peak_guided_idx": best_idx,
            "peak_freq": float(features.get("peak_freq", 0.0) or 0.0),
        }

    def _lda_decision(self, features: dict) -> tuple[str, float]:
        if self.model is None:
            return "REST", 0.0

        expected = getattr(self.scaler, "n_features_in_", None)
        if expected is None:
            expected = getattr(self.model, "n_features_in_", None)
        feature_order = self.FEATURE_ORDER[: int(expected)] if expected else self.FEATURE_ORDER
        vector = np.array([[float(features.get(key, 0.0)) for key in feature_order]], dtype=float)
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

        fbcca_event, fbcca_score, ratio, fbcca_meta = self._fbcca_decision(features)
        live_event = fbcca_event
        confidence = fbcca_score

        if self.use_ml_pipeline and self.classifier_mode == "lda" and self.model is not None:
            lda_event, lda_confidence = self._lda_decision(features)
            if (
                fbcca_event != "REST"
                and lda_event != "REST"
                and lda_event != fbcca_event
                and fbcca_meta.get("peak_guided_idx") is not None
                and abs(float(features.get("peak_freq", 0.0) or 0.0) - self.target_freqs[fbcca_meta["peak_guided_idx"]]) <= self.peak_snap_tolerance_hz
            ):
                live_event = fbcca_event
                confidence = max(fbcca_score, lda_confidence)
            elif lda_event != "REST" and lda_confidence >= self.rest_threshold:
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
        enriched_features["hybrid_score_vector"] = fbcca_meta.get("hybrid_scores", features.get("hybrid_score_vector", []))
        enriched_features["score_vector_raw"] = fbcca_meta.get("raw_scores", features.get("score_vector", []))
        enriched_features["alias_penalty_vector"] = fbcca_meta.get("alias_penalties", [])
        enriched_features["display_score_vector"] = fbcca_meta.get("hybrid_scores", features.get("hybrid_score_vector", []))
        enriched_features["peak_guided_target_idx"] = fbcca_meta.get("peak_guided_idx")
        enriched_features["ml_enabled"] = self.use_ml_pipeline
        enriched_features["detector_mode"] = self.detector_mode
        enriched_features["classifier_mode"] = self.classifier_mode
        enriched_features["model_name"] = self.model_name
        enriched_features["fbcca_event"] = fbcca_event
        enriched_features["final_event"] = smoothed_event

        return smoothed_event, confirmed, enriched_features

    def update_config(self, config: dict):
        self.config = config
        self._load_config()

