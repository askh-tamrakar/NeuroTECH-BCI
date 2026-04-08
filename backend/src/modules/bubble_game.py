from .frontal_detectors import detect_stress_metrics, detect_focus_metrics, detect_mind_state


class BubbleGameModule:
    """Bubble Game Module.
    Stress controls bubble production rate and density.
    Focus controls automatic bubble popping speed.
    """
    def __init__(self):
        self.focus_history = []

    def process(self, feature_vector):
        stress = detect_stress_metrics(feature_vector)
        focus = detect_focus_metrics(feature_vector, self.focus_history)
        state = detect_mind_state(feature_vector)
        return {
            "stress_score": stress["stress_score"],
            "focus_score": focus["focus_score"],
            "stress_state": stress["calm_vs_stress_state"],
            "focus_trend": focus["focus_trend"],
            "state": state["state"],
            "state_level": state["state_level"],
        }
