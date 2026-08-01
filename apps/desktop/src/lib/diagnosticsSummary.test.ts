import assert from 'node:assert/strict';
import { buildDiagnosticsSummary } from './diagnosticsSummary.ts';

const text = buildDiagnosticsSummary({
  appVersion: '1.0.0',
  kernelVersion: '0.2.116',
  authenticated: true,
  accountEmail: 'user@example.com',
  githubConnected: true,
  githubLogin: 'octocat',
  grokHome: '/tmp/gork-home',
});
assert.match(text, /appVersion: 1\.0\.0/);
assert.match(text, /kernelVersion: 0\.2\.116/);
assert.match(text, /authenticated: yes/);
assert.match(text, /\(present\)/);
assert.doesNotMatch(text, /user@example\.com/);
assert.match(text, /omits tokens/);
console.log('diagnosticsSummary.test.ts: ok');
