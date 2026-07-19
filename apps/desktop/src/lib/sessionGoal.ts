/** Session goal state for task banners (shell-side; agent owns execution). */

export type GoalStatus = 'active' | 'paused' | 'complete' | 'blocked';

export interface SessionGoal {
  text: string;
  status: GoalStatus;
  message?: string | null;
  blockedReason?: string | null;
  updatedAt: number;
}

export function makeGoal(text: string, status: GoalStatus = 'active'): SessionGoal {
  return {
    text: text.trim(),
    status,
    message: null,
    blockedReason: null,
    updatedAt: Date.now(),
  };
}

/** Parse `/goal <text>` user line → goal text, or null if empty / not a goal line. */
export function parseGoalCommand(line: string): { sub?: string; text?: string } | null {
  const raw = (line || '').trim();
  if (!raw.startsWith('/')) return null;
  const m = raw.match(/^\/goal(?:\s+(\S+))?(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  const a1 = (m[1] || '').trim();
  const rest = (m[2] || '').trim();
  const sub = a1.toLowerCase();
  if (['status', 'pause', 'resume', 'clear'].includes(sub)) {
    return { sub, text: rest || undefined };
  }
  // `/goal my objective…` — a1 is first word of objective
  const text = [a1, rest].filter(Boolean).join(' ').trim();
  return { text: text || undefined };
}

export function isGoalToolName(name: string | undefined | null): boolean {
  const n = (name || '').toLowerCase().replace(/[\s-]+/g, '_');
  return n === 'update_goal' || n.includes('update_goal') || n === 'goal_update';
}

/**
 * Best-effort parse of update_goal tool input / result payload.
 * Accepts JSON object or JSON-looking string; multiple field aliases.
 */
export function parseUpdateGoalPayload(raw: unknown): Partial<SessionGoal> | null {
  let obj: Record<string, unknown> | null = null;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  } else if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    try {
      const p = JSON.parse(s) as unknown;
      if (p && typeof p === 'object' && !Array.isArray(p)) obj = p as Record<string, unknown>;
    } catch {
      // Plain status message
      return { message: s.slice(0, 400), updatedAt: Date.now() };
    }
  }
  if (!obj) return null;

  const patch: Partial<SessionGoal> = { updatedAt: Date.now() };
  const msg =
    (typeof obj.message === 'string' && obj.message) ||
    (typeof obj.status_message === 'string' && obj.status_message) ||
    (typeof obj.note === 'string' && obj.note) ||
    null;
  if (msg) patch.message = msg.slice(0, 400);

  const blocked =
    (typeof obj.blocked_reason === 'string' && obj.blocked_reason) ||
    (typeof obj.blockedReason === 'string' && obj.blockedReason) ||
    null;
  if (blocked) {
    patch.status = 'blocked';
    patch.blockedReason = blocked.slice(0, 400);
  }

  const completed = obj.completed === true || obj.done === true || obj.complete === true;
  if (completed) patch.status = 'complete';

  const st = typeof obj.status === 'string' ? obj.status.toLowerCase() : '';
  if (st === 'paused' || st === 'pause') patch.status = 'paused';
  if (st === 'active' || st === 'running' || st === 'in_progress') patch.status = 'active';
  if (st === 'complete' || st === 'completed' || st === 'done') patch.status = 'complete';
  if (st === 'blocked') patch.status = 'blocked';

  if (typeof obj.text === 'string' && obj.text.trim()) patch.text = obj.text.trim();
  if (typeof obj.goal === 'string' && obj.goal.trim()) patch.text = obj.goal.trim();

  if (
    !patch.message &&
    !patch.status &&
    !patch.text &&
    !patch.blockedReason
  ) {
    return null;
  }
  return patch;
}

export function applyGoalPatch(
  prev: SessionGoal | null | undefined,
  patch: Partial<SessionGoal>,
): SessionGoal | null {
  if (!prev && !patch.text) {
    if (patch.status === 'complete' || patch.message) {
      return {
        text: (patch.message || 'Goal').slice(0, 400),
        status: patch.status || 'active',
        message: patch.message ?? null,
        blockedReason: patch.blockedReason ?? null,
        updatedAt: patch.updatedAt || Date.now(),
      };
    }
    return null;
  }
  const base: SessionGoal = prev ?? makeGoal(patch.text || 'Goal');
  return {
    text: (patch.text ?? base.text).trim() || base.text,
    status: patch.status ?? base.status,
    message: patch.message !== undefined ? patch.message : base.message,
    blockedReason:
      patch.blockedReason !== undefined ? patch.blockedReason : base.blockedReason,
    updatedAt: patch.updatedAt || Date.now(),
  };
}

/** Scan chat lines for last /goal set; null if cleared after. */
export function recoverGoalFromLines(
  lines: Array<{ role: string; text: string }>,
): SessionGoal | null {
  let found: SessionGoal | null = null;
  for (const l of lines) {
    if (l.role !== 'user') continue;
    const p = parseGoalCommand(l.text);
    if (!p) continue;
    if (p.sub === 'clear') {
      found = null;
      continue;
    }
    if (p.sub === 'pause' && found) {
      found = {
        text: found.text,
        status: 'paused',
        message: found.message,
        blockedReason: found.blockedReason,
        updatedAt: Date.now(),
      };
      continue;
    }
    if (p.sub === 'resume' && found) {
      found = {
        text: found.text,
        status: 'active',
        message: found.message,
        blockedReason: found.blockedReason,
        updatedAt: Date.now(),
      };
      continue;
    }
    if (p.sub === 'status') continue;
    if (p.text) found = makeGoal(p.text, 'active');
  }
  return found;
}

export function goalStatusLabel(
  status: GoalStatus,
  labels: {
    active: string;
    paused: string;
    complete: string;
    blocked: string;
  },
): string {
  switch (status) {
    case 'paused':
      return labels.paused;
    case 'complete':
      return labels.complete;
    case 'blocked':
      return labels.blocked;
    default:
      return labels.active;
  }
}

export function goalFromMetaFields(
  text?: string | null,
  status?: string | null,
  message?: string | null,
): SessionGoal | null {
  if (!text?.trim()) return null;
  const st = (status || 'active').toLowerCase();
  const statusOk: GoalStatus =
    st === 'paused' || st === 'complete' || st === 'blocked' ? st : 'active';
  return {
    text: text.trim(),
    status: statusOk,
    message: message ?? null,
    blockedReason: null,
    updatedAt: Date.now(),
  };
}

export function goalToMetaFields(g: SessionGoal | null | undefined): {
  sessionGoalText: string | null;
  sessionGoalStatus: string | null;
  sessionGoalMessage: string | null;
} {
  if (!g?.text?.trim()) {
    return { sessionGoalText: null, sessionGoalStatus: null, sessionGoalMessage: null };
  }
  return {
    sessionGoalText: g.text,
    sessionGoalStatus: g.status,
    sessionGoalMessage: g.message ?? null,
  };
}
