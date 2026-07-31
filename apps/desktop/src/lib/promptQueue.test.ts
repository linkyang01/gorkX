import assert from 'node:assert/strict';
import { parsePromptQueueChanged } from './promptQueue.ts';

const parsed = parsePromptQueueChanged({
  sessionId: 'session-1',
  entries: [
    { id: 'p2', version: 1, position: 1, kind: 'prompt', text: ' second ' },
    { id: 'p1', version: 0, position: 0, kind: 'prompt', text: 'first', combinedTexts: ['a', 'b'] },
    { id: 'p1', version: 9, position: 3, kind: 'prompt', text: 'duplicate' },
  ],
  runningPromptId: 'running',
  runningText: 'doing work',
});
assert.equal(parsed?.entries.length, 2);
assert.deepEqual(parsed?.entries.map((entry) => entry.id), ['p1', 'p2']);
assert.deepEqual(parsed?.entries[0]?.combinedTexts, ['a', 'b']);
assert.equal(parsed?.runningPromptId, 'running');
assert.equal(parsePromptQueueChanged({ sessionId: 'x', entries: 'bad' }), null);
assert.equal(parsePromptQueueChanged({ entries: [] }), null);
assert.equal(parsePromptQueueChanged({ sessionId: 'x', entries: Array.from({ length: 129 }, () => ({ id: 'x', text: 'x' })) }), null);
console.log('promptQueue.test.ts: ok');
