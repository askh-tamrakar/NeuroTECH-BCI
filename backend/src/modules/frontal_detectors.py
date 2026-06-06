"""
Shared detection heuristics for frontal EEG application modules.

All modules (Music, Meditation, Bubble Game) share a SINGLE state
detection pipeline via detect_mind_state() so states agree across pages.
Each module maintains its OWN hysteresis state and passes a module_id
for per-application tuning.

Feature vector layout (14 elements):
  [0] delta  [1] theta  [2] alpha  [3] beta  [4] gamma
  [5] theta/beta  [6] alpha/beta  [7] beta/alpha  [8] alpha/theta
  [9] calm_index=(alpha+theta)/beta
  [10] stress_index=beta/(alpha+theta)
  [11] engagement=beta/alpha
  [12] gamma/beta
  [13] total_power (absolute)

Meta dict:
  { "signal_quality": 0.0-1.0, "total_power": float }
"""

from __future__ import annotations


def _safe(feature_vector, index, default=0.0):
    try:
        return float(feature_vector[index])
    except Exception:
        return float(default)


# ── Module-specific tuning profiles ──────────────────────────────────
# Each profile tunes: hysteresis hold, confidence weights, EMA alpha
_MODULE_PROFILES = {
    "music": {
        "hold": 6,          # slower switching → smoother music experience
        "focus_beta_weight": 100,
        "calm_alpha_weight": 75,
        "stressed_si_weight": 60,
        "drowsy_theta_weight": 60,
        "neutral_threshold": 12,
    },
    "bubble": {
        "hold": 3,          # faster switching → responsive gameplay
        "focus_beta_weight": 140,
        "calm_alpha_weight": 85,
        "stressed_si_weight": 80,
        "drowsy_theta_weight": 75,
        "neutral_threshold": 10,
    },
    "default": {
        "hold": 5,
        "focus_beta_weight": 120,
        "calm_alpha_weight": 80,
        "stressed_si_weight": 70,
        "drowsy_theta_weight": 70,
        "neutral_threshold": 15,
    },
}

# Minimum total power threshold — below this the signal is likely noise/loose electrode.
# Calibrated for typical Fpz EEG with ~1-50 μV² total band power from filtered data
# using Welch PSD with overlapping segments.
MIN_TOTAL_POWER = 0.01  # μV²/Hz equivalent from Welch PSD sum

# Minimum signal quality (0-1) to short-circuit to "No Signal".
# Below this the signal is almost certainly noise.
MIN_SIGNAL_QUALITY = 0.03


def _sq_dampen(sq, floor=0.35):
    """Gentle signal-quality dampening: sq=0.1→0.42, sq=0.5→0.68, sq=1.0→1.0."""
    return min(1.0, floor + sq * (1.0 - floor))


def _get_profile(module_id):
    return _MODULE_PROFILES.get(module_id, _MODULE_PROFILES["default"])


