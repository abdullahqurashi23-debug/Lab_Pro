export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'labpro-theme';

export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // localStorage can throw in rare locked-down contexts — fall back silently.
  }
  return 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Non-fatal — the toggle just won't be remembered across restarts.
  }
}
