"""
Stress Monitor Module
Detects sudden increases in beta power relative to calm bands.
"""

class StressMonitorModule:
    def process(self, feature_vector):
        """
        Indices: 2=alpha, 3=beta, 10=stress_index
        """
        stress_index = feature_vector[10]
        
        # Stress index is beta / (alpha + theta)
        # Values > 1.0 indicate cognitive load or stress. 
        # Values > 2.0 might be high stress.
        
        si_clamped = max(0.0, min(3.0, stress_index))
        score = int((si_clamped / 3.0) * 100)
        
        if score > 75:
            state = "High Stress"
            break_rec = True
            suggestion = "Take a 5 minute break. Box breathing recommended."
        elif score > 50:
            state = "Elevated"
            break_rec = False
            suggestion = "Consider pausing soon."
        else:
            state = "Calm"
            break_rec = False
            suggestion = "You are doing great."
            
        return {
            "stress_score": score,
            "calm_vs_stress_state": state,
            "break_recommendation": break_rec,
            "breathing_suggestion": suggestion
        }
