/** Pure boundary parsing for Grok Build's native prompt-history ACP response. */

const MAX_PROMPTS = 120;
const MAX_PROMPT_LENGTH = 8_000;

function unwrap(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const row = value as Record<string, unknown>;
  return row.result && typeof row.result === 'object' ? row.result : value;
}

/**
 * Keep the desktop boundary tolerant of both raw and JSON-RPC wrapped replies,
 * while never rendering unbounded or non-string kernel data.
 */
export function parsePromptHistory(value: unknown): string[] {
  const root = unwrap(value);
  if (!root || typeof root !== 'object') return [];
  const prompts = (root as Record<string, unknown>).prompts;
  if (!Array.isArray(prompts)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of prompts) {
    if (typeof item !== 'string') continue;
    const prompt = item.trim().slice(0, MAX_PROMPT_LENGTH);
    if (!prompt || seen.has(prompt)) continue;
    seen.add(prompt);
    output.push(prompt);
    if (output.length >= MAX_PROMPTS) break;
  }
  return output;
}

