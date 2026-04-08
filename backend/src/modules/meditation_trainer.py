"""
Meditation Trainer Module
Tracks positive/negative mental states, provides timed session results.
Positive: Focus, Calm, Relaxed  |  Negative: Stressed, Drowsy
"""

import time
from .frontal_detectors import (
    detect_meditation_metrics, detect_stress_metrics,
    detect_focus_metrics, detect_mind_state,
)

POSITIVE_STATES = {"Focus", "Calm", "Relaxed"}
NEGATIVE_STATES = {"Stressed", "Drowsy"}


class MeditationTrainerModule:
    def __init__(self):
        self.focus_history = []
        self.session_active = False
        self.session_start = 0
        self.session_duration = 300
        self.session_samples = []

    def start_session(self, duration_sec=300):
        self.session_active = True
        self.session_start = time.time()
        self.session_duration = duration_sec
        self.session_samples = []

    def stop_session(self):
        self.session_active = False
        if not self.session_samples:
            return {"message": "No data collected", "quality_score": 0}

        elapsed = time.time() - self.session_start
        total = len(self.session_samples)
        state_counts = {}
        focus_scores, stress_scores, calm_scores = [], [], []
        band_avg = {"delta": 0, "theta": 0, "alpha": 0, "beta": 0, "gamma": 0}
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

        quality = min(100, int(
            pos_pct * 0.4 + avg_calm * 0.3 +
            avg_focus * 0.2 + (100 - avg_stress) * 0.1
        ))

        return {
            "duration_sec": round(elapsed),
            "total_samples": total,
            "quality_score": quality,
            "positive_time_pct": round(pos_pct, 1),
            "negative_time_pct": round((negative_count / total) * 100, 1),
            "state_breakdown": state_pcts,
            "avg_focus": round(avg_focus),
            "avg_stress": round(avg_stress),
            "avg_calm": round(avg_calm),
            "avg_band_powers": band_avg,
            "peak_focus": max(focus_scores) if focus_scores else 0,
            "peak_calm": max(calm_scores) if calm_scores else 0,
        }

    def process(self, feature_vector):
        meditation = detect_meditation_metrics(feature_vector)
        stress = detect_stress_metrics(feature_vector)
        focus = detect_focus_metrics(feature_vector, self.focus_history)
        mind_state = detect_mind_state(feature_vector)

        bp_dict = {
            "delta": float(feature_vector[0]) if len(feature_vector) > 0 else 0,
            "theta": float(feature_vector[1]) if len(feature_vector) > 1 else 0,
            "alpha": float(feature_vector[2]) if len(feature_vector) > 2 else 0,
            "beta": float(feature_vector[3]) if len(feature_vector) > 3 else 0,
            "gamma": float(feature_vector[4]) if len(feature_vector) > 4 else 0,
        }

        sample = {
            "state": mind_state["state"],
            "focus_score": focus["focus_score"],
            "stress_score": stress["stress_score"],
            "meditation_score": meditation["meditation_score"],
            "band_powers_dict": bp_dict,
        }

        if self.session_active:
            self.session_samples.append(sample)

        return {
            "meditation_score": meditation["meditation_score"],
            "calmness_meter": meditation["calmness_meter"],
            "breathing_guide": meditation["breathing_guide"],
            "relaxation_trend": meditation["relaxation_trend"],
            "radar_bands": meditation["radar_bands"],
            "band_mix": meditation["band_mix"],
            "stress_score": stress["stress_score"],
            "focus_score": focus["focus_score"],
            "focus_trend": focus["focus_trend"],
            "state": mind_state["state"],
            "state_level": mind_state["state_level"],
            "all_states": mind_state["all_states"],
            "positive_state": mind_state["state"] in POSITIVE_STATES,
            "band_powers": bp_dict,
            "session_active": self.session_active,
        }
