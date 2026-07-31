/** Pure boundary parsing for Grok Build's native next-prompt suggestion reply. */

const MAX_SUGGESTION_LENGTH = 120;

export interface PromptSuggestionReply {
  suggestion: string | null;
  generation: number;
}

/**
 * Parse both raw extension responses and JSON-RPC `result` wrappers. Grok's
 * suggestion contract is deliberately short; reject multiline or sentinel
 * output instead of putting model instructions directly into the composer.
 */
export function parsePromptSuggestion(value: unknown, fallbackGeneration: number): PromptSuggestionReply {
  const root = value && typeof value === 'object' && 'result' in value
    ? ((value as { result?: unknown }).result ?? value)
    : value;
  const row = root && typeof root === 'object' ? root as Record<string, unknown> : {};
  const generation = typeof row.generation === 'number' && Number.isInteger(row.generation)
    ? row.generation
    : fallbackGeneration;
  const raw = typeof row.suggestion === 'string' ? row.suggestion.trim() : '';
  if (!raw || /^none$/i.test(raw) || raw.includes('\n') || raw.includes('\r')) {
    return { suggestion: null, generation };
  }
  return { suggestion: raw.slice(0, MAX_SUGGESTION_LENGTH), generation };
}

