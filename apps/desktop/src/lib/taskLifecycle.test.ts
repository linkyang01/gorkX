import assert from 'node:assert/strict';
import {
  decidePromptDispatch,
  enqueueUniqueApproval,
  removeApprovalByKey,
  removeApprovalsForThread,
  reduceTaskLifecycle,
  selectApprovalKey,
  type TaskLifecycleState,
} from './taskLifecycle.ts';

const base = (overrides: Partial<Parameters<typeof decidePromptDispatch>[0]> = {}) => ({
  text: 'hello',
  attachmentCount: 0,
  choiceSubmission: false,
  hasActiveThread: true,
  hasSession: true,
  hasClient: true,
  busy: false,
  ...overrides,
});

assert.deepEqual(decidePromptDispatch(base()), { kind: 'send' });
assert.deepEqual(decidePromptDispatch(base({ hasClient: false })), { kind: 'reconnect' });
assert.deepEqual(decidePromptDispatch(base({ hasSession: false, hasClient: false })), { kind: 'create' });
assert.deepEqual(decidePromptDispatch(base({ busy: true })), { kind: 'queue_native' });
assert.deepEqual(decidePromptDispatch(base({ busy: true, hasSession: false, hasClient: false })), { kind: 'queue_local' });
assert.deepEqual(decidePromptDispatch(base({ busy: true, text: '/btw check this' })), { kind: 'send' });
assert.deepEqual(decidePromptDispatch(base({ busy: true, text: '' })), { kind: 'ignore', reason: 'empty' });
assert.deepEqual(decidePromptDispatch(base({ busy: true, choiceSubmission: true })), { kind: 'ignore', reason: 'busy' });
assert.deepEqual(decidePromptDispatch(base({ hasSession: true, hasClient: false, busy: true })), { kind: 'ignore', reason: 'busy' });
assert.deepEqual(decidePromptDispatch(base({ hasActiveThread: true, hasSession: true, hasClient: false, busy: false })), { kind: 'reconnect' });

type Approval = { key: string; threadId: string; kind: string };
const first: Approval = { key: 'permission:a:1', threadId: 'a', kind: 'permission' };
const second: Approval = { key: 'question:b:1', threadId: 'b', kind: 'question' };
const approvals = enqueueUniqueApproval([], first);
assert.deepEqual(enqueueUniqueApproval(approvals, first), [first]);
assert.deepEqual(enqueueUniqueApproval(approvals, second), [first, second]);
assert.deepEqual(removeApprovalByKey([first, second], first.key), [second]);
assert.deepEqual(removeApprovalsForThread([first, second], first.threadId), [second]);
assert.equal(selectApprovalKey([first, second], second.key), second.key);
assert.equal(selectApprovalKey([first, second], first.key), first.key);
assert.equal(selectApprovalKey([second], first.key), second.key);
assert.equal(selectApprovalKey([], first.key), null);

const lifecycle: TaskLifecycleState = {
  busy: false,
  error: null,
  clientAttached: true,
  sessionId: 'session-a',
  approvalKeys: [],
  runningPromptId: null,
  reconnectAttempted: false,
};
let next = reduceTaskLifecycle(lifecycle, { type: 'prompt_started' });
assert.equal(next.busy, true);
next = reduceTaskLifecycle(next, { type: 'prompt_failed', error: 'engine failed' });
assert.equal(next.busy, false);
assert.equal(next.error, 'engine failed');
next = reduceTaskLifecycle(next, { type: 'approval_requested', key: first.key });
next = reduceTaskLifecycle(next, { type: 'queue_changed', runningPromptId: 'queued-1' });
assert.equal(next.busy, true);
assert.deepEqual(next.approvalKeys, [first.key]);
next = reduceTaskLifecycle(next, { type: 'process_exited' });
assert.equal(next.busy, false);
assert.equal(next.clientAttached, false);
assert.equal(next.runningPromptId, null);
assert.deepEqual(next.approvalKeys, []);
assert.equal(next.error, 'GROKX_AGENT_PROCESS_EXITED');

console.log('taskLifecycle.test.ts: ok');
