"""
Music Control Module
State-of-mind detection for music playback.
Amplitude controlled by state intensity level.
"""

from .frontal_detectors import (
    classify_music_state, detect_stress_metrics,
    detect_focus_metrics, detect_mind_state,
)


class MusicControlModule:
    def __init__(self):
        self.current_state = "Calm"
        self.focus_history = []
        self._smooth_stress = 0.0
        self._smooth_focus = 0.0
        self._ema_alpha = 0.25  # lower = smoother

    def _ema(self, prev, new):
        return prev + self._ema_alpha * (new - prev)

    def process(self, feature_vector):
        music_state = classify_music_state(feature_vector)
        stress = detect_stress_metrics(feature_vector)
        focus = detect_focus_metrics(feature_vector, self.focus_history)
        mind_state = detect_mind_state(feature_vector)

        self.current_state = mind_state["state"]

        # EMA smooth scores to prevent harsh jumps
        self._smooth_stress = self._ema(self._smooth_stress, stress["stress_score"])
        self._smooth_focus = self._ema(self._smooth_focus, focus["focus_score"])

        return {
            "state": mind_state["state"],
            "state_level": mind_state["state_level"],
            "all_states": mind_state["all_states"],
            "action": music_state["action"],
            "band_mix": music_state["band_mix"],
            "stress_score": round(self._smooth_stress),
            "focus_score": round(self._smooth_focus),
        }
