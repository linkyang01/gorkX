import assert from 'node:assert/strict';
import {
  formatGithubVerifiedAt,
  githubHostMessage,
  githubStatusFeedback,
  isGithubAuthRevoked,
} from './githubFeedback.ts';
import type { GithubStatus } from './github.ts';

assert.equal(isGithubAuthRevoked('GitHub HTTP 401 while whoami'), true);
assert.equal(isGithubAuthRevoked('GitHub HTTP 403 while whoami. The stored authorization may have been revoked or expired on GitHub.'), true);
assert.equal(isGithubAuthRevoked('network timeout'), false);

assert.ok(githubHostMessage('GitHub connection verified.').length > 4);
assert.ok(githubHostMessage('GitHub authorization is stored in macOS Keychain. Test it before reading repository data.').length > 4);
assert.ok(githubHostMessage('Stored authorization is no longer accepted by GitHub. Disconnect and reconnect after fixing access on GitHub.').length > 4);

const verified: GithubStatus = {
  configured: true,
  connected: true,
  login: 'octocat',
  error: null,
  authMethod: 'oauth',
  scopes: ['read:user', 'public_repo'],
  lastVerifiedAt: '2026-08-01T12:00:00.000Z',
  note: 'GitHub connection verified.',
};
const ok = githubStatusFeedback(verified);
assert.equal(ok.isError, false);
assert.match(ok.text, /octocat/);

const revoked: GithubStatus = {
  configured: true,
  connected: false,
  login: 'octocat',
  error: 'GitHub HTTP 401 while whoami. The stored authorization may have been revoked or expired on GitHub.',
  authMethod: 'oauth',
  scopes: ['read:user'],
  lastVerifiedAt: null,
  note: 'Stored authorization is no longer accepted by GitHub. Disconnect and reconnect after fixing access on GitHub.',
};
const bad = githubStatusFeedback(revoked);
assert.equal(bad.isError, true);
assert.ok(bad.text.length > 10);

assert.equal(formatGithubVerifiedAt(null), formatGithubVerifiedAt(undefined));
assert.match(formatGithubVerifiedAt('2026-08-01T12:00:00.000Z'), /2026|8|01|12/);

console.log('githubFeedback.test.ts: ok');
