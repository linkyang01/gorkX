/**
 * Stage A layout helpers: opt-in secondary panels and home recent-task ranking.
 * Pure — no DOM/Tauri — so defaults stay testable without the renderer shell.
 */

/** Storage keys for panels that must not open empty by default. */
export const OPT_IN_PANEL_KEYS = {
  review: 'gorkx.reviewOpen',
  terminal: 'gorkx.terminalOpen',
} as const;

/**
 * Review / Terminal are opt-in. Missing or unknown storage values stay closed
 * so empty panels never own the main stage on a fresh launch.
 */
export function isOptInPanelOpen(stored: string | null | undefined): boolean {
  return stored === '1' || stored === 'true';
}

/** Read a single opt-in panel flag via an injectable storage getter. */
export function loadOptInPanelOpen(
  key: string,
  getItem: (k: string) => string | null = defaultGetItem,
): boolean {
  try {
    return isOptInPanelOpen(getItem(key));
  } catch {
    return false;
  }
}

function defaultGetItem(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(key);
}

export interface HomeTaskEntry {
  id: string;
  updatedAt?: number;
}

/**
 * Rank tasks for the home surface: most recently updated first, capped.
 * Does not invent tasks — empty input yields an empty list (first-use path).
 */
export function pickHomeRecentTasks<T extends HomeTaskEntry>(
  threads: readonly T[],
  limit = 5,
): T[] {
  const n = Math.max(0, Math.floor(limit));
  if (!threads.length || n === 0) return [];
  return [...threads]
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, n);
}
