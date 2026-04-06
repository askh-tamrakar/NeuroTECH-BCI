"""
Shared detection heuristics for frontal EEG application modules.
"""

from __future__ import annotations


def _safe(feature_vector, index, default=0.0):
    try:
        return float(feature_vector[index])
    except Exception:
        return float(default)


def classify_music_state(feature_vector):
    theta = _safe(feature_vector, 1)
    alpha = _safe(feature_vector, 2)
    beta = _safe(feature_vector, 3)

    total = theta + alpha + beta + 1e-6
    p_theta = theta / total
    p_alpha = alpha / total
    p_beta = beta / total

    action = "Maintain current track"
    if p_beta > 0.48:
        state = "Focus"
        action = "Increase tempo"
    elif p_theta > 0.46:
        state = "Drowsy"
        action = "Play stimulating music"
    elif p_alpha > 0.42 and p_theta > 0.22:
        state = "Calm"
        action = "Lower volume"
    elif p_alpha > 0.42:
        state = "Relax"
        action = "Play calm music"
    else:
        state = "Neutral"

    return {
        "state": state,
        "action": action,
        "band_mix": {
            "theta": p_theta,
            "alpha": p_alpha,
            "beta": p_beta,
        }
    }


def detect_focus_metrics(feature_vector, history):
    theta_beta = _safe(feature_vector, 5)
    engagement = _safe(feature_vector, 11)

    eng_clamped = max(0.0, min(2.5, engagement))
    ratio_bonus = max(0.0, min(1.0, 1.0 - min(theta_beta, 1.5) / 1.5))
    score = int(max(0.0, min(1.0, (eng_clamped / 2.5) * 0.75 + ratio_bonus * 0.25)) * 100)

    history.append(score)
    if len(history) > 10:
        history.pop(0)

    trend = "Stable"
    if len(history) >= 2:
        if score > history[-2] + 5:
            trend = "Increasing"
        elif score < history[-2] - 5:
            trend = "Decreasing"

    return {
        "focus_score": score,
        "focus_trend": trend,
        "attention_drop_detection": trend == "Decreasing" and score < 40,
        "neurofeedback_indicator": "green" if score > 65 else ("yellow" if score > 40 else "red")
    }


def detect_meditation_metrics(feature_vector):
    calm_index = _safe(feature_vector, 9)
    ci_clamped = max(0.0, min(5.0, calm_index))
    score = int((ci_clamped / 5.0) * 100)

    if score > 80:
        breathing_guide = "Maintain slow, deep breaths"
        trend = "Deep Meditation"
    elif score > 50:
        breathing_guide = "Breathe in... Breathe out..."
        trend = "Relaxing"
    else:
        breathing_guide = "Focus on your breath to relax"
        trend = "Active mind"

    delta = _safe(feature_vector, 0)
    theta = _safe(feature_vector, 1)
    alpha = _safe(feature_vector, 2)
    beta = _safe(feature_vector, 3)
    gamma = _safe(feature_vector, 4)

    total_tab = theta + alpha + beta + 1e-6
    p_theta = theta / total_tab
    p_alpha = alpha / total_tab
    p_beta = beta / total_tab

    total_all = delta + theta + alpha + beta + gamma + 1e-6
    # Smoothed radar representations that prevent huge delta from squashing other bands visually
    radar_bands = [
        int(14 + (delta / total_all) * 10),
        int(18 + (score / 100.0) * 15 + p_theta * 10),
        int(22 + (score / 100.0) * 22 + p_alpha * 10),
        int(max(8, 28 - (score / 100.0) * 20 + p_beta * 10)),
        int(8 + (gamma / total_all) * 10)
    ]

    return {
        "meditation_score": score,
        "calmness_meter": score,
        "breathing_guide": breathing_guide,
        "relaxation_trend": trend,
        "band_mix": {
            "theta": p_theta,
            "alpha": p_alpha,
            "beta": p_beta
        },
        "radar_bands": radar_bands
    }


def detect_stress_metrics(feature_vector):
    stress_index = _safe(feature_vector, 10)
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
