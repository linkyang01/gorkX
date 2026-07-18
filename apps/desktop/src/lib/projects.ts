const KEY = 'gorkx.recentProjects';
const PIN_KEY = 'gorkx.pinnedProjects';
const ALIAS_KEY = 'gorkx.projectAliases';
const MAX = 24;

export function loadRecentProjects(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecentProject(path: string): string[] {
  const p = path.trim();
  if (!p) return loadRecentProjects();
  const next = [p, ...loadRecentProjects().filter((x) => x !== p)].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function removeRecentProject(path: string): string[] {
  const next = loadRecentProjects().filter((x) => x !== path);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function loadPinnedProjects(): string[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function setPinnedProjects(paths: string[]): string[] {
  const next = paths.filter(Boolean).slice(0, MAX);
  localStorage.setItem(PIN_KEY, JSON.stringify(next));
  return next;
}

export function togglePinProject(path: string): string[] {
  const p = path.trim();
  const cur = loadPinnedProjects();
  if (cur.includes(p)) return setPinnedProjects(cur.filter((x) => x !== p));
  return setPinnedProjects([p, ...cur]);
}

export function loadProjectAliases(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ALIAS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    return o && typeof o === 'object' ? (o as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function setProjectAlias(path: string, alias: string): Record<string, string> {
  const map = loadProjectAliases();
  const a = alias.trim();
  if (!a) delete map[path];
  else map[path] = a;
  localStorage.setItem(ALIAS_KEY, JSON.stringify(map));
  return map;
}

export function projectDisplayName(path: string, aliases?: Record<string, string>): string {
  const map = aliases ?? loadProjectAliases();
  if (map[path]) return map[path];
  return path.split('/').filter(Boolean).pop() || path;
}

/** Pinned first, then recent (deduped). */
export function orderedProjects(
  current: string,
  recent: string[],
  pinned: string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...pinned, current, ...recent]) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out.slice(0, MAX);
}
