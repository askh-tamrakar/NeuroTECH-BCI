"""
Stress Monitor Module
Detects sudden increases in beta power relative to calm bands.
"""

from .frontal_detectors import detect_stress_metrics


class StressMonitorModule:
    def process(self, feature_vector, meta=None):
        """
        Indices: 2=alpha, 3=beta, 10=stress_index
        """
        return detect_stress_metrics(feature_vector, meta=meta)
