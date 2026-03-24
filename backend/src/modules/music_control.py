"""
Music Control Module
Determines music control actions based on EEG state.
"""

class MusicControlModule:
    def __init__(self):
        self.current_state = "Calm"
        
    def process(self, feature_vector):
        """
        Expects feature_vector list:
        [delta, theta, alpha, beta, gamma, theta_beta, alpha_beta, beta_alpha, alpha_theta, calm, stress, engage, gamma_beta]
        """
        theta = feature_vector[1]
        alpha = feature_vector[2]
        beta = feature_vector[3]
        
        # Simple heuristic to determine dominant state
        # In a real system, this would use the random forest models loaded from model_manager.
        
        # Normalize roughly for heuristic comparison (assuming raw power)
        total = theta + alpha + beta + 1e-6
        p_theta = theta / total
        p_alpha = alpha / total
        p_beta = beta / total
        
        action = "None"
        
        if p_beta > 0.4:
            state = "Focus"
            action = "Increase tempo"
        elif p_theta > 0.4:
            state = "Drowsy"
            action = "Play stimulating music"
        elif p_alpha > 0.4 and p_theta > 0.3:
            state = "Calm"
            action = "Lower volume"
        elif p_alpha > 0.4:
            state = "Relax"
            action = "Play calm music"
        else:
            state = "Neutral"
            
        self.current_state = state
        
        return {
            "state": state,
            "action": action
        }
