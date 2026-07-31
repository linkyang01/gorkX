/** Pure parser checks for the native Grok Build update response. */
import assert from 'node:assert/strict';
import { parseKernelUpdateOutput } from './kernelUpdate.ts';

const available = parseKernelUpdateOutput(
  '\u001b[33mWARN\u001b[0m channel unavailable\n{"currentVersion":"0.2.112","latestVersion":"0.2.113","updateAvailable":true,"channel":"stable"}',
  0,
);
assert.equal(available.currentVersion, '0.2.112');
assert.equal(available.latestVersion, '0.2.113');
assert.equal(available.updateAvailable, true);
assert.equal(available.runtimeUpdatesDisabled, true);
assert.equal(available.error, null);

const unavailable = parseKernelUpdateOutput(
  '{"currentVersion":"0.2.112","latestVersion":null,"updateAvailable":false,"channel":"stable","error":"network unavailable"}',
  0,
);
assert.equal(unavailable.latestVersion, '0.2.112');
assert.equal(unavailable.updateAvailable, false);
assert.equal(unavailable.error, 'network unavailable');

const malformed = parseKernelUpdateOutput('updater failed', 1);
assert.equal(malformed.currentVersion, '—');
assert.match(malformed.error || '', /updater failed/);

console.log('updates.test.ts: ok');