# ── Music action helper (derives action from unified state) ──────────
def classify_music_state(feature_vector, meta=None, state_hold=None):
    """Kept for backward-compat but now delegates to detect_mind_state."""
    theta = _safe(feature_vector, 1)
    alpha = _safe(feature_vector, 2)
    beta = _safe(feature_vector, 3)
    total = theta + alpha + beta + 1e-6

    state_result = detect_mind_state(feature_vector, meta=meta,
                                     state_hold=state_hold, module_id="music")
    state = state_result["state"]

    ACTION_MAP = {
        "Focus": "Increase tempo",
        "Calm": "Lower volume",
        "Relaxed": "Play calm music",
        "Stressed": "Play calming music",
        "Drowsy": "Play stimulating music",
        "Neutral": "Maintain current track",
        "No Signal": "Waiting for signal…",
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
def detect_focus_metrics(feature_vector, history, meta=None):
    theta_beta = _safe(feature_vector, 5)
    engagement = _safe(feature_vector, 11)
    beta_abs = _safe(feature_vector, 3)   # absolute beta power

    # When absolute beta power is negligible, ratios are noise — clamp score
    MIN_BETA_POWER = 0.005  # below this, focus metrics are unreliable

    eng_clamped = max(0.0, min(2.5, engagement))
    ratio_bonus = max(0.0, min(1.0, 1.0 - min(theta_beta, 1.5) / 1.5))
    raw_score = int(max(0.0, min(1.0, (eng_clamped / 2.5) * 0.75 + ratio_bonus * 0.25)) * 100)

    # Gate on absolute beta: if beta is tiny, the ratio_bonus is fake
    beta_gate = min(1.0, beta_abs / max(MIN_BETA_POWER, 0.001))
    raw_score = int(raw_score * beta_gate)

    # Soft gate on signal quality — gentle dampening, not crushing
    sq = (meta or {}).get("signal_quality", 1.0)
    dampen = _sq_dampen(sq)
    score = int(raw_score * dampen)

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
def detect_meditation_metrics(feature_vector, meta=None):
    calm_index = _safe(feature_vector, 9)
    ci_clamped = max(0.0, min(5.0, calm_index))
    score = int((ci_clamped / 5.0) * 100)

    sq = (meta or {}).get("signal_quality", 1.0)
    dampen = _sq_dampen(sq)
    score = int(score * dampen)

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
def detect_stress_metrics(feature_vector, meta=None):
    stress_index = _safe(feature_vector, 10)
    # Scale: 0→0%, 1.0→50%, 2.0→100%. Most frontal Fpz signals
    # produce stress_index 0.05-2.0; clamp at 2.0 for full range.
    si_clamped = max(0.0, min(2.0, stress_index))
    raw_score = int((si_clamped / 2.0) * 100)

    # Soft gate on signal quality
    sq = (meta or {}).get("signal_quality", 1.0)
    dampen = _sq_dampen(sq)
    score = int(raw_score * dampen)

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
# Each caller maintains its own hysteresis via the state_hold parameter.
# If not provided, a default single-instance fallback is used (legacy compat).

_legacy_state_hold = {"prev": "Neutral", "count": 0, "HOLD": 5}


def _make_state_hold(hold_frames=5):
    return {"prev": "Neutral", "count": 0, "HOLD": hold_frames}


def detect_mind_state(feature_vector, meta=None, state_hold=None, module_id="default"):
    """Unified mind state detection for ALL pages.

    Optimized for single-channel Fpz (A1/A2 reference).
    Uses confidence scores with controlled scaling so one band
    cannot permanently dominate, plus per-module hysteresis.

    Args:
        feature_vector: 14-element list of features.
        meta: dict with 'signal_quality' (0-1).
        state_hold: per-caller hysteresis dict (created by _make_state_hold).
                    If None, falls back to a legacy module-level global.
        module_id: "music", "bubble", "focus", "stress", "meditation", or "default".

    Returns:
        dict with state, state_level, all_states, signal_quality.
    """
    profile = _get_profile(module_id)

    delta = _safe(feature_vector, 0)
    theta = _safe(feature_vector, 1)
    alpha = _safe(feature_vector, 2)
    beta = _safe(feature_vector, 3)
    calm_index = _safe(feature_vector, 9)
    stress_index = _safe(feature_vector, 10)
    engagement_index = _safe(feature_vector, 11)

    sq = (meta or {}).get("signal_quality", 1.0)

    # If signal is too weak, short-circuit to "No Signal"
    if sq < MIN_SIGNAL_QUALITY:
        return {
            "state": "No Signal",
            "state_level": 0,
            "all_states": {
                "Focus": 0, "Calm": 0, "Relaxed": 0,
                "Stressed": 0, "Drowsy": 0,
            },
            "signal_quality": round(sq, 3),
        }

    # Proportional cognitive power (exclude delta and gamma — heavily artifacted on Fpz)
    total_tab = theta + alpha + beta + 1e-6
    p_theta = theta / total_tab
    p_alpha = alpha / total_tab
    p_beta = beta / total_tab

    # Global delta ratio strictly for drowsiness bounding
    p_delta_global = delta / (delta + total_tab)

    # ── Confidence formulas (each 0-100, balanced competition) ──────────
    #
    # Focus: needs beta above baseline TAB (~20%) + engagement
    focus_beta = max(0.0, p_beta - 0.18) * profile["focus_beta_weight"]
    eng_norm = min(1.0, engagement_index / 3.0)
    focus_conf = min(100, int(focus_beta + eng_norm * 55))

    # Calm: dominant alpha in TAB
    ci_norm = min(1.0, calm_index / 4.0)
    calm_conf = min(100, int(p_alpha * profile["calm_alpha_weight"] + ci_norm * 25))

    # Relaxed: simultaneous alpha AND theta (meditation-like)
    relax_blend = p_alpha * 0.45 + p_theta * 0.55
    relaxed_conf = min(100, int(relax_blend * 105))

    # Stressed: driven primarily by stress_index and beta dominance
    si_norm = min(1.0, stress_index / 2.0)
    stressed_conf = min(100, int(si_norm * profile["stressed_si_weight"] + p_beta * 55))

    # Drowsy: high theta-dominance, dampened delta (blink artifact resistant)
    drowsy_conf = min(100, int(p_theta * profile["drowsy_theta_weight"]
                               + max(0.0, p_delta_global - 0.60) * 50))

    # Dampen focus when stress_index is very high (anxious arousal ≠ attention)
    if stress_index > 1.5:
        dampen = max(0.25, 1.0 - (stress_index - 1.5) * 0.35)
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

    # Gentle signal-quality scaling (never below 40 % of raw confidence)
    level = int(level * _sq_dampen(sq, floor=0.40))

    # If nothing scores above threshold, call it Neutral
    if level < profile["neutral_threshold"]:
        dominant = "Neutral"
        level = max(15, int(50 * _sq_dampen(sq, floor=0.30)))

    # Hysteresis: require HOLD consecutive frames of a new state
    sh = state_hold if state_hold is not None else _legacy_state_hold
    # Keep HOLD in sync with profile (in case profile changed at runtime)
    sh["HOLD"] = profile["hold"]

    if dominant != sh["prev"]:
        sh["count"] += 1
        if sh["count"] >= sh["HOLD"]:
            sh["prev"] = dominant
            sh["count"] = 0
        else:
            dominant = sh["prev"]
            level = all_states.get(dominant, level)
    else:
        sh["count"] = 0

    return {
        "state": dominant,
        "state_level": level,
        "all_states": all_states,
        "signal_quality": round(sq, 3),
    }
