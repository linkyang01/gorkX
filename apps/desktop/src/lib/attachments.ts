/** Composer / chat file attachments with previews. */

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';

export type AttachKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'file';

export interface ComposerAttachment {
  id: string;
  path: string;
  name: string;
  kind: AttachKind;
  /** object URL or asset URL for thumbnail / preview */
  previewUrl?: string;
  size?: number;
}

/** ACP resource-link payload. Image blocks are optional in ACP; resource links are baseline. */
export function attachmentResourceLinks(items: ComposerAttachment[]) {
  return items.map((item) => ({
    name: item.name,
    path: item.path,
    size: item.size,
    mimeType:
      item.kind === 'image'
        ? extOf(item.path) === 'png'
          ? 'image/png'
          : 'image/jpeg'
        : item.kind === 'pdf'
          ? 'application/pdf'
          : item.kind === 'text'
            ? 'text/plain'
            : undefined,
  }));
}

const IMAGE_EXT = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'heic',
  'heif',
  'bmp',
  'svg',
]);
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']);
const TEXT_EXT = new Set([
  'txt',
  'md',
  'json',
  'ts',
  'tsx',
  'js',
  'jsx',
  'css',
  'html',
  'rs',
  'py',
  'go',
  'toml',
  'yaml',
  'yml',
  'xml',
  'csv',
  'log',
  'sh',
  'env',
]);

export function extOf(path: string): string {
  const base = path.split('/').pop() || path;
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i + 1).toLowerCase() : '';
}

export function kindOfPath(path: string): AttachKind {
  const e = extOf(path);
  if (IMAGE_EXT.has(e)) return 'image';
  if (VIDEO_EXT.has(e)) return 'video';
  if (AUDIO_EXT.has(e)) return 'audio';
  if (e === 'pdf') return 'pdf';
  if (TEXT_EXT.has(e)) return 'text';
  return 'file';
}

export function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() || path;
}

let seq = 1;
export function newAttachId(): string {
  return `att-${Date.now()}-${seq++}`;
}

/** Build attachment with a usable preview URL (blob preferred for reliability). */
export async function buildAttachment(path: string): Promise<ComposerAttachment> {
  const kind = kindOfPath(path);
  const name = basename(path);
  const id = newAttachId();
  let previewUrl: string | undefined;

  if (kind === 'image' || kind === 'video' || kind === 'audio') {
    try {
      // Prefer asset protocol (works for large media)
      previewUrl = convertFileSrc(path);
    } catch {
      /* */
    }
    // Small images: also try blob for webview reliability
    if (kind === 'image') {
      try {
        const bytes = await readFile(path);
        const mime =
          extOf(path) === 'png'
            ? 'image/png'
            : extOf(path) === 'gif'
              ? 'image/gif'
              : extOf(path) === 'webp'
                ? 'image/webp'
                : 'image/jpeg';
        const blob = new Blob([bytes], { type: mime });
        previewUrl = URL.createObjectURL(blob);
      } catch {
        /* keep convertFileSrc */
      }
    }
  }

  return { id, path, name, kind, previewUrl };
}

/** Persisted media uses app-local paths; never restore an expired blob URL. */
export function attachmentFromStored(item: Pick<ComposerAttachment, 'id' | 'path' | 'name' | 'kind' | 'size'>): ComposerAttachment {
  let previewUrl: string | undefined;
  if (item.kind === 'image' || item.kind === 'video' || item.kind === 'audio') {
    try { previewUrl = convertFileSrc(item.path); } catch { /* */ }
  }
  return { ...item, previewUrl };
}

export async function saveAgentImage(
  threadId: string,
  data: string,
  mimeType: string,
): Promise<ComposerAttachment> {
  const saved = await invoke<{ path: string; name: string; size: number }>('media_save_agent_image', {
    threadId,
    data,
    mimeType,
  });
  return attachmentFromStored({
    id: newAttachId(),
    path: saved.path,
    name: saved.name,
    kind: 'image',
    size: saved.size,
  });
}

export function revokeAttachment(a: ComposerAttachment) {
  if (a.previewUrl?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(a.previewUrl);
    } catch {
      /* */
    }
  }
}

/** Format attachments for the agent prompt (paths + short notes). */
export function attachmentsPromptBlock(atts: ComposerAttachment[]): string {
  if (!atts.length) return '';
  const lines = atts.map((a) => {
    const tag =
      a.kind === 'image'
        ? 'image'
        : a.kind === 'video'
          ? 'video'
          : a.kind === 'pdf'
            ? 'pdf'
            : a.kind === 'text'
              ? 'text'
              : 'file';
    return `- [${tag}] ${a.path}`;
  });
  return `\n\n[Attached files — please read/use as needed]\n${lines.join('\n')}`;
}

export async function createNamedProject(name: string): Promise<string> {
  return invoke<string>('create_named_project', { name });
}

export async function projectsRoot(): Promise<string> {
  return invoke<string>('projects_root');
}
