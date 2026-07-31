import assert from 'node:assert/strict';
import {
  createSessionBundle,
  parseSessionBundleText,
  serializeSessionBundle,
} from './sessionBundle.ts';

const bundle = createSessionBundle({
  sessionId: '12345678-abcd-4abc-8def-1234567890ab',
  cwd: '/tmp/project',
  state: { summary: { info: { id: '12345678-abcd-4abc-8def-1234567890ab' } }, plan: { entries: [] } },
  updates: [{ timestamp: '2026-07-31T00:00:00Z', method: 'session/update', params: {} }],
  exportedAt: '2026-07-31T00:00:00Z',
});
const roundTrip = parseSessionBundleText(serializeSessionBundle(bundle));
assert.equal(roundTrip.sessionId, bundle.sessionId);
assert.equal(roundTrip.updates.length, 1);
assert.throws(() => parseSessionBundleText(JSON.stringify({ ...bundle, state: {} })), /summary/);
assert.throws(() => parseSessionBundleText(JSON.stringify({ ...bundle, sessionId: 'not-a-session' })), /session id/);
assert.throws(() => parseSessionBundleText(JSON.stringify({ ...bundle, version: 2 })), /Unsupported/);
assert.throws(() => parseSessionBundleText(JSON.stringify({ ...bundle, updates: [{ bad: 'x'.repeat(2_100_000) }] })), /oversized/);
console.log('sessionBundle.test.ts: ok');
