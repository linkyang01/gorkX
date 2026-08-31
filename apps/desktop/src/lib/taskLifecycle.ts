/**
 * P1 task lifecycle policy.
 *
 * The React component owns rendering and persistence; this module owns the
 * small, deterministic decisions that must not drift between send, cancel,
 * reconnect, queue, and approval paths. It intentionally has no browser or
 * Tauri dependency so the policy can be exercised by the existing Node test
 * harness and by an ACP contract fixture.
 */

export type PromptDispatchKind =
  | 'ignore'
  | 'reconnect'
  | 'queue_native'
  | 'queue_local'
  | 'create'
  | 'send';

export type PromptDispatchReason =
  | 'empty'
  | 'busy'
  | 'reconnect_failed'
  | 'ready';

export type PromptDispatchDecision =
  | { kind: 'ignore'; reason: Exclude<PromptDispatchReason, 'ready'> }
  | { kind: Exclude<PromptDispatchKind, 'ignore'> };

export interface PromptDispatchInput {
  text: string;
  attachmentCount: number;
  choiceSubmission: boolean;
  hasActiveThread: boolean;
  hasSession: boolean;
  hasClient: boolean;
  busy: boolean;
}

/**
 * Decide the only legal route for a composer submission.
 *
 * `send` is reserved for a live, idle ACP session. A busy task may only use
 * the native queue (or the local fallback when no client is attached); the
 * `/btw` side-question is intentionally the one busy exception and still
 * requires a live session. This prevents a double-send when a reconnect or a
 * queue notification races with a React render.
 */
export function decidePromptDispatch(input: PromptDispatchInput): PromptDispatchDecision {
  const text = input.text.trim();
  const hasContent = Boolean(text) || input.attachmentCount > 0;
  if (!hasContent) return { kind: 'ignore', reason: 'empty' };

  if (input.hasSession && !input.hasClient) {
    return input.busy
      ? { kind: 'ignore', reason: 'busy' }
      : { kind: 'reconnect' };
  }

  const isBusyAside =
    !input.choiceSubmission &&
    input.attachmentCount === 0 &&
    /^\/btw(?:\s|$)/i.test(text);
  if (input.busy) {
    if (isBusyAside && input.hasClient && input.hasSession) return { kind: 'send' };
    if (text && !input.choiceSubmission) {
      return input.hasClient && input.hasSession
        ? { kind: 'queue_native' }
        : { kind: 'queue_local' };
    }
    return { kind: 'ignore', reason: 'busy' };
  }

  if (!input.hasClient || !input.hasSession) {
    // An existing session with no client was handled above. This branch is a
    // new home-composer task or a stub that has not been assigned a session.
    if (input.hasActiveThread && input.hasSession) {
      return { kind: 'ignore', reason: 'reconnect_failed' };
    }
    return { kind: 'create' };
  }

  return { kind: 'send' };
}

export interface ApprovalLike {
  key: string;
  threadId: string;
}

/** Append one ACP decision exactly once, preserving arrival order. */
export function enqueueUniqueApproval<T extends ApprovalLike>(
  current: readonly T[],
  next: T,
): T[] {
  return current.some((item) => item.key === next.key) ? [...current] : [...current, next];
}

/** Remove one decision without touching approvals belonging to other tasks. */
export function removeApprovalByKey<T extends ApprovalLike>(
  current: readonly T[],
  key: string,
): T[] {
  return current.filter((item) => item.key !== key);
}

/** Process exit invalidates only decisions owned by the exited task. */
export function removeApprovalsForThread<T extends ApprovalLike>(
  current: readonly T[],
  threadId: string,
): T[] {
  return current.filter((item) => item.threadId !== threadId);
}

/** Keep the selected decision when it still exists, otherwise select FIFO. */
export function selectApprovalKey<T extends ApprovalLike>(
  current: readonly T[],
  preferredKey?: string | null,
): string | null {
  if (preferredKey && current.some((item) => item.key === preferredKey)) return preferredKey;
  return current[0]?.key ?? null;
}

export interface TaskLifecycleState {
  busy: boolean;
  error: string | null;
  clientAttached: boolean;
  sessionId: string | null;
  approvalKeys: readonly string[];
  runningPromptId: string | null;
  reconnectAttempted: boolean;
}

export type TaskLifecycleEvent =
  | { type: 'client_attached'; sessionId: string }
  | { type: 'prompt_started' }
  | { type: 'prompt_completed' }
  | { type: 'prompt_failed'; error: string }
  | { type: 'cancel_completed' }
  | { type: 'approval_requested'; key: string }
  | { type: 'approval_answered'; key: string }
  | { type: 'queue_changed'; runningPromptId?: string | null }
  | { type: 'reconnect_scheduled' }
  | { type: 'reconnect_succeeded' }
  | { type: 'process_exited'; error?: string | null };

const PROCESS_EXITED = 'GROKX_AGENT_PROCESS_EXITED';

function boundedError(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return text ? text.slice(0, 4_000) : null;
}

/**
 * Apply one lifecycle event without side effects. The invariants are:
 * terminal failure/cancel/exit never leaves `busy=true`, and process exit
 * never leaves an answerable approval or a running queue marker behind.
 */
export function reduceTaskLifecycle(
  state: TaskLifecycleState,
  event: TaskLifecycleEvent,
): TaskLifecycleState {
  const next: TaskLifecycleState = {
    ...state,
    approvalKeys: [...state.approvalKeys],
  };
  switch (event.type) {
    case 'client_attached':
      next.clientAttached = true;
      next.sessionId = event.sessionId;
      next.error = null;
      next.reconnectAttempted = false;
      return next;
    case 'prompt_started':
      next.busy = true;
      next.error = null;
      return next;
    case 'prompt_completed':
    case 'cancel_completed':
      next.busy = false;
      return next;
    case 'prompt_failed':
      next.busy = false;
      next.error = boundedError(event.error) ?? 'Task failed';
      return next;
    case 'approval_requested':
      if (!next.approvalKeys.includes(event.key)) next.approvalKeys = [...next.approvalKeys, event.key];
      return next;
    case 'approval_answered':
      next.approvalKeys = next.approvalKeys.filter((key) => key !== event.key);
      return next;
    case 'queue_changed':
      next.runningPromptId = event.runningPromptId?.trim() || null;
      if (next.runningPromptId) next.busy = true;
      return next;
    case 'reconnect_scheduled':
      next.reconnectAttempted = true;
      return next;
    case 'reconnect_succeeded':
      next.reconnectAttempted = false;
      return next;
    case 'process_exited':
      next.busy = false;
      next.clientAttached = false;
      next.runningPromptId = null;
      next.approvalKeys = [];
      next.error = boundedError(event.error) ?? PROCESS_EXITED;
      return next;
  }
}
