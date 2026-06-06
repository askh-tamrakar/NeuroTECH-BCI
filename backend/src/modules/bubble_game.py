"""
Bubble Game Module.
Stress controls bubble production rate and density.
Focus controls automatic bubble popping speed.

Uses faster hysteresis (3 frames ≈ 1.5 s) for responsive gameplay
and a quicker EMA alpha (0.30) so the game reacts to mental-state
changes with low latency.
"""

from .frontal_detectors import (
    detect_stress_metrics, detect_focus_metrics,
    detect_mind_state, _make_state_hold,
)


class BubbleGameModule:
    """Bubble Game Module.
    Stress controls bubble production rate and density.
    Focus controls automatic bubble popping speed.
    """
    def __init__(self):
        self.focus_history = []
        self._smooth_stress = 0.0
        self._smooth_focus = 0.0
        self._ema_alpha = 0.30  # faster response for gameplay
        self._module_id = "bubble"
        self._state_hold = _make_state_hold(hold_frames=3)

    def _ema(self, prev, new):
        return prev + self._ema_alpha * (new - prev)

    def process(self, feature_vector, meta=None):
        stress = detect_stress_metrics(feature_vector, meta=meta)
        focus = detect_focus_metrics(feature_vector, self.focus_history, meta=meta)
        state = detect_mind_state(
            feature_vector, meta=meta, state_hold=self._state_hold,
            module_id=self._module_id,
        )

        # EMA smooth scores to prevent harsh jumps
        self._smooth_stress = self._ema(self._smooth_stress, stress["stress_score"])
        self._smooth_focus = self._ema(self._smooth_focus, focus["focus_score"])

        return {
            "stress_score": round(self._smooth_stress),
            "focus_score": round(self._smooth_focus),
            "stress_state": stress["calm_vs_stress_state"],
            "focus_trend": focus["focus_trend"],
            "state": state["state"],
            "state_level": state["state_level"],
            "signal_quality": state.get("signal_quality", 1.0),
        }
