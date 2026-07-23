import type { ChatLine } from '../components/MessageList';
import { attachmentFromStored, type AttachKind } from './attachments';

export type StoredChatLine = {
  id: string;
  role: string;
  text: string;
  toolKey?: string | null;
  parentSubagentId?: string | null;
  toolStatus?: string | null;
  toolKind?: string | null;
  attachmentsJson?: string | null;
};

type StoredAttachment = {
  id: string;
  path: string;
  name: string;
  kind: AttachKind;
  size?: number;
};

function attachmentsFromJson(raw: string | null | undefined) {
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return undefined;
    const attachments = value.flatMap((item): StoredAttachment[] => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id : '';
      const path = typeof row.path === 'string' ? row.path : '';
      const name = typeof row.name === 'string' ? row.name : '';
      const kind = typeof row.kind === 'string' ? row.kind : '';
      if (!id || !path || !name || !['image', 'video', 'audio', 'pdf', 'text', 'file'].includes(kind)) return [];
      return [{ id, path, name, kind: kind as AttachKind, size: typeof row.size === 'number' ? row.size : undefined }];
    }).slice(0, 12).map(attachmentFromStored);
    return attachments.length ? attachments : undefined;
  } catch {
    return undefined;
  }
}

/** Normalize persisted chat lines before rendering them in a restored task. */
export function snapToLines(snaps: StoredChatLine[]): ChatLine[] {
  return snaps.map((s) => ({
    id: s.id,
    role: (['user', 'assistant', 'thought', 'tool', 'system', 'plan'].includes(s.role)
      ? s.role
      : 'system') as ChatLine['role'],
    text: s.text,
    toolKey: s.toolKey ?? undefined,
    parentSubagentId: s.parentSubagentId ?? undefined,
    toolStatus: s.toolStatus ?? undefined,
    toolKind: s.toolKind ?? undefined,
    attachments: attachmentsFromJson(s.attachmentsJson),
  }));
}
