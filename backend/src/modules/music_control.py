"""
Music Control Module
State-of-mind detection for music playback.
Amplitude controlled by state intensity level.

Uses longer hysteresis (6 frames ≈ 3 s) for smooth, non-jarring
track transitions.  Stress / focus scores are EMA-smoothed with a
slower alpha (0.18) for a polished listening experience.
"""

from .frontal_detectors import (
    classify_music_state, detect_stress_metrics,
    detect_focus_metrics, detect_mind_state, _make_state_hold,
)


class MusicControlModule:
    def __init__(self):
        self.current_state = "Calm"
        self.focus_history = []
        self._smooth_stress = 0.0
        self._smooth_focus = 0.0
        self._ema_alpha = 0.18  # slower than default → smoother music UX
        self._module_id = "music"
        self._state_hold = _make_state_hold(hold_frames=6)

    def _ema(self, prev, new):
        return prev + self._ema_alpha * (new - prev)

    def process(self, feature_vector, meta=None):
        music_state = classify_music_state(
            feature_vector, meta=meta, state_hold=self._state_hold,
        )
        stress = detect_stress_metrics(feature_vector, meta=meta)
        focus = detect_focus_metrics(feature_vector, self.focus_history, meta=meta)
        mind_state = detect_mind_state(
            feature_vector, meta=meta, state_hold=self._state_hold,
            module_id=self._module_id,
        )

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
            "signal_quality": mind_state.get("signal_quality", 1.0),
        }
