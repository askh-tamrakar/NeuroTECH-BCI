"""
Music Control Module
Determines music control actions based on EEG state.
"""

from .frontal_detectors import classify_music_state


class MusicControlModule:
    def __init__(self):
        self.current_state = "Calm"
        
    def process(self, feature_vector):
        """
        Expects feature_vector list:
        [delta, theta, alpha, beta, gamma, theta_beta, alpha_beta, beta_alpha, alpha_theta, calm, stress, engage, gamma_beta]
        """
        result = classify_music_state(feature_vector)
        self.current_state = result["state"]
        return result
