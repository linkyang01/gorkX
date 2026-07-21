/** Presentation helpers shared by the project and inbox task lists. */

export interface ThreadListEntry {
  id: string;
  title: string;
  updatedAt?: number;
}

/** Short clock for same-title disambiguation, e.g. 14:32 or 7/19 14:32. */
export function formatThreadClock(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

/** Sidebar label: append a stable suffix only when sibling titles collide. */
export function threadListLabel<T extends ThreadListEntry>(th: T, siblings: T[], fallback: string): string {
  const title = (th.title || '').trim() || fallback;
  const same = siblings.filter(
    (x) => (x.title || '').trim().toLowerCase() === title.toLowerCase(),
  );
  if (same.length <= 1) return title;
  const clock = formatThreadClock(th.updatedAt);
  if (clock && !title.includes(clock)) return `${title} · ${clock}`;
  const ordered = [...same].sort((a, b) => (a.id < b.id ? -1 : 1));
  const idx = ordered.findIndex((x) => x.id === th.id) + 1;
  if (idx > 0 && !/·\s*\d+$/.test(title)) return `${title} · ${idx}`;
  return title;
}
