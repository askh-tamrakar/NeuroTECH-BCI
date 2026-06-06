/**
 * HRV-based mental state classifier — ported from CortEX stateClassifier.ts
 * Uses SDNN, RMSSD, and pNN50 thresholds to determine current psychological state.
 */

export const STATE_ICONS = {
  stressed: '😰',
  relaxed:  '😌',
  happy:    '😄',
  focused:  '🧠',
  neutral:  '😐',
  mild_stress: '😟',
  no_data:  '⏳',
};

export const STATE_COLORS = {
  stressed:    '#ef4444',
  relaxed:     '#3b82f6',
  happy:       '#22c55e',
  focused:     '#eab308',
  neutral:     '#06b6d4',
  mild_stress: '#f97316',
  no_data:     '#a1a1aa',
};

/**
 * @param {{ sdnn: number, rmssd: number, pnn50: number }} hrv
 * @returns {keyof typeof STATE_ICONS}
 */
export function predictState({ sdnn, rmssd, pnn50 }) {
  if (
    typeof sdnn  !== 'number' || isNaN(sdnn) ||
    typeof rmssd !== 'number' || isNaN(rmssd) ||
    typeof pnn50 !== 'number' || isNaN(pnn50)
  ) {
    return 'no_data';
  }

  // Weak / no signal
  if (sdnn < 5 && rmssd < 5 && pnn50 < 10) return 'no_data';

  // Confirmed stress: physiological suppression
  if (rmssd < 20 && sdnn < 30) return 'stressed';

  // Mild stress / early anxiety
  if ((rmssd < 30 && sdnn < 50) || (rmssd < 35 && pnn50 < 20)) return 'mild_stress';

  // Cognitive focus (not relaxed, not anxious)
  if (rmssd >= 20 && rmssd <= 50 && sdnn >= 30 && pnn50 < 30) return 'focused';

  // Happy
  if (rmssd >= 30 && rmssd <= 70 && sdnn >= 30 && pnn50 > 50) return 'happy';

  // Relaxed
  if (rmssd > 50 && sdnn > 50 && pnn50 > 40) return 'relaxed';

  return 'neutral';
}

/**
 * Get style object for a state badge.
 * @param {keyof typeof STATE_ICONS} state
 */
export function stateBadgeStyle(state) {
  const color = STATE_COLORS[state] || STATE_COLORS.no_data;
  return {
    background: `${color}18`,
    border:     `1px solid ${color}40`,
    color,
  };
}
