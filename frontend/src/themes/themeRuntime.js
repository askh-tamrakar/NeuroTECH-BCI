const HEX_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const THEME_REQUIRED_COLORS = [
  '--bg',
  '--surface',
  '--text',
  '--muted',
  '--primary',
  '--primary-contrast',
  '--accent',
  '--border',
  '--shadow',
  '--day',
  '--night',
  '--tree-day',
  '--tree-night',
  '--cloud-day',
  '--cloud-night',
  '--sun-day',
  '--moon-night',
  '--sky-day',
  '--sky-night',
  '--text-secondary',
  '--text-tertiary',
  '--text-highlight',
  '--text-error',
  '--text-success',
  '--title',
  '--heading',
  '--label',
  '--section-bg',
  '--section-border',
  '--panel-bg',
  '--panel-border',
  '--header-bg',
  '--header-text',
  '--event-bg',
  '--event-border',
  '--event-text',
  '--selection-bg',
  '--selection-border',
  '--graph-line-1',
  '--graph-line-2',
  '--graph-bg',
  '--graph-grid',
  '--graph-text',
  '--dino-day',
  '--dino-night',
  '--obstacle-day',
  '--obstacle-night',
  '--obstacle-border-day',
  '--obstacle-border-night',
  '--ground-day',
  '--ground-night',
  '--ground-line-day',
  '--ground-line-night',
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function isHexColor(value) {
  return typeof value === 'string' && HEX_REGEX.test(value.trim());
}

export function normalizeHex(value, fallback = '#000000') {
  if (!isHexColor(value)) return fallback;
  const clean = value.trim().replace('#', '');
  if (clean.length === 3) {
    return `#${clean.split('').map((char) => char + char).join('')}`.toUpperCase();
  }
  return `#${clean}`.toUpperCase();
}

export function hexToRgbTuple(value, fallback = '0, 0, 0') {
  const hex = normalizeHex(value, null);
  if (!hex) return fallback;
  const clean = hex.slice(1);
  const int = Number.parseInt(clean, 16);
  if (Number.isNaN(int)) return fallback;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `${r}, ${g}, ${b}`;
}

function rgbaString(value, alpha, fallbackHex = '#000000') {
  return `rgba(${hexToRgbTuple(value, hexToRgbTuple(fallbackHex))}, ${alpha})`;
}

function parseHexChannels(value) {
  const hex = normalizeHex(value, null);
  if (!hex) return null;
  const clean = hex.slice(1);
  const int = Number.parseInt(clean, 16);
  if (Number.isNaN(int)) return null;
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function mixHex(a, b, ratio = 0.5, fallback = '#000000') {
  const colorA = parseHexChannels(a);
  const colorB = parseHexChannels(b);
  if (!colorA || !colorB) return fallback;
  const t = clamp(ratio, 0, 1);
  const mixChannel = (key) => Math.round(colorA[key] * (1 - t) + colorB[key] * t);
  return normalizeHex(
    `#${[mixChannel('r'), mixChannel('g'), mixChannel('b')]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')}`,
    fallback
  );
}

function relativeLuminance(value) {
  const channels = parseHexChannels(value);
  if (!channels) return 0;
  const linear = [channels.r, channels.g, channels.b].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrastColor(background, dark = '#161616', light = '#F8F7F2') {
  return relativeLuminance(background) > 0.42 ? normalizeHex(dark, '#161616') : normalizeHex(light, '#F8F7F2');
}

function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureContrast(color, background, fallback, minRatio = 4.5) {
  if (!isHexColor(color) || !isHexColor(background)) return normalizeHex(fallback, '#161616');
  return contrastRatio(color, background) >= minRatio
    ? normalizeHex(color, fallback)
    : normalizeHex(fallback, '#161616');
}

function deriveWindowColor(baseColor, alpha, fallbackColor) {
  return rgbaString(baseColor || fallbackColor, alpha, fallbackColor);
}

export function getThemeChartPalette(colors = {}) {
  return [
    colors['--graph-line-1'],
    colors['--graph-line-2'],
    colors['--accent'],
    colors['--selection-border'],
    colors['--info'],
    colors['--warning'],
    colors['--success'],
    colors['--text-highlight'],
  ].filter(Boolean);
}

export function createNormalizedTheme(theme = {}) {
  const colors = { ...(theme.colors || {}) };
  const bg = colors['--bg'] || theme.navBase || '#111111';
  const surface = colors['--surface'] || colors['--section-bg'] || '#1B1B1B';
  const panelBg = colors['--panel-bg'] || surface;
  const text = colors['--text'] || '#F5F5F5';
  const muted = colors['--muted'] || colors['--text-secondary'] || '#BDBDBD';
  const primary = colors['--primary'] || theme.accent || colors['--accent'] || '#61DAFB';
  const accent = colors['--accent'] || theme.accent || primary;
  const border = colors['--border'] || colors['--panel-border'] || '#2A2A2A';
  const graphGrid = colors['--graph-grid'] || border;
  const textError = colors['--text-error'] || '#FF5A5A';
  const textSuccess = colors['--text-success'] || '#2FE6A6';
  const dinoDay = colors['--dino-day'] || colors['--dino'] || primary;
  const dinoNight = colors['--dino-night'] || colors['--dino'] || primary;
  const obstacleBorderDay = colors['--obstacle-border-day'] || colors['--obstacle-border'] || contrastColor(colors['--sky-day'] || colors['--day'] || bg);
  const obstacleBorderNight = colors['--obstacle-border-night'] || colors['--obstacle-border'] || contrastColor(colors['--sky-night'] || colors['--night'] || bg);
  const graphBg = colors['--graph-bg'] || bg;
  const graphLine1Base = colors['--graph-line-1'] || primary;
  const graphLine2Base = colors['--graph-line-2'] || accent;
  const graphTextBase = colors['--graph-text'] || colors['--text-secondary'] || muted;
  const graphLine1 = ensureContrast(graphLine1Base, graphBg, contrastColor(graphBg, '#7A3D00', '#8FD3FF'), 3);
  const graphLine2 = normalizeHex(graphLine2Base, accent);
  const graphText = ensureContrast(graphTextBase, graphBg, contrastColor(graphBg), 4.5);

  const normalizedColors = {
    '--bg': bg,
    '--surface': surface,
    '--text': text,
    '--muted': muted,
    '--primary': primary,
    '--primary-contrast': colors['--primary-contrast'] || text,
    '--accent': accent,
    '--border': border,
    '--shadow': colors['--shadow'] || 'rgba(0, 0, 0, 0.35)',
    '--day': colors['--day'] || '#F5F5F5',
    '--night': colors['--night'] || bg,
    '--tree-day': colors['--tree-day'] || primary,
    '--tree-night': colors['--tree-night'] || panelBg,
    '--cloud-day': colors['--cloud-day'] || '#FFFFFF',
    '--cloud-night': colors['--cloud-night'] || border,
    '--sun-day': colors['--sun-day'] || primary,
    '--moon-night': colors['--moon-night'] || text,
    '--sky-day': colors['--sky-day'] || colors['--day'] || '#F5F5F5',
    '--sky-night': colors['--sky-night'] || colors['--night'] || bg,
    '--text-secondary': colors['--text-secondary'] || muted,
    '--text-tertiary': colors['--text-tertiary'] || mixHex(muted, bg, 0.35, muted),
    '--text-highlight': colors['--text-highlight'] || accent,
    '--text-error': textError,
    '--text-success': textSuccess,
    '--title': colors['--title'] || primary,
    '--heading': colors['--heading'] || text,
    '--label': colors['--label'] || muted,
    '--section-bg': colors['--section-bg'] || surface,
    '--section-border': colors['--section-border'] || border,
    '--panel-bg': panelBg,
    '--panel-border': colors['--panel-border'] || border,
    '--header-bg': colors['--header-bg'] || bg,
    '--header-text': colors['--header-text'] || text,
    '--event-bg': colors['--event-bg'] || rgbaString(primary, 0.2, primary),
    '--event-border': colors['--event-border'] || primary,
    '--event-text': colors['--event-text'] || text,
    '--selection-bg': colors['--selection-bg'] || rgbaString(accent, 0.22, accent),
    '--selection-border': colors['--selection-border'] || accent,
    '--graph-line-1': graphLine1,
    '--graph-line-2': graphLine2,
    '--graph-bg': graphBg,
    '--graph-grid': graphGrid,
    '--graph-text': graphText,
    '--dino-day': dinoDay,
    '--dino-night': dinoNight,
    '--obstacle-day': colors['--obstacle-day'] || colors['--obstacle'] || primary,
    '--obstacle-night': colors['--obstacle-night'] || colors['--obstacle'] || accent,
    '--obstacle-border-day': obstacleBorderDay,
    '--obstacle-border-night': obstacleBorderNight,
    '--ground-day': colors['--ground-day'] || colors['--ground'] || surface,
    '--ground-night': colors['--ground-night'] || colors['--ground'] || panelBg,
    '--ground-line-day': colors['--ground-line-day'] || colors['--ground-line'] || accent,
    '--ground-line-night': colors['--ground-line-night'] || colors['--ground-line'] || primary,
  };

  return {
    ...theme,
    accent: theme.accent || accent,
    navBase: theme.navBase || bg,
    navPill: theme.navPill || accent,
    colors: normalizedColors,
  };
}

export function createThemeRuntimeTokens(theme = {}) {
  const normalizedTheme = createNormalizedTheme(theme);
  const colors = normalizedTheme.colors;
  const accent = colors['--accent'];
  const primary = colors['--primary'];
  const border = colors['--border'];
  const bg = colors['--bg'];
  const surface = colors['--surface'];
  const panelBg = colors['--panel-bg'];
  const graphGrid = colors['--graph-grid'];
  const text = colors['--text'];
  const warning = colors['--warning'] || '#FFB020';
  const info = colors['--info'] || '#8C7DFF';
  const success = colors['--success'] || '#2FE6A6';
  const danger = colors['--danger'] || colors['--text-error'] || '#FF5A5A';

  const runtime = {
    '--nav-base': normalizedTheme.navBase,
    '--nav-pill': normalizedTheme.navPill,
    '--theme-accent': normalizedTheme.accent,
    '--primary-rgb': hexToRgbTuple(primary, '97, 218, 251'),
    '--accent-rgb': hexToRgbTuple(accent, '97, 218, 251'),
    '--bg-rgb': hexToRgbTuple(bg, '17, 17, 17'),
    '--surface-rgb': hexToRgbTuple(surface, '27, 27, 27'),
    '--text-rgb': hexToRgbTuple(text, '245, 245, 245'),
    '--muted-rgb': hexToRgbTuple(colors['--muted'], '189, 189, 189'),
    '--border-rgb': hexToRgbTuple(border, '42, 42, 42'),
    '--surface-2': panelBg,
    '--surface-3': mixHex(panelBg, bg, 0.18, panelBg),
    '--border-soft': rgbaString(border, 0.38, border),
    '--text-on-accent': colors['--primary-contrast'],
    '--text-on-success': '#06150F',
    '--text-warning': warning,
    '--text-info': info,
    '--text-danger': danger,
    '--success': success,
    '--success-bg': deriveWindowColor(success, 0.16, '#2FE6A6'),
    '--success-border': deriveWindowColor(success, 0.55, '#2FE6A6'),
    '--danger': danger,
    '--danger-bg': deriveWindowColor(danger, 0.14, '#FF5A5A'),
    '--danger-border': deriveWindowColor(danger, 0.45, '#FF5A5A'),
    '--warning': warning,
    '--warning-bg': deriveWindowColor(warning, 0.14, '#FFB020'),
    '--warning-border': deriveWindowColor(warning, 0.45, '#FFB020'),
    '--info': info,
    '--info-bg': deriveWindowColor(info, 0.14, '#8C7DFF'),
    '--info-border': deriveWindowColor(info, 0.45, '#8C7DFF'),
    '--connected-glow': deriveWindowColor(success, 0.28, '#2FE6A6'),
    '--focus-ring': `0 0 0 2px rgba(${hexToRgbTuple(accent, '97, 218, 251')}, 0.28)`,
    '--hover-overlay': rgbaString('#FFFFFF', 0.04, '#FFFFFF'),
    '--pressed-overlay': rgbaString('#000000', 0.10, '#000000'),
    '--disabled-opacity': '0.52',
    '--table-row-hover': `rgba(${hexToRgbTuple(accent, '97, 218, 251')}, 0.06)`,
    '--table-row-selected': `rgba(${hexToRgbTuple(accent, '97, 218, 251')}, 0.12)`,
    '--input-bg': mixHex(surface, bg, 0.22, surface),
    '--input-border': colors['--panel-border'],
    '--input-placeholder': colors['--text-tertiary'],
    '--chart-axis': colors['--graph-text'],
    '--chart-zero-line': `rgba(${hexToRgbTuple(accent, '97, 218, 251')}, 0.42)`,
    '--chart-grid-soft': `rgba(${hexToRgbTuple(graphGrid, hexToRgbTuple(border))}, 0.32)`,
    '--chart-area-bg': colors['--graph-bg'],
    '--game-sand': mixHex(accent, '#FFFFFF', 0.18, accent),
    '--game-sky-night': mixHex('#000000', accent, 0.16, bg),
    '--game-object-muted': mixHex(text, bg, 0.72, text),
    '--glow': `rgba(${hexToRgbTuple(accent, '97, 218, 251')}, 0.18)`,
    '--glow-strong': `rgba(${hexToRgbTuple(accent, '97, 218, 251')}, 0.30)`,
    '--card-top-light': rgbaString('#FFFFFF', 0.03, '#FFFFFF'),
    '--card-bottom-shadow': rgbaString('#000000', 0.05, '#000000'),
    '--window-pending-bg': deriveWindowColor(warning, 0.14, '#FFB020'),
    '--window-pending-border': deriveWindowColor(warning, 0.35, '#FFB020'),
    '--window-pending-border-strong': deriveWindowColor(warning, 0.68, '#FFB020'),
    '--window-pending-line': warning,
    '--window-collected-bg': deriveWindowColor(info, 0.12, '#8C7DFF'),
    '--window-collected-border': deriveWindowColor(info, 0.35, '#8C7DFF'),
    '--window-collected-border-strong': deriveWindowColor(info, 0.68, '#8C7DFF'),
    '--window-collected-line': info,
    '--window-saved-bg': deriveWindowColor(success, 0.12, '#2FE6A6'),
    '--window-saved-border': deriveWindowColor(success, 0.35, '#2FE6A6'),
    '--window-saved-border-strong': deriveWindowColor(success, 0.68, '#2FE6A6'),
    '--window-saved-line': success,
    '--window-error-bg': deriveWindowColor(danger, 0.12, '#FF5A5A'),
    '--window-error-border': deriveWindowColor(danger, 0.35, '#FF5A5A'),
    '--window-error-border-strong': deriveWindowColor(danger, 0.68, '#FF5A5A'),
    '--window-error-line': danger,
  };

  return {
    theme: normalizedTheme,
    runtime,
  };
}

export function buildThemePreviewJson(theme = {}) {
  const normalizedTheme = createNormalizedTheme(theme);
  return JSON.stringify(
    {
      accent: normalizedTheme.accent,
      navBase: normalizedTheme.navBase,
      navPill: normalizedTheme.navPill,
      colors: normalizedTheme.colors,
    },
    null,
    2
  );
}

export { THEME_REQUIRED_COLORS };
