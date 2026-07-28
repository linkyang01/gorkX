/** Persisted, renderer-only appearance preferences. They never affect the agent kernel. */
export type ThemePreference = 'system' | 'light' | 'dark';
export type DensityPreference = 'compact' | 'comfortable' | 'spacious';

const THEME_KEY = 'gorkx.theme';
const DENSITY_KEY = 'gorkx.density';
const THEME_DEFAULT_VERSION_KEY = 'gorkx.theme-default-version';
const THEME_DEFAULT_VERSION = '2';

export interface AppearancePreferences {
  theme: ThemePreference;
  density: DensityPreference;
}

function stored<T extends string>(key: string, values: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return values.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadAppearance(): AppearancePreferences {
  const savedTheme = stored(THEME_KEY, ['system', 'light', 'dark'] as const, 'dark');
  let theme = savedTheme;

  try {
    // Before the graphite workspace refresh, new installs were silently saved
    // as “System”. Migrate only that old default once so existing users see the
    // new product surface; an explicit Light/Dark choice is always preserved.
    if (localStorage.getItem(THEME_DEFAULT_VERSION_KEY) !== THEME_DEFAULT_VERSION) {
      if (savedTheme === 'system') {
        theme = 'dark';
        localStorage.setItem(THEME_KEY, theme);
      }
      localStorage.setItem(THEME_DEFAULT_VERSION_KEY, THEME_DEFAULT_VERSION);
    }
  } catch {
    /* Storage is unavailable: use the current launch's resolved preference. */
  }

  return {
    // gorkX is a focused command workspace first. A deliberate graphite dark
    // surface is the default for new installs and for the prior implicit
    // “System” default; people who explicitly selected Light/Dark keep it.
    theme,
    density: stored(DENSITY_KEY, ['compact', 'comfortable', 'spacious'] as const, 'comfortable'),
  };
}

export function applyAppearance(next: AppearancePreferences): void {
  const root = document.documentElement;
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  root.dataset.theme = next.theme === 'system' ? (systemDark ? 'dark' : 'light') : next.theme;
  root.dataset.density = next.density;
  try {
    localStorage.setItem(THEME_KEY, next.theme);
    localStorage.setItem(DENSITY_KEY, next.density);
  } catch {
    /* Private browsing or a full storage device: keep this launch's setting. */
  }
}

/** Apply stored settings before React mounts, and track the OS only in System mode. */
export function initializeAppearance(): () => void {
  const refresh = () => applyAppearance(loadAppearance());
  refresh();
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener('change', refresh);
  return () => media?.removeEventListener('change', refresh);
}
