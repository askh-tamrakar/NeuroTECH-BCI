"""
Shared detection heuristics for frontal EEG application modules.

All modules (Music, Meditation, Bubble Game) share a SINGLE state
detection pipeline via detect_mind_state() so states agree across pages.

Feature vector layout (13 elements):
  [0] delta  [1] theta  [2] alpha  [3] beta  [4] gamma
  [5] theta/beta  [6] alpha/beta  [7] beta/alpha  [8] alpha/theta
  [9] calm_index=(alpha+theta)/beta
  [10] stress_index=beta/(alpha+theta)
  [11] engagement=beta/alpha
  [12] gamma/beta
"""

from __future__ import annotations


def _safe(feature_vector, index, default=0.0):
    try:
        return float(feature_vector[index])
    except Exception:
        return float(default)


# ── Music action helper (derives action from unified state) ──────────
def classify_music_state(feature_vector):
    """Kept for backward-compat but now delegates to detect_mind_state."""
    theta = _safe(feature_vector, 1)
    alpha = _safe(feature_vector, 2)
    beta = _safe(feature_vector, 3)
    total = theta + alpha + beta + 1e-6

    state_result = detect_mind_state(feature_vector)
    state = state_result["state"]

    ACTION_MAP = {
        "Focus": "Increase tempo",
        "Calm": "Lower volume",
        "Relaxed": "Play calm music",
        "Stressed": "Play calming music",
        "Drowsy": "Play stimulating music",
        "Neutral": "Maintain current track",
    }
    return {
        "state": state,
        "action": ACTION_MAP.get(state, "Maintain current track"),
        "band_mix": {
            "theta": theta / total,
            "alpha": alpha / total,
            "beta": beta / total,
        },
    }


# ── Focus metrics ────────────────────────────────────────────────────
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
        "neurofeedback_indicator": "green" if score > 65 else ("yellow" if score > 40 else "red"),
    }


# ── Meditation metrics ───────────────────────────────────────────────
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
    radar_bands = [
        int(14 + (delta / total_all) * 10),
        int(18 + (score / 100.0) * 15 + p_theta * 10),
        int(22 + (score / 100.0) * 22 + p_alpha * 10),
        int(max(8, 28 - (score / 100.0) * 20 + p_beta * 10)),
        int(8 + (gamma / total_all) * 10),
    ]

    return {
        "meditation_score": score,
        "calmness_meter": score,
        "breathing_guide": breathing_guide,
        "relaxation_trend": trend,
        "band_mix": {"theta": p_theta, "alpha": p_alpha, "beta": p_beta},
        "radar_bands": radar_bands,
    }


# ── Stress metrics ───────────────────────────────────────────────────
def detect_stress_metrics(feature_vector):
    stress_index = _safe(feature_vector, 10)
    # Scale: 0→0%, 1.0→50%, 2.0→100%. Most frontal Fpz signals
    # produce stress_index 0.05-2.0; clamp at 2.0 for full range.
    si_clamped = max(0.0, min(2.0, stress_index))
    score = int((si_clamped / 2.0) * 100)

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
        "breathing_suggestion": suggestion,
    }


# ── Unified mind state detection ─────────────────────────────────────
# Shared hysteresis state — single instance for entire process
_state_hold = {"prev": "Neutral", "count": 0, "HOLD": 5}


def detect_mind_state(feature_vector):
    """Unified mind state detection for ALL pages.

    Optimized for single-channel Fpz (A1/A2 reference).
    Uses confidence scores with controlled scaling so one band
    cannot permanently dominate, plus 5-frame hysteresis.

    States: Focus, Calm, Relaxed, Stressed, Drowsy, Neutral
    """
    delta = _safe(feature_vector, 0)
    theta = _safe(feature_vector, 1)
    alpha = _safe(feature_vector, 2)
    beta = _safe(feature_vector, 3)
    calm_index = _safe(feature_vector, 9)
    stress_index = _safe(feature_vector, 10)
    engagement_index = _safe(feature_vector, 11)

    # Proportional power (exclude gamma — mostly artifact on Fpz)
    total = delta + theta + alpha + beta + 1e-6
    p_delta = delta / total
    p_theta = theta / total
    p_alpha = alpha / total
    p_beta = beta / total

    # ── Confidence formulas (each 0-100, balanced competition) ──────────
    #
    # Focus: needs beta above baseline (~15%) + engagement
    #   Beta-dominant (p_beta=0.50,ei=2.64): (0.35)*180+0.88*25 = 63+22 = 85
    #   Alpha-dominant (p_beta=0.07): 0 → ~1
    focus_beta = max(0.0, p_beta - 0.15) * 180
    eng_norm = min(1.0, engagement_index / 3.0)
    focus_conf = min(100, int(focus_beta + eng_norm * 25))

    # Calm: dominant alpha, light calm_index bonus
    #   Alpha-dominant (p_alpha=0.87,ci=12.6): 0.87*90+1.0*15 = 78+15 = 93
    #   Beta-dominant (p_alpha=0.19,ci=0.75): 0.19*90+0.19*15 = 17+3 = 20
    ci_norm = min(1.0, calm_index / 4.0)
    calm_conf = min(100, int(p_alpha * 90 + ci_norm * 15))

    # Relaxed: simultaneous alpha AND theta (meditation-like)
    #   Theta+alpha both 40%: (0.40*0.5+0.40*0.5)*150 = 60
    relax_blend = p_alpha * 0.50 + p_theta * 0.50
    relaxed_conf = min(100, int(relax_blend * 150))

    # Stressed: driven primarily by stress_index, not raw beta
    #   This separates stress (anxious beta) from focus (engaged beta)
    #   Beta-dom (si=1.33): 0.67*80+0.50*30 = 53+15 = 68
    #   Very stressed (si=4.0): 1.0*80+0.70*30 = 80+21 = 100
    si_norm = min(1.0, stress_index / 2.0)
    stressed_conf = min(100, int(si_norm * 80 + p_beta * 30))

    # Drowsy: needs high delta+theta (both slow waves)
    #   Truly drowsy (d=40%,t=35%): 0.40*100+0.35*60 = 40+21 = 61
    #   Normal awake (d=12%,t=19%): 0.12*100+0.19*60 = 12+11 = 23
    drowsy_conf = min(100, int(p_delta * 100 + p_theta * 60))

    # Dampen focus when stress_index is very high (anxious arousal ≠ attention)
    if stress_index > 1.5:
        dampen = max(0.3, 1.0 - (stress_index - 1.5) * 0.3)
        focus_conf = int(focus_conf * dampen)

    all_states = {
        "Focus": focus_conf,
        "Calm": calm_conf,
        "Relaxed": relaxed_conf,
        "Stressed": stressed_conf,
        "Drowsy": drowsy_conf,
    }

    dominant = max(all_states, key=all_states.get)
    level = all_states[dominant]

    # If nothing scores above 15, call it Neutral
    if level < 15:
        dominant = "Neutral"
        level = 50

    # Hysteresis: require HOLD consecutive frames of a new state
    if dominant != _state_hold["prev"]:
        _state_hold["count"] += 1
        if _state_hold["count"] >= _state_hold["HOLD"]:
            _state_hold["prev"] = dominant
            _state_hold["count"] = 0
        else:
            dominant = _state_hold["prev"]
            level = all_states.get(dominant, level)
    else:
        _state_hold["count"] = 0

    return {
        "state": dominant,
        "state_level": level,
        "all_states": all_states,
    }
