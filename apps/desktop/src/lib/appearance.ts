/** Persisted, renderer-only appearance preferences. They never affect the agent kernel. */
export type ThemePreference = 'system' | 'light' | 'dark';
export type DensityPreference = 'compact' | 'comfortable' | 'spacious';

const THEME_KEY = 'gorkx.theme';
const DENSITY_KEY = 'gorkx.density';

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
  return {
    theme: stored(THEME_KEY, ['system', 'light', 'dark'] as const, 'system'),
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
