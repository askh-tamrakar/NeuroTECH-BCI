"""
Feature Vector Extraction
Calculates the final feature vector with band power ratios for frontal applications.
"""

def compute_feature_vector(band_powers):
    """
    Computes the standard frontal feature vector from band powers.
    Returns: list of 13 features
    """
    delta = float(band_powers.get('delta', 0.0))
    theta = float(band_powers.get('theta', 0.0))
    alpha = float(band_powers.get('alpha', 0.0))
    beta = float(band_powers.get('beta', 0.0))
    gamma = float(band_powers.get('gamma', 0.0))
    
    epsilon = 1e-6
    
    theta_beta_ratio = theta / (beta + epsilon)
    alpha_beta_ratio = alpha / (beta + epsilon)
    beta_alpha_ratio = beta / (alpha + epsilon)
    alpha_theta_ratio = alpha / (theta + epsilon)
    
    alpha_theta_sum = alpha + theta
    calm_index = alpha_theta_sum / (beta + epsilon)
    stress_index = (beta + gamma) / (alpha_theta_sum + epsilon)
    engagement_index = beta / (alpha + epsilon)
    gamma_beta_ratio = gamma / (beta + epsilon)
    
    return [
        delta,
        theta,
        alpha,
        beta,
        gamma,
        theta_beta_ratio,
        alpha_beta_ratio,
        beta_alpha_ratio,
        alpha_theta_ratio,
        calm_index,
        stress_index,
        engagement_index,
        gamma_beta_ratio
    ]
