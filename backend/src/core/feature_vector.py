"""
Feature Vector Extraction
Calculates the final feature vector with band power ratios for frontal applications.

Returns: (feature_vector, meta)
  feature_vector: list of 14 features (13 ratios + total_power)
  meta: dict with 'signal_quality' (0.0-1.0) and 'total_power'
"""

# Minimum total power threshold — below this the signal is likely noise/loose electrode.
# Calibrated for typical Fpz EEG with ~1-50 μV² total band power from filtered data
# using Welch PSD with overlapping segments.
MIN_TOTAL_POWER = 0.01  # μV²/Hz equivalent from Welch PSD sum


def compute_feature_vector(band_powers):
    """
    Computes the standard frontal feature vector from band powers.

    Returns: (list of 14 features, dict with signal_quality and total_power)
    """
    delta = float(band_powers.get('delta', 0.0))
    theta = float(band_powers.get('theta', 0.0))
    alpha = float(band_powers.get('alpha', 0.0))
    beta = float(band_powers.get('beta', 0.0))
    gamma = float(band_powers.get('gamma', 0.0))
    total_power = float(band_powers.get('total', delta + theta + alpha + beta + gamma))

    epsilon = 1e-6

    theta_beta_ratio = theta / (beta + epsilon)
    alpha_beta_ratio = alpha / (beta + epsilon)
    beta_alpha_ratio = beta / (alpha + epsilon)
    alpha_theta_ratio = alpha / (theta + epsilon)

    alpha_theta_sum = alpha + theta
    calm_index = alpha_theta_sum / (beta + epsilon)
    # Exclude gamma from stress_index — for single-channel Fpz,
    # gamma is mostly muscle/electrode artifact, not cortical gamma
    stress_index = beta / (alpha_theta_sum + epsilon)
    engagement_index = beta / (alpha + epsilon)
    gamma_beta_ratio = gamma / (beta + epsilon)

    # Signal quality: 0.0 (noise) → 1.0 (strong signal)
    signal_quality = min(1.0, total_power / max(MIN_TOTAL_POWER, 0.01))

    features = [
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
        gamma_beta_ratio,
        total_power,
    ]

    meta = {
        "signal_quality": round(signal_quality, 3),
        "total_power": round(total_power, 6),
    }

    return features, meta
