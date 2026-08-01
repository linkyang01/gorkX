/**
 * Shared subagent tree/poll/inspect status helpers.
 * Display only — kernel remains source of truth for lifecycle.
 */

/** True while Stop should remain available. */
export function isActiveSubagentStatus(status: string | undefined | null): boolean {
  const s = String(status || '').trim().toLowerCase();
  return /^(running|initializing|cancelling|pending|queued|starting|in_progress|active)\b/.test(s);
}

/** True when Inspect can show a terminal outcome (or a known failure/cancel). */
export function isTerminalSubagentStatus(status: string | undefined | null): boolean {
  const s = String(status || '').trim().toLowerCase();
  if (!s || isActiveSubagentStatus(s)) return false;
  return /^(complet|done|success|fail|error|cancel)/.test(s);
}

/**
 * Normalize kernel status strings for the process tree badge.
 * Preserves "running · N turns" style progress while mapping completed/cancelled/failed.
 */
export function normalizeSubagentToolStatus(raw: string | null | undefined): string {
  const original = String(raw ?? '').trim();
  if (!original) return '';
  const status = original.toLowerCase();
  if (/^(complet|done|success)/.test(status)) return 'completed';
  if (/^cancel/.test(status)) return 'cancelled';
  if (/^fail/.test(status)) return 'failed';
  if (/^error\b/.test(status)) return original;
  return original;
}

export interface SubagentSnapshotFields {
  statusRaw: string;
  toolStatus: string;
  output: string;
  failure: string;
  cancelled: string;
  worktreePath: string;
}

/** Pull inspect fields from a kernel get snapshot (camel or snake keys). */
export function extractSubagentSnapshotFields(
  snapshot: Record<string, unknown> | null | undefined,
): SubagentSnapshotFields | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const output = typeof snapshot.output === 'string' ? snapshot.output.trim() : '';
  const failure =
    typeof snapshot.failureError === 'string'
      ? snapshot.failureError
      : typeof snapshot.failure_error === 'string'
        ? snapshot.failure_error
        : '';
  const cancelled =
    typeof snapshot.cancelReason === 'string'
      ? snapshot.cancelReason
      : typeof snapshot.cancel_reason === 'string'
        ? snapshot.cancel_reason
        : '';
  const statusRaw = String(snapshot.status ?? 'unknown');
  const toolStatus = normalizeSubagentToolStatus(statusRaw) || statusRaw;
  const worktreePath =
    typeof snapshot.worktreePath === 'string'
      ? snapshot.worktreePath
      : typeof snapshot.worktree_path === 'string'
        ? snapshot.worktree_path
        : '';
  return { statusRaw, toolStatus, output, failure, cancelled, worktreePath };
}

/** Prefer output, then failure, then cancel reason. */
export function subagentInspectBody(
  fields: SubagentSnapshotFields,
  emptyFallback: string,
): string {
  return fields.output || fields.failure || fields.cancelled || emptyFallback;
}
