from .frontal_detectors import detect_stress_metrics, detect_focus_metrics, detect_mind_state


class BubbleGameModule:
    """Bubble Game Module.
    Stress controls bubble production rate and density.
    Focus controls automatic bubble popping speed.
    """
    def __init__(self):
        self.focus_history = []
        self._smooth_stress = 0.0
        self._smooth_focus = 0.0
        self._ema_alpha = 0.20  # lower = smoother

    def _ema(self, prev, new):
        return prev + self._ema_alpha * (new - prev)

    def process(self, feature_vector):
        stress = detect_stress_metrics(feature_vector)
        focus = detect_focus_metrics(feature_vector, self.focus_history)
        state = detect_mind_state(feature_vector)

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
        }
