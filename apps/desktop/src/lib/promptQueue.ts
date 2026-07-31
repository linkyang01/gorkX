/** Bounded parser for Grok Build's server-authoritative prompt queue. */

export interface PromptQueueEntry {
  id: string;
  version: number;
  owner?: string;
  lastEditor?: string;
  kind: string;
  text: string;
  position: number;
  combinedTexts?: string[];
}

export interface PromptQueueState {
  sessionId: string;
  entries: PromptQueueEntry[];
  runningPromptId?: string;
  runningText?: string;
  runningKind?: string;
  runningCombinedTexts?: string[];
}

const MAX_QUEUE_ENTRIES = 128;
const MAX_TEXT_LENGTH = 20_000;

function boundedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text.slice(0, MAX_TEXT_LENGTH) : undefined;
}

function boundedStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value
    .map((item) => boundedText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 16);
  return list.length >= 2 ? list : undefined;
}

/** Parse only the queue payload shape; never trust arbitrary notification data. */
export function parsePromptQueueChanged(raw: unknown): PromptQueueState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const sessionId = boundedText(row.sessionId ?? row.session_id);
  if (!sessionId) return null;
  if (!Array.isArray(row.entries) || row.entries.length > MAX_QUEUE_ENTRIES) return null;

  const entries: PromptQueueEntry[] = [];
  const seen = new Set<string>();
  for (const item of row.entries) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const id = boundedText(entry.id);
    const text = boundedText(entry.text);
    if (!id || !text || seen.has(id)) continue;
    seen.add(id);
    const version = typeof entry.version === 'number' && Number.isFinite(entry.version)
      ? Math.max(0, Math.trunc(entry.version))
      : 0;
    const position = typeof entry.position === 'number' && Number.isFinite(entry.position)
      ? Math.max(0, Math.trunc(entry.position))
      : entries.length;
    const kind = boundedText(entry.kind) || 'prompt';
    entries.push({
      id,
      version,
      kind,
      text,
      position,
      ...(boundedText(entry.owner) ? { owner: boundedText(entry.owner) } : {}),
      ...(boundedText(entry.lastEditor) ? { lastEditor: boundedText(entry.lastEditor) } : {}),
      ...(boundedStringList(entry.combinedTexts) ? { combinedTexts: boundedStringList(entry.combinedTexts) } : {}),
    });
  }
  entries.sort((a, b) => a.position - b.position);
  const runningPromptId = boundedText(row.runningPromptId ?? row.running_prompt_id);
  const runningText = boundedText(row.runningText ?? row.running_text);
  const runningKind = boundedText(row.runningKind ?? row.running_kind);
  const runningCombinedTexts = boundedStringList(row.runningCombinedTexts ?? row.running_combined_texts);
  return {
    sessionId,
    entries,
    ...(runningPromptId ? { runningPromptId } : {}),
    ...(runningText ? { runningText } : {}),
    ...(runningKind ? { runningKind } : {}),
    ...(runningCombinedTexts ? { runningCombinedTexts } : {}),
  };
}
