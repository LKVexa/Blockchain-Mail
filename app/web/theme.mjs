export const THEME_KEY = 'workspace-theme';
export function readTheme(storage, prefersDark = false) {
  try {
    const value = storage?.getItem(THEME_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch { /* Theme persistence is optional; authentication never depends on it. */ }
  return prefersDark ? 'dark' : 'light';
}
export function saveTheme(storage, value) {
  if (value !== 'light' && value !== 'dark') throw new Error('Invalid theme');
  try { storage?.setItem(THEME_KEY, value); } catch { /* Apply the preference for this page even when storage is unavailable. */ }
  return value;
}
export function initializeTheme(document, window) {
  let storage;
  try { storage = window.localStorage; } catch { /* Restricted browser storage. */ }
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  let explicit = false;
  try { explicit = ['light', 'dark'].includes(storage?.getItem(THEME_KEY)); } catch { /* Optional persistence. */ }
  let choice = readTheme(storage, !!media?.matches);
  const buttons = [...document.querySelectorAll('[data-theme-toggle]')];
  function apply(value) {
    choice = value;
    document.documentElement.dataset.theme = value;
    for (const button of buttons) {
      button.textContent = value === 'dark' ? 'Light theme' : 'Dark theme';
      button.setAttribute('aria-label', `Switch to ${value === 'dark' ? 'light' : 'dark'} theme`);
      button.setAttribute('aria-pressed', String(value === 'dark'));
    }
  }
  apply(choice);
  const toggle = () => { explicit = true; apply(saveTheme(storage, choice === 'dark' ? 'light' : 'dark')); };
  for (const button of buttons) button.addEventListener('click', toggle);
  const synchronize = event => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    const value = event.key === null ? null : event.newValue;
    explicit = value === 'light' || value === 'dark';
    apply(explicit ? value : media?.matches ? 'dark' : 'light');
  };
  const followSystem = () => { if (!explicit) apply(media?.matches ? 'dark' : 'light'); };
  window.addEventListener('storage', synchronize);
  media?.addEventListener?.('change', followSystem);
  return () => {
    for (const button of buttons) button.removeEventListener('click', toggle);
    window.removeEventListener('storage', synchronize);
    media?.removeEventListener?.('change', followSystem);
  };
}
