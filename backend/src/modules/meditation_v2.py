"""
Meditation V2 Module
Enhanced meditation trainer with auto channel detection, HRV extraction,
and artifact rejection. Replaces the original meditation_trainer.py.

Uses the proven mind-state detection from frontal_detectors.py (untouched)
and adds HRV via the HRVDetector on the same EEG/EMG channel.
"""
import time
import logging

from .frontal_detectors import (
    detect_meditation_metrics,
    detect_stress_metrics,
    detect_focus_metrics,
    detect_mind_state,
)
from .channel_detector import get_channel_detector
from .hrv_detector import HRVDetector

log = logging.getLogger(__name__)

POSITIVE_STATES = {"Focus", "Calm", "Relaxed"}
NEGATIVE_STATES = {"Stressed", "Drowsy"}


class MeditationV2Module:
    """
    Enhanced meditation trainer.

    Features over v1:
      - Auto-detects best EEG/EMG channel from sensor_config.json
      - Extracts HRV (HR BPM, SDNN, RMSSD) from the same signal
      - Artifact rejection: high-delta windows flagged as blink/movement
      - EMA smoothing on all scores (alpha=0.15 for slower, stabler response)
      - Session tracking with comprehensive results including HRV averages
    """

    def __init__(self, sample_rate: int = 512):
        self.sr = sample_rate

        # Auto-detect channel
        self.channel_detector = get_channel_detector()
        self.detected_channel = self.channel_detector.detect()

        # HRV detector (runs on the detected EEG/EMG channel)
        self.hrv = HRVDetector(sample_rate=sample_rate)

        # Focus history for trend detection
        self.focus_history = []

        # Session state
        self.session_active = False
        self.session_start = 0.0
        self.session_duration = 300
        self.session_samples = []

        # EMA smoothing (alpha=0.15 — slower than v1's 0.2 for more stability)
        self._ema_alpha = 0.15
        self._smooth_stress = 0.0
        self._smooth_focus = 0.0
        self._smooth_calm = 0.0

        # Artifact rejection
        self._prev_bands = None
        self._artifact_streak = 0
        self._max_artifact_streak = 3

        # Latest HRV result
        self._latest_hrv = None

    # ── Channel ──────────────────────────────────────────────────────
    def get_channel_info(self) -> dict:
        """Return the auto-detected channel info for the frontend."""
        return self.detected_channel

    def refresh_channel(self):
        """Force re-read of sensor_config.json."""
        self.detected_channel = self.channel_detector.detect(force_refresh=True)

    # ── EMA helper ───────────────────────────────────────────────────
    def _ema(self, prev: float, new: float) -> float:
        return prev + self._ema_alpha * (new - prev)

    # ── Artifact detection ───────────────────────────────────────────
    def _is_artifact(self, feature_vector: list) -> bool:
        """
        Detect blink/movement artifacts from feature vector.

        Heuristic: if delta power dominates (>70% of total band power),
        it's likely a blink or electrode pop — not real neural activity.
        """
        delta = float(feature_vector[0]) if len(feature_vector) > 0 else 0
        theta = float(feature_vector[1]) if len(feature_vector) > 1 else 0
        alpha = float(feature_vector[2]) if len(feature_vector) > 2 else 0
        beta = float(feature_vector[3]) if len(feature_vector) > 3 else 0
        gamma = float(feature_vector[4]) if len(feature_vector) > 4 else 0
        total = delta + theta + alpha + beta + gamma + 1e-6
        delta_ratio = delta / total
        return delta_ratio > 0.70

    # ── Process ──────────────────────────────────────────────────────
    def process(self, feature_vector: list, raw_sample: float = None) -> dict:
        """
        Process one feature vector (from a full FFT window).

        Args:
            feature_vector: 13-element vector from compute_feature_vector()
            raw_sample: optional raw ADC value for HRV (fed sample-by-sample)

        Returns:
            dict with meditation_score, stress_score, focus_score, state,
            band_powers, hrv (if available), session_active
        """
        # ── Artifact check ───────────────────────────────────────────
        if self._is_artifact(feature_vector):
            self._artifact_streak += 1
            if self._artifact_streak > self._max_artifact_streak:
                log.debug("MeditationV2: sustained artifact — freezing state")
            # Still feed HRV (blinks don't break R-peak detection as badly)
        else:
            self._artifact_streak = 0

        # ── HRV processing ───────────────────────────────────────────
        if raw_sample is not None:
            hrv_result = self.hrv.process_sample(raw_sample)
            if hrv_result:
                self._latest_hrv = hrv_result

        # ── Mind state detection (reuse proven detectors) ────────────
        meditation = detect_meditation_metrics(feature_vector)
        stress = detect_stress_metrics(feature_vector)
        focus = detect_focus_metrics(feature_vector, self.focus_history)
        mind_state = detect_mind_state(feature_vector)

        # ── Band powers dict ─────────────────────────────────────────
        bp_dict = {
            "delta": float(feature_vector[0]) if len(feature_vector) > 0 else 0,
            "theta": float(feature_vector[1]) if len(feature_vector) > 1 else 0,
            "alpha": float(feature_vector[2]) if len(feature_vector) > 2 else 0,
            "beta": float(feature_vector[3]) if len(feature_vector) > 3 else 0,
            "gamma": float(feature_vector[4]) if len(feature_vector) > 4 else 0,
        }

        # ── If in artifact streak, freeze state but keep bands ───────
        if self._artifact_streak > self._max_artifact_streak:
            mind_state = {"state": "Neutral", "state_level": 0, "all_states": {}}

        # ── EMA smooth scores ────────────────────────────────────────
        self._smooth_calm = self._ema(self._smooth_calm, meditation["meditation_score"])
        self._smooth_focus = self._ema(self._smooth_focus, focus["focus_score"])
        self._smooth_stress = self._ema(self._smooth_stress, stress["stress_score"])

        # ── Build output ─────────────────────────────────────────────
        smooth_calm = round(self._smooth_calm)
        smooth_focus = round(self._smooth_focus)
        smooth_stress = round(self._smooth_stress)

        sample = {
            "state": mind_state["state"],
            "focus_score": smooth_focus,
            "stress_score": smooth_stress,
            "meditation_score": smooth_calm,
            "band_powers_dict": bp_dict,
        }

        if self.session_active:
            self.session_samples.append(sample)

        output = {
            "meditation_score": smooth_calm,
            "stress_score": smooth_stress,
            "focus_score": smooth_focus,
            "state": mind_state["state"],
            "state_level": mind_state["state_level"],
            "all_states": mind_state["all_states"],
            "positive_state": mind_state["state"] in POSITIVE_STATES,
            "band_powers": bp_dict,
            "breathing_guide": meditation["breathing_guide"],
            "relaxation_trend": meditation["relaxation_trend"],
            "radar_bands": meditation["radar_bands"],
            "session_active": self.session_active,
            "detected_channel": self.detected_channel,
            "hrv": self._latest_hrv,
            "artifact": self._artifact_streak > 0,
        }

        return output

    def process_raw_only(self, raw_sample: float) -> dict | None:
        """Feed raw sample to HRV detector only (use between windows)."""
        return self.hrv.process_sample(raw_sample)

    # ── Session management ───────────────────────────────────────────
    def start_session(self, duration_sec: int = 300):
        self.session_active = True
        self.session_start = time.time()
        self.session_duration = duration_sec
        self.session_samples = []
        self.hrv.reset()
        self._smooth_calm = 0.0
        self._smooth_focus = 0.0
        self._smooth_stress = 0.0
        log.info(f"MeditationV2: session started ({duration_sec}s)")

    def stop_session(self) -> dict:
        self.session_active = False
        elapsed = time.time() - self.session_start

        if not self.session_samples:
            return {"message": "No data collected", "quality_score": 0, "duration_sec": round(elapsed)}

        total = len(self.session_samples)
        state_counts: dict[str, int] = {}
        focus_scores: list[int] = []
        stress_scores: list[int] = []
        calm_scores: list[int] = []
        band_avg = {"delta": 0.0, "theta": 0.0, "alpha": 0.0, "beta": 0.0, "gamma": 0.0}
        positive_count = 0
        negative_count = 0

        for s in self.session_samples:
            st = s.get("state", "Neutral")
            state_counts[st] = state_counts.get(st, 0) + 1
            focus_scores.append(s.get("focus_score", 0))
            stress_scores.append(s.get("stress_score", 0))
            calm_scores.append(s.get("meditation_score", 0))
            if st in POSITIVE_STATES:
                positive_count += 1
            elif st in NEGATIVE_STATES:
                negative_count += 1
            bp = s.get("band_powers_dict", {})
            for b in band_avg:
                band_avg[b] += bp.get(b, 0)

        for b in band_avg:
            band_avg[b] /= max(total, 1)

        state_pcts = {k: round((v / total) * 100, 1) for k, v in state_counts.items()}
        avg_focus = sum(focus_scores) / max(len(focus_scores), 1)
        avg_stress = sum(stress_scores) / max(len(stress_scores), 1)
        avg_calm = sum(calm_scores) / max(len(calm_scores), 1)
        pos_pct = (positive_count / total) * 100
        neg_pct = (negative_count / total) * 100

        quality = min(100, int(
            pos_pct * 0.4 + avg_calm * 0.3 + avg_focus * 0.2 + (100 - avg_stress) * 0.1
        ))

        result = {
            "duration_sec": round(elapsed),
            "total_samples": total,
            "quality_score": quality,
            "positive_time_pct": round(pos_pct, 1),
            "negative_time_pct": round(neg_pct, 1),
            "state_breakdown": state_pcts,
            "avg_focus": round(avg_focus),
            "avg_stress": round(avg_stress),
            "avg_calm": round(avg_calm),
            "avg_band_powers": band_avg,
            "peak_focus": max(focus_scores) if focus_scores else 0,
            "peak_calm": max(calm_scores) if calm_scores else 0,
            "detected_channel": self.detected_channel,
            "hrv_final": self._latest_hrv,
        }
        log.info(f"MeditationV2: session stopped — quality={quality}")
        return result
