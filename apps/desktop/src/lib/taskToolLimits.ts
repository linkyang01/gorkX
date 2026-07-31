/**
 * Per-task Grok Build tool denylist for new sessions.
 *
 * The engine accepts a comma-separated `--disallowed-tools` root flag (and the
 * matching portable agentProfile `disallowedTools` field). gorkX only offers a
 * fixed set of well-known built-in tool ids so ordinary users never invent
 * arbitrary deny strings.
 */

export const TASK_TOOL_LIMIT_OPTIONS = [
  {
    id: 'bash',
    labelKey: 'taskToolBash' as const,
    hintKey: 'taskToolBashHint' as const,
  },
  {
    id: 'write',
    labelKey: 'taskToolWrite' as const,
    hintKey: 'taskToolWriteHint' as const,
  },
  {
    id: 'search_replace',
    labelKey: 'taskToolSearchReplace' as const,
    hintKey: 'taskToolSearchReplaceHint' as const,
  },
  {
    id: 'web_search',
    labelKey: 'taskToolWebSearch' as const,
    hintKey: 'taskToolWebSearchHint' as const,
  },
  {
    id: 'web_fetch',
    labelKey: 'taskToolWebFetch' as const,
    hintKey: 'taskToolWebFetchHint' as const,
  },
  {
    id: 'Agent',
    labelKey: 'taskToolAgent' as const,
    hintKey: 'taskToolAgentHint' as const,
  },
] as const;

export type TaskToolLimitId = (typeof TASK_TOOL_LIMIT_OPTIONS)[number]['id'];

const ALLOWED = new Set<string>(TASK_TOOL_LIMIT_OPTIONS.map((option) => option.id));

/** Keep only known tool ids, stable order, max 16 entries. */
export function sanitizeTaskToolLimits(input: unknown): TaskToolLimitId[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: TaskToolLimitId[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!ALLOWED.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id as TaskToolLimitId);
    if (out.length >= 16) break;
  }
  return out;
}

export function parseTaskToolLimitsForm(text: string): TaskToolLimitId[] {
  const tokens = text
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return sanitizeTaskToolLimits(tokens);
}

export function taskToolLimitsSummary(ids: TaskToolLimitId[]): string {
  return ids.join(', ');
}

/**
 * Merge session constraints into an ACP agentProfile value.
 * Named profiles stay strings when no extra constraints apply.
 * When constraints exist, a portable object carries maxTurns / disallowedTools
 * while preserving a named profile's string form is impossible without loading
 * its definition — so constraints are applied process-wide via root flags, and
 * this helper only enriches already-portable objects or creates a thin wrapper
 * for the default agent.
 */
export function withSessionToolConstraints(
  profile: string | Record<string, unknown> | undefined,
  opts: { maxTurns?: number | null; disallowedTools?: string[] },
): string | Record<string, unknown> | undefined {
  const maxTurns =
    Number.isInteger(opts.maxTurns) && (opts.maxTurns ?? 0) >= 1 && (opts.maxTurns ?? 0) <= 200
      ? (opts.maxTurns as number)
      : null;
  const disallowedTools = sanitizeTaskToolLimits(opts.disallowedTools ?? []);
  if (maxTurns == null && disallowedTools.length === 0) {
    return profile;
  }

  if (profile && typeof profile === 'object') {
    const next: Record<string, unknown> = { ...profile };
    if (maxTurns != null) next.maxTurns = maxTurns;
    if (disallowedTools.length) next.disallowedTools = disallowedTools;
    return next;
  }

  // Named profile strings (explore, custom roles) keep their engine identity.
  // Process-level --max-turns / --disallowed-tools (kernel patch 0004) apply
  // the limits; we do not invent a portable body that would replace explore's
  // curated toolset.
  if (typeof profile === 'string' && profile.trim()) {
    return profile;
  }

  const portable: Record<string, unknown> = {
    name: 'gorkx-task',
    description: 'A gorkX desktop task with operator-selected tool limits.',
    promptMode: 'extend',
    permissionMode: 'default',
  };
  if (maxTurns != null) portable.maxTurns = maxTurns;
  if (disallowedTools.length) portable.disallowedTools = disallowedTools;
  return portable;
}
