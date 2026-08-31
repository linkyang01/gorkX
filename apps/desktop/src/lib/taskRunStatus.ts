/**
 * Stage B: derive real multi-task run phases from ACP-backed thread state only.
 * Never invents completion — idle means not busy and no open decision.
 */

export type TaskRunPhase = 'running' | 'awaiting_decision' | 'failed' | 'idle';

export type PromptCompletionNotice =
  | { kind: 'hook_blocked' }
  | { kind: 'stopped'; reason: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isHookBlockedText(value: string | null): boolean {
  return Boolean(value && /^turn blocked by a hook(?:\s+in\b.*)?[.!]?$/i.test(value));
}

/**
 * Normalize terminal PromptResponse metadata for the user-facing transcript.
 * Grok Build emits `_meta.cancellationCategory: "HookDenied"` for the
 * upstream “Turn blocked by a hook” outcome; that category must take
 * precedence over the generic `stopReason: "cancelled"`.
 */
export function promptCompletionNotice(result: unknown): PromptCompletionNotice | null {
  const root = asRecord(result);
  if (!root) return null;

  const meta = asRecord(root._meta);
  const category = nonEmptyString(
    meta?.cancellationCategory ??
      meta?.cancellation_category ??
      root.cancellationCategory ??
      root.cancellation_category,
  );
  if (category?.replace(/[_-]/g, '').toLowerCase() === 'hookdenied') {
    return { kind: 'hook_blocked' };
  }

  const stopReason = nonEmptyString(root.stopReason ?? root.stop_reason);
  const message = nonEmptyString(root.message);
  if (isHookBlockedText(stopReason) || isHookBlockedText(message)) {
    return { kind: 'hook_blocked' };
  }
  if (!stopReason || stopReason.toLowerCase() === 'end_turn') return null;
  return { kind: 'stopped', reason: stopReason.slice(0, 160) };
}

/** Default quiet window before a busy task is considered stalled (ms). */
export const DEFAULT_STALL_MS = 90_000;

export interface TaskRunInput {
  busy: boolean;
  error?: string | null;
  pendingDecisionCount: number;
  /** Last real ACP stream / tool / approval heartbeat for this task. */
  lastEventAt?: number | null;
  now?: number;
  stallMs?: number;
}

export interface ToolStepLike {
  label?: string;
  text?: string;
  status?: string;
  toolStatus?: string;
}

export interface PlanStepLike {
  text?: string;
  content?: string;
  status?: string;
  checked?: boolean;
}

/**
 * Four UI phases for the run center / thread rows.
 * Priority: awaiting_decision > running > failed > idle.
 */
export function deriveTaskRunPhase(input: TaskRunInput): TaskRunPhase {
  if (input.pendingDecisionCount > 0) return 'awaiting_decision';
  if (input.busy) return 'running';
  if (input.error && String(input.error).trim()) return 'failed';
  return 'idle';
}

/** True only when the task is busy and the real heartbeat is older than stallMs. */
export function isTaskStalled(
  input: Pick<TaskRunInput, 'busy' | 'lastEventAt' | 'now' | 'stallMs' | 'pendingDecisionCount'>,
): boolean {
  if (!input.busy) return false;
  // Waiting on the user is not a stall.
  if ((input.pendingDecisionCount ?? 0) > 0) return false;
  const last = input.lastEventAt;
  if (last == null || !Number.isFinite(last) || last <= 0) return false;
  const now = input.now ?? Date.now();
  const stallMs = input.stallMs ?? DEFAULT_STALL_MS;
  return now - last >= stallMs;
}

/**
 * Prefer the newest in-progress tool label; else the first open plan step;
 * else a pending decision label if provided.
 */
export function deriveCurrentStep(opts: {
  tools?: readonly ToolStepLike[];
  planEntries?: readonly PlanStepLike[];
  pendingDecisionLabel?: string | null;
}): string | null {
  const pending = (opts.pendingDecisionLabel || '').replace(/\s+/g, ' ').trim();
  if (pending) return pending.slice(0, 120);

  const tools = opts.tools ?? [];
  for (let i = tools.length - 1; i >= 0; i--) {
    const tool = tools[i];
    const st = String(tool.toolStatus ?? tool.status ?? '').toLowerCase();
    const done = /complete|completed|done|fail|failed|error|cancel/.test(st);
    if (done) continue;
    const label = String(tool.label || tool.text || '')
      .replace(/\s*·\s*(completed|failed|pending|in_progress|running)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (label) return label.slice(0, 120);
  }

  for (const entry of opts.planEntries ?? []) {
    if (entry.checked) continue;
    const st = String(entry.status ?? '').toLowerCase();
    if (/done|complete|finish/.test(st)) continue;
    const text = String(entry.text || entry.content || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) return text.slice(0, 120);
  }

  // Fallback: last tool label even if finished (shows what just ran)
  for (let i = tools.length - 1; i >= 0; i--) {
    const label = String(tools[i].label || tools[i].text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (label) return label.slice(0, 120);
  }
  return null;
}

/** Rows that belong in the Run Center (non-idle only). */
export function shouldShowInRunCenter(phase: TaskRunPhase): boolean {
  return phase !== 'idle';
}

/**
 * Answer routing guard: an approval may only be answered for its own thread's live client.
 */
export function canAnswerApproval(opts: {
  approvalThreadId: string;
  targetThreadId: string;
  hasClient: boolean;
}): boolean {
  return (
    Boolean(opts.approvalThreadId) &&
    opts.approvalThreadId === opts.targetThreadId &&
    opts.hasClient
  );
}

/** User guidance during a running task is queued for the next free turn. */
export function resolveBusyFollowUpMode(opts: { busy: boolean }): 'queue' | 'none' {
  return opts.busy ? 'queue' : 'none';
}
