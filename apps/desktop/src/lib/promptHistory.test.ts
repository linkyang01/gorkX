import assert from 'node:assert/strict';
import { parsePromptHistory } from './promptHistory.ts';

assert.deepEqual(
  parsePromptHistory({ result: { prompts: ['  first task  ', 'first task', '', 42, 'second task'] } }),
  ['first task', 'second task'],
);
assert.deepEqual(parsePromptHistory({ prompts: ['x'.repeat(8_100)] }), ['x'.repeat(8_000)]);
assert.deepEqual(parsePromptHistory({ result: { prompts: Array.from({ length: 130 }, (_, i) => `p-${i}`) } }).length, 120);
assert.deepEqual(parsePromptHistory({ result: { prompts: null } }), []);
console.log('promptHistory.test.ts: ok');

