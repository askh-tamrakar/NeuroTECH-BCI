import time
from collections import Counter, deque

import joblib
import numpy as np
import pandas as pd

from src.feature.extractors.rps_extractor import EMG_FEATURE_COLUMNS
from src.utils.paths import get_models_dir


RPS_LABEL_MAP = {0: "Rest", 1: "Rock", 2: "Paper", 3: "Scissors"}
ACTIVE_GESTURES = {"Rock", "Paper", "Scissors"}
LEGACY_EMG_FEATURE_COLUMNS = [
    "rms", "mav", "var", "wl", "peak", "range", "iemg", "entropy", "energy", "kurtosis", "skewness", "ssc", "wamp"
]


class RPSDetector:
    """
    Real-time EMG detector that mirrors the gesture episode workflow used by
    the earlier high-accuracy EMG pipeline:
    - smooth instant predictions for UI feedback
    - open a gesture episode only after repeated active windows
    - collect votes while the gesture stays active
    - confirm once on release back to rest
    """

    def __init__(self, config: dict):
        self.config = config
        self.model = None
        self.scaler = None
        self.feature_columns = list(EMG_FEATURE_COLUMNS)

        self.pred_queue = deque(maxlen=5)
        self.episode_candidates = []
        self.collecting_candidates = False
        self.last_live_label = "Rest"
        self.active_candidate = "Rest"
        self.active_count = 0
        self.rest_count = 0
        self.last_confidence = 0.0
        self.last_saved = 0.0
        self.last_confirmed_at = 0.0
        self.last_vote_ratio = 0.0

        self.update_config(config)
        self.load_model()

    def load_model(self, model_name=None, verbose=True):
        try:
            if model_name is None:
                from src.utils.config import config_manager
                model_name = config_manager.get_active_model("EMG") or "emg_rf_model"

            models_dir = get_models_dir("EMG")
            if model_name == "emg_rf_model" and not (models_dir / "emg_rf_model.joblib").exists():
                if (models_dir / "emg_rf.joblib").exists():
                    model_name = "emg_rf"
                else:
                    model_name = "rps"

            clean_name = "".join([c for c in model_name if c.isalnum() or c in ("_", "-")])
            model_path = models_dir / f"{clean_name}.joblib"
            scaler_path = models_dir / f"{clean_name}_scaler.joblib"

            if model_path.exists() and scaler_path.exists():
                self.model = joblib.load(model_path)
                self.scaler = joblib.load(scaler_path)
                expected_features = int(getattr(self.scaler, "n_features_in_", len(EMG_FEATURE_COLUMNS)))
                self.feature_columns = EMG_FEATURE_COLUMNS if expected_features == len(EMG_FEATURE_COLUMNS) else LEGACY_EMG_FEATURE_COLUMNS
                if self.online_adaptation_enabled and self.feature_columns == EMG_FEATURE_COLUMNS:
                    try:
                        from src.calibration.calibration_manager import calibration_manager
                        calibration_manager.prime_emg_running_stats_from_scaler(self.scaler, self.feature_columns)
                    except Exception as exc:
                        if verbose:
                            print(f"[WARN] EMG online adaptation priming failed: {exc}")
                if verbose:
                    print(f"\n{'='*50}\n[RPSDetector] MODEL SWITCHED: {model_name}\n{'='*50}\n", flush=True)
                return

            if verbose:
                print(f"[WARN] Model {model_name} not found at {model_path}. Attempting fallback load...")

            available_models = [p for p in models_dir.glob("*.joblib") if not p.name.endswith("_scaler.joblib")]
            available_models.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            for candidate in available_models:
                scaler_candidate = models_dir / f"{candidate.stem}_scaler.joblib"
                if scaler_candidate.exists():
                    self.model = joblib.load(candidate)
                    self.scaler = joblib.load(scaler_candidate)
                    expected_features = int(getattr(self.scaler, "n_features_in_", len(EMG_FEATURE_COLUMNS)))
                    self.feature_columns = EMG_FEATURE_COLUMNS if expected_features == len(EMG_FEATURE_COLUMNS) else LEGACY_EMG_FEATURE_COLUMNS
                    if self.online_adaptation_enabled and self.feature_columns == EMG_FEATURE_COLUMNS:
                        try:
                            from src.calibration.calibration_manager import calibration_manager
                            calibration_manager.prime_emg_running_stats_from_scaler(self.scaler, self.feature_columns)
                        except Exception as exc:
                            if verbose:
                                print(f"[WARN] EMG online adaptation priming failed: {exc}")
                    if verbose:
                        print(f"\n{'='*50}\n[RPSDetector] MODEL AUTO-LOADED FALLBACK: {candidate.stem}\n{'='*50}\n", flush=True)
                    try:
                        from src.utils.config import config_manager
                        config_manager.set_active_model("EMG", candidate.stem)
                    except Exception:
                        pass
                    return

            if verbose:
                print("[WARN] No usable EMG model/scaler pair available.")
        except Exception as e:
            print(f"[ERROR] Error loading model {model_name}: {e}")

    def _transform_features(self, features: dict, feature_cols: list[str]):
        row = {
            col: float(np.nan_to_num(features.get(col, 0.0), nan=0.0, posinf=1e6, neginf=-1e6))
            for col in feature_cols
        }

        if self.online_adaptation_enabled and feature_cols == EMG_FEATURE_COLUMNS:
            try:
                from src.calibration.calibration_manager import calibration_manager
                if calibration_manager.emg_running_mean:
                    normalized = calibration_manager.normalize_emg_features_online(row, feature_cols)
                    return np.asarray([[normalized[col] for col in feature_cols]], dtype=float)
            except Exception as exc:
                now = time.time()
                if not hasattr(self, "_last_online_err") or now - self._last_online_err > 5.0:
                    print(f"[RPSDetector] Online normalization fallback: {exc}")
                    self._last_online_err = now

        X = pd.DataFrame([[row[col] for col in feature_cols]], columns=feature_cols)
        return self.scaler.transform(X)

    def predict_instant(self, features: dict) -> tuple[str, float]:
        if not self.model or not self.scaler:
            return "Unknown", 0.0

        try:
            expected_features = int(getattr(self.scaler, "n_features_in_", len(EMG_FEATURE_COLUMNS)))
            feature_cols = EMG_FEATURE_COLUMNS if expected_features == len(EMG_FEATURE_COLUMNS) else LEGACY_EMG_FEATURE_COLUMNS
            self.feature_columns = feature_cols
            X_scaled = self._transform_features(features, feature_cols)

            probs = self.model.predict_proba(X_scaled)[0]
            pred_idx = int(np.argmax(probs))
            confidence = float(probs[pred_idx])
            pred_label_int = self.model.classes_[pred_idx]

            if isinstance(pred_label_int, str):
                pred_label = pred_label_int
            else:
                pred_label = RPS_LABEL_MAP.get(int(pred_label_int), "Unknown")

            return pred_label, confidence
        except Exception as e:
            now = time.time()
            if not hasattr(self, "_last_err_time") or now - self._last_err_time > 5.0:
                print(f"[RPSDetector] Prediction Error: {e}")
                self._last_err_time = now
            return "Error", 0.0

    def _temporal_vote(self, label: str) -> str:
        self.pred_queue.append(label)
        return Counter(self.pred_queue).most_common(1)[0][0]

    def _reset_episode(self):
        self.collecting_candidates = False
        self.episode_candidates = []
        self.active_candidate = "Rest"
        self.active_count = 0
        self.rest_count = 0
        self.last_live_label = "Rest"
        self.last_vote_ratio = 0.0

    def _resolve_episode(self) -> str | None:
        if not self.episode_candidates:
            return None

        counts = Counter(self.episode_candidates)
        winning_label, winning_votes = counts.most_common(1)[0]
        total_votes = sum(counts.values())
        vote_ratio = float(winning_votes / total_votes) if total_votes > 0 else 0.0
        self.last_vote_ratio = vote_ratio

        if total_votes < self.min_episode_votes:
            return None
        if vote_ratio < self.min_episode_majority_ratio:
            return None
        return winning_label

    def _update_episode(self, majority_label: str) -> tuple[str, str | None]:
        confirmed_label = None
        if (
            majority_label in ACTIVE_GESTURES
            and not self.collecting_candidates
            and (time.time() - self.last_confirmed_at) < self.confirmation_cooldown_sec
        ):
            self.last_live_label = "Rest"
            return self.last_live_label, None

        if majority_label in ACTIVE_GESTURES:
            self.rest_count = 0

            if not self.collecting_candidates:
                if majority_label == self.active_candidate:
                    self.active_count += 1
                else:
                    self.active_candidate = majority_label
                    self.active_count = 1

                if self.active_count >= self.activation_count:
                    self.collecting_candidates = True
                    self.episode_candidates = [majority_label]
                    self.last_live_label = majority_label
                else:
                    self.last_live_label = "Rest"
            else:
                self.episode_candidates.append(majority_label)
                self.last_live_label = Counter(self.episode_candidates).most_common(1)[0][0]
        else:
            self.active_candidate = "Rest"
            self.active_count = 0

            if self.collecting_candidates:
                self.rest_count += 1
                if self.rest_count >= self.release_count:
                    confirmed_label = self._resolve_episode()
                    self.last_confirmed_at = time.time()
                    self._reset_episode()
                else:
                    # Keep the UI "active" until the release windows complete.
                    self.last_live_label = Counter(self.episode_candidates).most_common(1)[0][0]
            else:
                self.last_live_label = "Rest"

        return self.last_live_label, confirmed_label

    def _maybe_store_adaptive(self, features: dict, prediction: str, confidence: float):
        if prediction not in ACTIVE_GESTURES or confidence <= self.adaptive_confidence_threshold:
            return

        now = time.time()
        if now - self.last_saved < self.adaptive_rate_limit_sec:
            return

        try:
            from src.database.db_manager import db_manager
            label_map = {"Rest": 0, "Rock": 1, "Paper": 2, "Scissors": 3}
            adaptive_features = dict(features)
            adaptive_features["timestamp"] = now
            adaptive_features["confidence"] = confidence
            adaptive_features["source"] = "adaptive"
            db_manager.insert_window(
                adaptive_features,
                label_map.get(prediction, 0),
                session_id=f"adaptive_{int(now)}",
                table_name="emg_windows",
            )
            self.last_saved = now
        except Exception as e:
            if not hasattr(self, "_last_adaptive_err") or now - self._last_adaptive_err > 5.0:
                print(f"[RPSDetector] Adaptive save failed: {e}")
                self._last_adaptive_err = now

    def _maybe_update_online_stats(self, features: dict, live_label: str, confirmed_label: str | None, confidence: float):
        if not self.online_adaptation_enabled or self.feature_columns != EMG_FEATURE_COLUMNS:
            return

        try:
            from src.calibration.calibration_manager import calibration_manager

            if live_label == "Rest" and not self.collecting_candidates:
                calibration_manager.update_emg_running_stats(
                    features,
                    alpha=self.online_rest_alpha,
                    feature_columns=self.feature_columns,
                )
            elif confirmed_label and confidence >= self.online_confidence_threshold:
                calibration_manager.update_emg_running_stats(
                    features,
                    alpha=self.online_active_alpha,
                    feature_columns=self.feature_columns,
                )
        except Exception as exc:
            now = time.time()
            if not hasattr(self, "_last_online_update_err") or now - self._last_online_update_err > 5.0:
                print(f"[RPSDetector] Online stats update failed: {exc}")
                self._last_online_update_err = now

    def detect(self, features: dict) -> tuple[str, str | None]:
        predicted_label, confidence = self.predict_instant(features)
        self.last_confidence = confidence

        if confidence < self.confidence_threshold or predicted_label not in ACTIVE_GESTURES:
            predicted_label = "Rest"

        majority = self._temporal_vote(predicted_label)
        live_label, confirmed_label = self._update_episode(majority)
        self._maybe_update_online_stats(features, live_label, confirmed_label, confidence)

        if confirmed_label:
            self._maybe_store_adaptive(features, confirmed_label, confidence)
        elif time.time() - self.last_confirmed_at < self.confirmation_cooldown_sec:
            live_label = "Rest"

        return live_label, confirmed_label

    def update_config(self, config: dict):
        self.config = config
        rps_cfg = config.get("features", {}).get("RPS", {})
        self.confidence_threshold = float(rps_cfg.get("confidence_threshold", 0.6))
        self.voting_window = int(rps_cfg.get("voting_window", 5))
        self.activation_count = int(rps_cfg.get("activation_count", rps_cfg.get("stable_count", 3)))
        self.release_count = int(rps_cfg.get("release_count", 2))
        self.confirmation_cooldown_sec = float(rps_cfg.get("confirmation_cooldown_sec", 0.6))
        self.min_episode_votes = int(rps_cfg.get("min_episode_votes", max(self.activation_count, 4)))
        self.min_episode_majority_ratio = float(rps_cfg.get("min_episode_majority_ratio", 0.55))
        self.adaptive_confidence_threshold = float(rps_cfg.get("adaptive_confidence_threshold", 0.90))
        self.adaptive_rate_limit_sec = float(rps_cfg.get("adaptive_rate_limit_sec", 1.0))
        self.online_adaptation_enabled = bool(rps_cfg.get("online_adaptation_enabled", False))
        self.online_confidence_threshold = float(rps_cfg.get("online_confidence_threshold", 0.92))
        self.online_rest_alpha = float(rps_cfg.get("online_rest_alpha", 0.01))
        self.online_active_alpha = float(rps_cfg.get("online_active_alpha", 0.003))

        if self.pred_queue.maxlen != self.voting_window:
            self.pred_queue = deque(list(self.pred_queue), maxlen=self.voting_window)
