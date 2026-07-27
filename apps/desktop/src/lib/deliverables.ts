/**
 * Stage C: index and act on ACP-delivered results only.
 * Never invents project files by scanning the disk.
 */

import type { AttachKind, ComposerAttachment } from './attachments.ts';
import { basename, extOf, kindOfPath } from './attachments.ts';

/** Product categories: file / link / change (code or text edits). */
export type DeliverableCategory = 'file' | 'link' | 'change';

export interface DeliverableItem {
  id: string;
  category: DeliverableCategory;
  name: string;
  /** Local absolute path for files; empty for pure links. */
  path: string;
  /** External URL when category is link. */
  href?: string;
  kind: AttachKind | 'link';
  size?: number;
  previewUrl?: string;
  source: 'acp_attachment' | 'acp_link';
}

const CODE_EXT = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'rs',
  'py',
  'go',
  'java',
  'c',
  'cc',
  'cpp',
  'h',
  'hpp',
  'css',
  'scss',
  'html',
  'vue',
  'svelte',
  'kt',
  'swift',
  'rb',
  'php',
  'sql',
  'sh',
  'bash',
  'zsh',
  'toml',
  'yaml',
  'yml',
  'json',
  'xml',
]);

/**
 * Structural rejection before any native open/edit.
 * Does not prove workspace containment (that is native validation at ingest).
 */
export function isStructurallySafeLocalPath(path: string): boolean {
  const p = (path || '').trim();
  if (!p || p.length > 4_096) return false;
  if (/[\u0000-\u001F\u007F]/.test(p)) return false;
  if (!p.startsWith('/')) return false;
  // Reject path traversal and URL-ish smuggling.
  if (p.includes('://') || p.includes('\\')) return false;
  const parts = p.split('/');
  if (parts.some((seg) => seg === '..')) return false;
  return true;
}

export function isExternalHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isEditableTextDeliverable(item: Pick<DeliverableItem, 'kind' | 'path' | 'href'>): boolean {
  if (item.href && !item.path) return false;
  if (!isStructurallySafeLocalPath(item.path)) return false;
  if (item.kind === 'text') return true;
  const e = extOf(item.path);
  return e === 'md' || e === 'txt' || e === 'csv' || e === 'log' || CODE_EXT.has(e);
}

export function isBinaryPreviewOnly(item: Pick<DeliverableItem, 'kind' | 'path'>): boolean {
  if (item.kind === 'image' || item.kind === 'video' || item.kind === 'audio' || item.kind === 'pdf') {
    return true;
  }
  if (item.kind === 'file' && !isEditableTextDeliverable({ ...item, kind: kindOfPath(item.path) })) {
    return true;
  }
  return false;
}

function categorizeAttachment(att: ComposerAttachment): DeliverableCategory {
  if (att.href && isExternalHttpUrl(att.href)) return 'link';
  if (att.kind === 'text' || CODE_EXT.has(extOf(att.path))) return 'change';
  return 'file';
}

/**
 * Index only explicit ACP-surfaced attachments (already validated at ingest for workspace files).
 * Drops structurally unsafe local paths and does not invent extra files.
 */
export function indexDeliverables(
  attachments: readonly ComposerAttachment[],
  links: readonly { id: string; href: string; name?: string }[] = [],
): DeliverableItem[] {
  const out: DeliverableItem[] = [];
  const seen = new Set<string>();

  for (const att of attachments) {
    if (att.href && isExternalHttpUrl(att.href) && !att.path) {
      const key = `link:${att.href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: att.id,
        category: 'link',
        name: att.name || att.href,
        path: '',
        href: att.href,
        kind: 'link',
        source: 'acp_link',
      });
      continue;
    }
    if (!isStructurallySafeLocalPath(att.path)) continue;
    const key = `file:${att.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const category = categorizeAttachment(att);
    out.push({
      id: att.id,
      category,
      name: att.name || basename(att.path),
      path: att.path,
      kind: att.kind,
      size: att.size,
      previewUrl: att.previewUrl,
      source: 'acp_attachment',
    });
  }

  for (const link of links) {
    if (!isExternalHttpUrl(link.href)) continue;
    const key = `link:${link.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: link.id,
      category: 'link',
      name: link.name || link.href,
      path: '',
      href: link.href,
      kind: 'link',
      source: 'acp_link',
    });
  }

  return out;
}

export function groupDeliverables(items: readonly DeliverableItem[]): Record<DeliverableCategory, DeliverableItem[]> {
  return {
    file: items.filter((i) => i.category === 'file'),
    link: items.filter((i) => i.category === 'link'),
    change: items.filter((i) => i.category === 'change'),
  };
}

/** Plain-text summary for clipboard — no secrets, no full absolute home expansion beyond given paths. */
export function buildDeliverableSummary(
  items: readonly DeliverableItem[],
  opts?: { taskTitle?: string },
): string {
  if (!items.length) return '';
  const lines: string[] = [];
  if (opts?.taskTitle?.trim()) lines.push(`# ${opts.taskTitle.trim()}`, '');
  lines.push(`Deliverables (${items.length})`, '');
  const groups = groupDeliverables(items);
  for (const [cat, list] of [
    ['Files', groups.file],
    ['Changes', groups.change],
    ['Links', groups.link],
  ] as const) {
    if (!list.length) continue;
    lines.push(`## ${cat}`);
    for (const item of list) {
      if (item.category === 'link') lines.push(`- ${item.name}: ${item.href}`);
      else lines.push(`- ${item.name}: ${item.path}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** Conflict when on-disk text no longer matches the editor baseline. */
export function textEditConflicts(baseline: string, onDisk: string): boolean {
  return baseline !== onDisk;
}

/** Relative path for project-scoped writes; null if outside root or unsafe. */
export function relativePathWithinProject(absolutePath: string, projectRoot: string): string | null {
  if (!isStructurallySafeLocalPath(absolutePath)) return null;
  const root = projectRoot.replace(/\/+$/, '');
  if (!root || !isStructurallySafeLocalPath(root)) return null;
  if (absolutePath === root) return null;
  const prefix = root.endsWith('/') ? root : `${root}/`;
  if (!absolutePath.startsWith(prefix) && absolutePath !== root) {
    // Case-sensitive prefix; also allow exact if file is root file? no
    return null;
  }
  const rel = absolutePath.slice(prefix.length);
  if (!rel || rel.startsWith('/') || rel.split('/').includes('..')) return null;
  return rel;
}
