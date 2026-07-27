/**
 * Stage D connector contract helpers.
 * Run: node --experimental-strip-types src/lib/connectors.test.ts
 */
import assert from 'node:assert/strict';
import {
  CONNECTOR_CATALOG,
  deriveConnectorUiState,
  getConnector,
  githubWriteConfirmSummary,
  isDeclaredWriteAction,
  realConnectors,
  soonConnectors,
} from './connectors.ts';
import {
  appendConnectorAudit,
  loadConnectorAudit,
} from './connectorAudit.ts';

assert.ok(CONNECTOR_CATALOG.some((c) => c.id === 'github' && c.availability === 'real'));
assert.ok(soonConnectors().every((c) => c.availability === 'soon'));
assert.equal(realConnectors().length, 1);
assert.equal(realConnectors()[0].id, 'github');

const gh = getConnector('github')!;
assert.ok(isDeclaredWriteAction(gh, 'create_pull_request'));
assert.ok(isDeclaredWriteAction(gh, 'create_pr_comment'));
assert.equal(isDeclaredWriteAction(gh, 'delete_repo'), false);

assert.equal(deriveConnectorUiState(gh, null), 'disconnected');
assert.equal(deriveConnectorUiState(gh, { configured: true, connected: false }), 'configured');
assert.equal(deriveConnectorUiState(gh, { configured: true, connected: true }), 'connected');
assert.equal(deriveConnectorUiState(gh, { error: 'boom' }), 'error');
assert.equal(
  deriveConnectorUiState(getConnector('calendar')!, { connected: true }),
  'soon',
);

const summary = githubWriteConfirmSummary({
  action: 'create_pull_request',
  titleOrBody: 'Fix login',
  base: 'main',
  draft: true,
});
assert.match(summary, /pull request/);
assert.match(summary, /main/);
assert.match(summary, /draft/i);

// Audit: no tokens in storage
const mem: Record<string, string> = {};
const storage = {
  getItem: (k: string) => mem[k] ?? null,
  setItem: (k: string, v: string) => {
    mem[k] = v;
  },
};
appendConnectorAudit(
  {
    connector: 'github',
    action: 'write',
    summary: 'Create PR with token ghp_ABCDEFG1234567890secret',
    receiptUrl: 'https://github.com/o/r/pull/1?token=leak',
  },
  storage,
);
const events = loadConnectorAudit(storage.getItem);
assert.equal(events.length, 1);
assert.ok(!events[0].summary.includes('ghp_'));
assert.ok(events[0].summary.includes('[redacted-token]'));
assert.equal(events[0].receiptUrl, 'https://github.com/o/r/pull/1');

console.log('connectors.test.ts: ok');
