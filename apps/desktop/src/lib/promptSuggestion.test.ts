import assert from 'node:assert/strict';
import { parsePromptSuggestion } from './promptSuggestion.ts';

assert.deepEqual(
  parsePromptSuggestion({ result: { suggestion: '  run the tests  ', generation: 4 } }, 1),
  { suggestion: 'run the tests', generation: 4 },
);
assert.deepEqual(parsePromptSuggestion({ suggestion: 'NONE', generation: 2 }, 1), { suggestion: null, generation: 2 });
assert.deepEqual(parsePromptSuggestion({ suggestion: 'do\nthis' }, 8), { suggestion: null, generation: 8 });
assert.equal(parsePromptSuggestion({ suggestion: 'x'.repeat(200) }, 1).suggestion?.length, 120);
console.log('promptSuggestion.test.ts: ok');

