"""
Focus Monitor Module
Tracks attention and focus levels.
"""

from .frontal_detectors import detect_focus_metrics


class FocusMonitorModule:
    def __init__(self):
        self.history = []
        
    def process(self, feature_vector):
        """
        Expects feature_vector list.
        Indices: 3=beta, 5=theta_beta_ratio, 11=engagement_index
        """
        return detect_focus_metrics(feature_vector, self.history)
