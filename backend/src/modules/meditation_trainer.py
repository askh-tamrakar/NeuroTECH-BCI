"""
Meditation Trainer Module
Evaluates calmness and provides neurofeedback.
"""

class MeditationTrainerModule:
    def process(self, feature_vector):
        """
        Indices: 1=theta, 2=alpha, 3=beta, 9=calm_index
        """
        calm_index = feature_vector[9]
        
        # Calm index is (alpha + theta) / beta
        # Typical values: 1.0 (alert), 2.0+ (relaxed), 5.0+ (deep meditation)
        
        # Map calm_index to a 0-100 score
        ci_clamped = max(0.0, min(5.0, calm_index))
        score = int((ci_clamped / 5.0) * 100)
        
        calmness_meter = score
        
        if score > 80:
            breathing_guide = "Maintain slow, deep breaths"
            trend = "Deep Meditation"
        elif score > 50:
            breathing_guide = "Breathe in... Breathe out..."
            trend = "Relaxing"
        else:
            breathing_guide = "Focus on your breath to relax"
            trend = "Active mind"
            
        return {
            "meditation_score": score,
            "calmness_meter": calmness_meter,
            "breathing_guide": breathing_guide,
            "relaxation_trend": trend
        }
