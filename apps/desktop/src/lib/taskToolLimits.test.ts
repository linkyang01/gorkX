import assert from 'node:assert/strict';
import {
  parseTaskToolLimitsForm,
  sanitizeTaskToolLimits,
  withSessionToolConstraints,
} from './taskToolLimits.ts';

assert.deepEqual(sanitizeTaskToolLimits(['bash', 'web_search', 'bash', 'nope']), [
  'bash',
  'web_search',
]);
assert.deepEqual(sanitizeTaskToolLimits('bash'), []);
assert.deepEqual(parseTaskToolLimitsForm('bash, write\nAgent'), ['bash', 'write', 'Agent']);

assert.equal(withSessionToolConstraints(undefined, {}), undefined);
assert.equal(withSessionToolConstraints('explore', { maxTurns: 8 }), 'explore');
assert.deepEqual(
  withSessionToolConstraints(undefined, { maxTurns: 8, disallowedTools: ['bash'] }),
  {
    name: 'gorkx-task',
    description: 'A gorkX desktop task with operator-selected tool limits.',
    promptMode: 'extend',
    permissionMode: 'default',
    maxTurns: 8,
    disallowedTools: ['bash'],
  },
);
assert.deepEqual(
  withSessionToolConstraints(
    {
      name: 'gorkx-plan',
      description: 'plan',
      promptMode: 'extend',
      permissionMode: 'default',
      promptBody: 'Plan first.',
    },
    { maxTurns: 5, disallowedTools: ['web_search'] },
  ),
  {
    name: 'gorkx-plan',
    description: 'plan',
    promptMode: 'extend',
    permissionMode: 'default',
    promptBody: 'Plan first.',
    maxTurns: 5,
    disallowedTools: ['web_search'],
  },
);

// Persistence helpers used by threads.ts encode path
import { sanitizeTaskToolLimits as sanitize } from './taskToolLimits.ts';
const roundTrip = (ids: string[]) =>
  sanitize(
    (ids.length ? ids.join(',') : '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
assert.deepEqual(roundTrip(['bash', 'web_search']), ['bash', 'web_search']);
assert.deepEqual(roundTrip([]), []);

console.log('taskToolLimits.test.ts: ok');
