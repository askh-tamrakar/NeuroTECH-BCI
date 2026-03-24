"""
Focus Monitor Module
Tracks attention and focus levels.
"""

class FocusMonitorModule:
    def __init__(self):
        self.history = []
        
    def process(self, feature_vector):
        """
        Expects feature_vector list.
        Indices: 3=beta, 5=theta_beta_ratio, 11=engagement_index
        """
        beta = feature_vector[3]
        theta_beta = feature_vector[5]
        engagement = feature_vector[11]
        
        # Focus score heuristic (0-100)
        # High engagement index and low theta/beta ratio = high focus
        # engagement index is beta / (alpha + theta)
        
        # Clamp engagement to a reasonable range [0, 2.0] for scoring
        eng_clamped = max(0.0, min(2.0, engagement))
        score = int((eng_clamped / 2.0) * 100)
        
        self.history.append(score)
        if len(self.history) > 10:
            self.history.pop(0)
            
        trend = "Stable"
        if len(self.history) >= 2:
            if score > self.history[-2] + 5: trend = "Increasing"
            elif score < self.history[-2] - 5: trend = "Decreasing"
            
        attention_drop = True if trend == "Decreasing" and score < 40 else False
        
        return {
            "focus_score": score,
            "focus_trend": trend,
            "attention_drop_detection": attention_drop,
            "neurofeedback_indicator": "green" if score > 60 else ("yellow" if score > 40 else "red")
        }
