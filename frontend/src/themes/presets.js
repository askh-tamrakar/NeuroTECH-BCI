const themeFiles = import.meta.glob('./*.json', { eager: true, import: 'default' });

export const themePresets = Object.values(themeFiles).map(theme => ({
  value: theme.id,
  label: theme.name,
  accent: theme.accent,
  text: theme.navBase,
  navPill: theme.navPill
}));

export default themePresets;