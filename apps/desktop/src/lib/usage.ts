/** Extract token / cost usage from ACP payloads + context window helpers. */

export interface UsageSnapshot {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedReadTokens?: number;
  reasoningTokens?: number;
  modelId?: string;
  /** Best-effort context occupancy (when server provides it). */
  contextUsed?: number;
  contextLimit?: number;
}

export interface ModelContextInfo {
  modelId: string;
  name?: string;
  contextWindow: number;
  autoCompactPercent: number;
  compactionsRemaining?: number | null;
}

export function usageFromUnknown(raw: unknown): UsageSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const meta = (o._meta as Record<string, unknown>) || o;
  const usage = (meta.usage as Record<string, unknown>) || meta;

  const num = (obj: Record<string, unknown>, ...keys: string[]) => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return undefined;
  };

  const snap: UsageSnapshot = {
    inputTokens: num(usage, 'inputTokens', 'input_tokens') ?? num(meta, 'inputTokens', 'input_tokens'),
    outputTokens:
      num(usage, 'outputTokens', 'output_tokens') ?? num(meta, 'outputTokens', 'output_tokens'),
    totalTokens: num(usage, 'totalTokens', 'total_tokens') ?? num(meta, 'totalTokens', 'total_tokens'),
    cachedReadTokens:
      num(usage, 'cachedReadTokens', 'cached_read_tokens') ??
      num(meta, 'cachedReadTokens', 'cached_read_tokens'),
    reasoningTokens:
      num(usage, 'reasoningTokens', 'reasoning_tokens') ??
      num(meta, 'reasoningTokens', 'reasoning_tokens'),
    contextUsed:
      num(usage, 'contextUsed', 'context_used', 'promptTokens', 'prompt_tokens') ??
      num(meta, 'contextUsed', 'context_used'),
    contextLimit:
      num(usage, 'contextLimit', 'context_limit', 'contextWindow', 'context_window') ??
      num(meta, 'contextLimit', 'context_limit', 'contextWindow', 'context_window'),
    modelId:
      typeof meta.modelId === 'string'
        ? meta.modelId
        : typeof o.modelId === 'string'
          ? o.modelId
          : undefined,
  };

  if (
    snap.totalTokens == null &&
    snap.inputTokens == null &&
    snap.outputTokens == null &&
    snap.contextUsed == null
  ) {
    return null;
  }
  return snap;
}

/** Estimate tokens currently occupying context (best-effort). */
export function estimateContextUsed(u: UsageSnapshot | null | undefined): number {
  if (!u) return 0;
  if (u.contextUsed != null && u.contextUsed > 0) return u.contextUsed;
  // Prefer total; else sum components (may overestimate multi-turn a bit)
  if (u.totalTokens != null) return u.totalTokens;
  return (u.inputTokens ?? 0) + (u.outputTokens ?? 0) + (u.reasoningTokens ?? 0);
}

export function formatUsage(u: UsageSnapshot | null | undefined): string {
  if (!u) return '';
  const parts: string[] = [];
  if (u.totalTokens != null) parts.push(`${fmt(u.totalTokens)} tok`);
  else {
    if (u.inputTokens != null) parts.push(`in ${fmt(u.inputTokens)}`);
    if (u.outputTokens != null) parts.push(`out ${fmt(u.outputTokens)}`);
  }
  if (u.cachedReadTokens) parts.push(`cache ${fmt(u.cachedReadTokens)}`);
  if (u.reasoningTokens) parts.push(`reason ${fmt(u.reasoningTokens)}`);
  return parts.join(' · ');
}

export function formatContextBar(
  used: number,
  limit: number,
): { label: string; pct: number; warn: boolean; critical: boolean } {
  if (!limit || limit <= 0) {
    return { label: used ? `${fmt(used)} tok` : '—', pct: 0, warn: false, critical: false };
  }
  const pct = Math.min(100, Math.round((used / limit) * 1000) / 10);
  return {
    label: `${fmt(used)} / ${fmt(limit)}`,
    pct,
    warn: pct >= 70,
    critical: pct >= 90,
  };
}

export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/** Human title from first user line (max ~28 chars). Never includes attachment dump. */
export function titleFromUserText(text: string): string {
  let s = text
    .replace(/\n\n\[Attached files[\s\S]*$/i, '')
    .replace(/\[Attached files[^\]]*\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  if (s.length <= 28) return s;
  return s.slice(0, 26) + '…';
}

/** True if title is still a placeholder (safe to auto-set once). */
export function isPlaceholderTitle(title: string): boolean {
  const t = (title || '').trim();
  if (!t) return true;
  if (/^session$/i.test(t)) return true;
  if (/^(wt|plan)\s*·/i.test(t)) return true;
  // Default seed labels (en/zh) used when a thread is created empty
  if (/^(new task|新建任务|chat|对话|inbox|worktree)$/i.test(t)) return true;
  // Attachment-polluted titles from older builds
  if (/\[Attached/i.test(t)) return true;
  // UUID-ish or short session id
  if (/^[0-9a-f]{6,}$/i.test(t)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(t)) return true;
  return false;
}

/** Alias: only auto-title while still a placeholder (first user message). */
export function canAutoTitle(title: string): boolean {
  return isPlaceholderTitle(title);
}
