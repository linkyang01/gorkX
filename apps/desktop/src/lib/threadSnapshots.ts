import type { ChatLine } from '../components/MessageList';

export type StoredChatLine = {
  id: string;
  role: string;
  text: string;
  toolKey?: string | null;
  toolStatus?: string | null;
  toolKind?: string | null;
};

/** Normalize persisted chat lines before rendering them in a restored task. */
export function snapToLines(snaps: StoredChatLine[]): ChatLine[] {
  return snaps.map((s) => ({
    id: s.id,
    role: (['user', 'assistant', 'thought', 'tool', 'system', 'plan'].includes(s.role)
      ? s.role
      : 'system') as ChatLine['role'],
    text: s.text,
    toolKey: s.toolKey ?? undefined,
    toolStatus: s.toolStatus ?? undefined,
    toolKind: s.toolKind ?? undefined,
  }));
}
