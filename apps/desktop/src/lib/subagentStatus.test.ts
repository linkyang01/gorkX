import assert from 'node:assert/strict';
import {
  extractSubagentSnapshotFields,
  formatSubagentRowLabel,
  isActiveSubagentStatus,
  isTerminalSubagentStatus,
  normalizeSubagentToolStatus,
  stripSubagentRowPrefix,
  subagentInspectBody,
} from './subagentStatus.ts';

assert.equal(isActiveSubagentStatus('running'), true);
assert.equal(isActiveSubagentStatus('running · 3 turns · 2 tools'), true);
assert.equal(isActiveSubagentStatus('initializing'), true);
assert.equal(isActiveSubagentStatus('cancelling'), true);
assert.equal(isActiveSubagentStatus('completed'), false);
assert.equal(isActiveSubagentStatus('cancelled'), false);
assert.equal(isActiveSubagentStatus('failed'), false);

assert.equal(isTerminalSubagentStatus('completed'), true);
assert.equal(isTerminalSubagentStatus('cancelled'), true);
assert.equal(isTerminalSubagentStatus('failed'), true);
assert.equal(isTerminalSubagentStatus('completed · 4 tools'), true);
assert.equal(isTerminalSubagentStatus('running'), false);
assert.equal(isTerminalSubagentStatus('running · 1 turns'), false);

assert.equal(normalizeSubagentToolStatus('COMPLETED'), 'completed');
assert.equal(normalizeSubagentToolStatus('cancel-requested'), 'cancelled');
assert.equal(normalizeSubagentToolStatus('failed'), 'failed');
assert.equal(normalizeSubagentToolStatus('running · 2 turns'), 'running · 2 turns');

const snap = extractSubagentSnapshotFields({
  status: 'completed',
  output: '  hello  ',
  worktree_path: '/tmp/wt',
});
assert.ok(snap);
assert.equal(snap!.toolStatus, 'completed');
assert.equal(snap!.output, 'hello');
assert.equal(snap!.worktreePath, '/tmp/wt');
assert.equal(subagentInspectBody(snap!, 'empty'), 'hello');

const failed = extractSubagentSnapshotFields({
  status: 'failed',
  failure_error: 'boom',
});
assert.equal(subagentInspectBody(failed!, 'empty'), 'boom');

assert.equal(extractSubagentSnapshotFields(null), null);

assert.equal(
  formatSubagentRowLabel('Subtask', { type: 'explore', description: 'Read README' }),
  'Subtask · explore · Read README',
);
assert.equal(stripSubagentRowPrefix('子任务 · explore · Read README', '子任务'), 'explore · Read README');
assert.equal(stripSubagentRowPrefix('Subtask · plan · steps', 'Subtask'), 'plan · steps');

console.log('subagentStatus.test.ts: ok');
