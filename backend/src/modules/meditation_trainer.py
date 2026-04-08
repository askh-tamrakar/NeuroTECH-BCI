"""
Meditation Trainer Module
Evaluates calmness and provides neurofeedback.
"""

from .frontal_detectors import detect_meditation_metrics


class MeditationTrainerModule:
    def process(self, feature_vector):
        """
        Indices: 1=theta, 2=alpha, 3=beta, 9=calm_index
        """
        return detect_meditation_metrics(feature_vector)
