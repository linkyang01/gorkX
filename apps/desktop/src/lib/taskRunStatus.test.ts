/**
 * Stage B pure status helpers.
 * Run: node --experimental-strip-types src/lib/taskRunStatus.test.ts
 */
import assert from 'node:assert/strict';
import {
  canAnswerApproval,
  deriveCurrentStep,
  deriveTaskRunPhase,
  isTaskStalled,
  promptCompletionNotice,
  resolveBusyFollowUpMode,
  shouldShowInRunCenter,
  DEFAULT_STALL_MS,
} from './taskRunStatus.ts';

// Phases
assert.equal(
  deriveTaskRunPhase({ busy: true, pendingDecisionCount: 0 }),
  'running',
);
assert.equal(
  deriveTaskRunPhase({ busy: true, pendingDecisionCount: 1 }),
  'awaiting_decision',
);
assert.equal(
  deriveTaskRunPhase({ busy: false, error: 'Agent process exited', pendingDecisionCount: 0 }),
  'failed',
);
assert.equal(
  deriveTaskRunPhase({ busy: false, error: null, pendingDecisionCount: 0 }),
  'idle',
);
// Decision beats busy for UI priority
assert.equal(
  deriveTaskRunPhase({ busy: true, error: 'x', pendingDecisionCount: 2 }),
  'awaiting_decision',
);

// Stall: only busy + old heartbeat; not when awaiting user
const now = 1_000_000;
assert.equal(
  isTaskStalled({ busy: true, lastEventAt: now - DEFAULT_STALL_MS - 1, now, pendingDecisionCount: 0 }),
  true,
);
assert.equal(
  isTaskStalled({ busy: true, lastEventAt: now - 1000, now, pendingDecisionCount: 0 }),
  false,
);
assert.equal(
  isTaskStalled({
    busy: true,
    lastEventAt: now - DEFAULT_STALL_MS - 1,
    now,
    pendingDecisionCount: 1,
  }),
  false,
);
assert.equal(
  isTaskStalled({ busy: false, lastEventAt: now - DEFAULT_STALL_MS * 2, now, pendingDecisionCount: 0 }),
  false,
);
assert.equal(
  isTaskStalled({ busy: true, lastEventAt: null, now, pendingDecisionCount: 0 }),
  false,
);

// Current step
assert.equal(
  deriveCurrentStep({
    tools: [
      { label: 'read file', toolStatus: 'completed' },
      { label: 'run tests', toolStatus: 'in_progress' },
    ],
  }),
  'run tests',
);
assert.equal(
  deriveCurrentStep({
    tools: [{ label: 'done', toolStatus: 'completed' }],
    planEntries: [
      { text: 'ship patch', checked: false, status: 'pending' },
    ],
  }),
  'ship patch',
);
assert.equal(
  deriveCurrentStep({ pendingDecisionLabel: 'Permission required' }),
  'Permission required',
);

assert.equal(shouldShowInRunCenter('running'), true);
assert.equal(shouldShowInRunCenter('idle'), false);

// Approval isolation
assert.equal(
  canAnswerApproval({ approvalThreadId: 'a', targetThreadId: 'a', hasClient: true }),
  true,
);
assert.equal(
  canAnswerApproval({ approvalThreadId: 'a', targetThreadId: 'b', hasClient: true }),
  false,
);
assert.equal(
  canAnswerApproval({ approvalThreadId: 'a', targetThreadId: 'a', hasClient: false }),
  false,
);

// Busy follow-up mode
assert.equal(resolveBusyFollowUpMode({ busy: false }), 'none');
assert.equal(resolveBusyFollowUpMode({ busy: true }), 'queue');

// Grok Build 1.0.12 hook-denied regression: preserve the upstream wording
// instead of reducing `_meta.cancellationCategory=HookDenied` to "cancelled".
assert.deepEqual(
  promptCompletionNotice({
    stopReason: 'cancelled',
    _meta: { cancellationCategory: 'HookDenied' },
  }),
  { kind: 'hook_blocked' },
);
assert.deepEqual(
  promptCompletionNotice({ stopReason: 'Turn blocked by a hook in 0.7s.' }),
  { kind: 'hook_blocked' },
);
assert.deepEqual(
  promptCompletionNotice({
    stopReason: 'cancelled',
    _meta: { cancellationCategory: 'PermissionCancelled' },
  }),
  { kind: 'stopped', reason: 'cancelled' },
);
assert.equal(promptCompletionNotice({ stopReason: 'end_turn' }), null);

console.log('taskRunStatus.test.ts: ok');
