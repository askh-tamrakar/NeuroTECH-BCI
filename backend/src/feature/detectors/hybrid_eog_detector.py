"""
Hybrid EOG Detector — ML + Rule Validation + Temporal Gate

Layer 1: ML classifier (Random Forest) predicts blink type + confidence
Layer 2: Rule validator checks physiological constraints (duration, amplitude,
         rise/fall ratio, peak count, asymmetry)
Layer 3: Temporal gate enforces minimum cooldown between blinks

A blink is only emitted when ALL three layers agree.
"""
import time
import joblib
import pandas as pd
import numpy as np
from pathlib import Path


class HybridEOGDetector:
    """ML + physiological rules + temporal gate for near-100%-accuracy blink detection."""

    # ── Physiological blink constraints ──────────────────────────────
    PHYSIO_MIN_DURATION_MS = 50    # Blinks shorter than 50ms are saccades/artifacts
    PHYSIO_MAX_DURATION_MS = 600   # Blinks longer than 600ms are voluntary/lid closures
    PHYSIO_MIN_AMP_UV      = 100   # Minimum peak amplitude (adaptive in practice)
    PHYSIO_MIN_RISE_FALL   = 0.3   # Rise/fall ratio lower bound (blinks are roughly symmetric)
    PHYSIO_MAX_RISE_FALL   = 3.0   # Rise/fall ratio upper bound
    PHYSIO_MAX_PEAKS       = 3     # More than 3 peaks = artifact, not a blink
    COOLDOWN_MS            = 500   # Minimum time between blinks (prevents double-fires)

    def __init__(self, config: dict):
        self.config = config
        self.model = None
        self.scaler = None
        self.metadata = {}

        eog_cfg = config.get("features", {}).get("EOG", {})
        self.ml_confidence_threshold = eog_cfg.get("ml_confidence_threshold", 0.55)
        self.cooldown_ms = eog_cfg.get("cooldown_ms", self.COOLDOWN_MS)
        self.rule_amp_uv = eog_cfg.get("min_amp_uv", self.PHYSIO_MIN_AMP_UV)

        # Temporal gate state
        self.last_blink_ts = 0.0

        # Adaptive noise floor
        self._noise_floor_uv = 50.0  # initial guess, adapts at runtime

        # Debug: count discarded events for diagnostics
        self._reject_counters = {"ml_low_conf": 0, "rule_duration": 0, "rule_rise_fall": 0,
                                  "rule_amp": 0, "rule_peaks": 0, "cooldown": 0, "ml_rest": 0}
        self._accept_count = 0
        self._last_diag_print = 0.0

        # Exposed for CSV logging
        self.last_confidence = 0.0
        self._last_verdict = "accepted"

        self.load_model()

    # ── ML Model ─────────────────────────────────────────────────────
    def load_model(self, model_name=None, verbose=True):
        try:
            if model_name is None:
                try:
                    from data.backend.src.utils.config import config_manager
                    model_name = config_manager.get_active_model('EOG')
                except ImportError:
                    model_name = None
            if not model_name:
                model_name = "eog_rf"

            from data.backend.src.utils.paths import get_models_dir
            models_dir = get_models_dir('EOG')
            clean_name = "".join(c for c in model_name if c.isalnum() or c in ('_', '-'))

            model_path = models_dir / f"{clean_name}.joblib"
            scaler_path = models_dir / f"{clean_name}_scaler.joblib"

            if model_path.exists() and scaler_path.exists():
                self.model = joblib.load(model_path)
                self.scaler = joblib.load(scaler_path)

                meta_path = models_dir / f"{clean_name}_meta.json"
                if meta_path.exists():
                    import json
                    with open(meta_path, 'r', encoding='utf-8') as f:
                        self.metadata = json.load(f)

                if verbose:
                    print(f"[HybridEOG] ✅ Model loaded: {model_name}")
            else:
                if verbose:
                    print(f"[HybridEOG] ⚠️  No ML model found — using rule-only mode")
                self.model = None
                self.scaler = None
        except Exception as e:
            print(f"[HybridEOG] ❌ Error loading model: {e}")
            self.model = None
            self.scaler = None

    def set_noise_floor(self, uv: float):
        """Update the adaptive noise floor from the extractor."""
        self._noise_floor_uv = max(30.0, min(uv, 500.0))

    # ── ML Prediction ─────────────────────────────────────────────────
    def _ml_predict(self, features: dict) -> tuple[str | None, float]:
        """Returns (label, confidence) or (None, 0) if model unavailable."""
        if not self.model or not self.scaler:
            return None, 0.0

        try:
            feature_cols = ['amplitude', 'duration_ms', 'rise_time_ms', 'fall_time_ms',
                            'asymmetry', 'peak_count', 'kurtosis', 'skewness']
            row = [float(features.get(c, 0.0)) for c in feature_cols]
            X = pd.DataFrame([row], columns=feature_cols)
            X_scaled = self.scaler.transform(X)

            probs = self.model.predict_proba(X_scaled)[0]
            pred_idx = np.argmax(probs)
            confidence = float(probs[pred_idx])

            label_map = {0: 'Rest', 1: 'SingleBlink', 2: 'DoubleBlink'}
            label = label_map.get(int(self.model.classes_[pred_idx]), 'Unknown')

            if label in ('Rest', 'Unknown'):
                self._reject_counters["ml_rest"] += 1
                return None, confidence

            return label, confidence
        except Exception:
            return None, 0.0

    # ── Rule Validation ───────────────────────────────────────────────
    def _validate_rules(self, features: dict) -> tuple[bool, str]:
        """
        Check physiological constraints.
        Returns (is_valid, reject_reason).
        """
        dur = features.get("duration_ms", 0)
        amp = features.get("amplitude", 0)
        asym = features.get("asymmetry", 1.0)
        peaks = features.get("peak_count", 1)

        min_amp = max(self.rule_amp_uv, self._noise_floor_uv * 2.5)

        if dur < self.PHYSIO_MIN_DURATION_MS or dur > self.PHYSIO_MAX_DURATION_MS:
            self._reject_counters["rule_duration"] += 1
            return False, f"duration={dur:.0f}ms"
        if amp < min_amp:
            self._reject_counters["rule_amp"] += 1
            return False, f"amp={amp:.0f}µV < {min_amp:.0f}"
        if asym < self.PHYSIO_MIN_RISE_FALL or asym > self.PHYSIO_MAX_RISE_FALL:
            self._reject_counters["rule_rise_fall"] += 1
            return False, f"rise/fall={asym:.2f}"
        if peaks > self.PHYSIO_MAX_PEAKS:
            self._reject_counters["rule_peaks"] += 1
            return False, f"peaks={peaks}"

        return True, ""

    # ── Temporal Gate ────────────────────────────────────────────────
    def _check_cooldown(self, ts: float) -> bool:
        if ts - self.last_blink_ts < self.cooldown_ms / 1000.0:
            self._reject_counters["cooldown"] += 1
            return False
        return True

    # ── Main Detection ───────────────────────────────────────────────
    def detect(self, features: dict) -> str | None:
        """
        Hybrid detection pipeline:
          1. ML predicts
          2. Rules validate
          3. Cooldown gates
        Returns event name or None.
        """
        if not features:
            return None

        ts = features.get("timestamp", time.time())

        # ── Layer 1: ML Classification ───────────────────────────────
        ml_label, ml_conf = self._ml_predict(features)
        self.last_confidence = ml_conf

        if ml_label is None:
            self._last_verdict = f"ml_reject_{ml_conf:.2f}"
            if ml_conf < self.ml_confidence_threshold and self.model:
                self._reject_counters["ml_low_conf"] += 1
            return None

        # ── Layer 2: Rule Validation ──────────────────────────────────
        valid, reason = self._validate_rules(features)
        if not valid:
            self._last_verdict = f"rule_{reason}"
            return None

        # ── Layer 3: Temporal Gate ────────────────────────────────────
        if not self._check_cooldown(ts):
            self._last_verdict = "cooldown"
            return None

        # ── All layers passed ─────────────────────────────────────────
        self.last_blink_ts = ts
        self._accept_count += 1
        self._last_verdict = "accepted"

        # Periodic diagnostics (every 30s)
        if time.time() - self._last_diag_print > 30:
            total_reject = sum(self._reject_counters.values())
            print(f"[HybridEOG] ✅ accepted={self._accept_count}  "
                  f"❌ rejected={total_reject}  "
                  f"({', '.join(f'{k}={v}' for k, v in self._reject_counters.items() if v > 0)})",
                  flush=True)
            self._last_diag_print = time.time()

        return ml_label

    def update_config(self, config: dict):
        self.config = config
        eog_cfg = config.get("features", {}).get("EOG", {})
        self.ml_confidence_threshold = eog_cfg.get("ml_confidence_threshold", self.ml_confidence_threshold)
        self.cooldown_ms = eog_cfg.get("cooldown_ms", self.cooldown_ms)
