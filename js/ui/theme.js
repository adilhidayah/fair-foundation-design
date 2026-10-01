// Light / dark theme toggle (header ☀/☾ button). Declarations only — wiring lives in app.js.
// No saved choice = follow the OS setting (prefers-color-scheme). A click saves an explicit light/dark on
// <html data-theme>, which css/app.css reads. The saved value is applied before first paint by the small
// inline script in the HTML <head> (same key), so a refresh does not flash the wrong theme.

export const THEME_KEY = 'fair_fdn_theme';

export function currentTheme() {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'light' || forced === 'dark') return forced;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  syncThemeButton();
}
export function toggleTheme() {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}
// Button shows the theme it switches TO.
export function syncThemeButton() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const dark = currentTheme() === 'dark';
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
  btn.textContent = dark ? '☀' : '☾';
  btn.title = label;
  btn.setAttribute('aria-label', label);
}
