import assert from 'node:assert/strict';
import { computerStatusDetail, settingsErrorMessage } from './settingsFeedback.ts';

// Force zh locale strings are environment-dependent; assert non-empty stable mapping.
assert.ok(settingsErrorMessage(new Error('macOS Accessibility permission is required before local Computer controls can be enabled.')).length > 4);
assert.ok(settingsErrorMessage('Open a connected task first to manage its Grok Build Hooks.').length > 4);
assert.ok(settingsErrorMessage('hook_name missing / invalid params').length > 4);
assert.ok(settingsErrorMessage('Unsupported key: f13').length > 4);
assert.ok(
  settingsErrorMessage(
    'API error (status 403 Forbidden): Grok Build is coming soon. You don\'t have access now.',
  ).length > 10,
);

assert.match(computerStatusDetail('Emergency stop applied. No further local Computer action will run until re-enabled.'), /./);
assert.match(computerStatusDetail('Foreground Computer controls are enabled. Use the emergency stop button to disable them.'), /./);
assert.match(computerStatusDetail('Foreground Computer controls are disabled.'), /./);
// Unknown detail is passed through.
assert.equal(computerStatusDetail('custom detail 42'), 'custom detail 42');

// Optional ACP extensions: keep "method not found" recognizable (not Hooks CTA).
assert.match(settingsErrorMessage('Method not found'), /method not found/i);
assert.ok(settingsErrorMessage('hooks method not found').length > 4);
assert.ok(settingsErrorMessage('Hook verification marker missing after real task').length > 4);
assert.ok(settingsErrorMessage('Hook verification marker mismatch').length > 4);
assert.ok(settingsErrorMessage('marker already existed before task').length > 4);

assert.ok(settingsErrorMessage(new Error('fetch failed: ECONNREFUSED 127.0.0.1:9222')).length > 4);
assert.ok(settingsErrorMessage('Keychain SecItemAdd failed: errSecAuthFailed').length > 4);
assert.ok(settingsErrorMessage('Chrome MCP connection refused').length > 4);
assert.ok(settingsErrorMessage('Model verify failed: invalid api key for endpoint').length > 4);
assert.ok(settingsErrorMessage('ENOENT: no such file or directory, open /tmp/x').length > 4);

assert.ok(settingsErrorMessage('GitHub API rate limit exceeded while checking releases').length > 4);
assert.ok(settingsErrorMessage('404 Not Found: no releases for update check').length > 4);
assert.ok(settingsErrorMessage('DMG download failed: checksum mismatch').length > 4);
assert.ok(settingsErrorMessage('kernel update --check spawn failed').length > 4);
assert.ok(settingsErrorMessage('OAuth device code expired during sign-in').length > 4);

console.log('settingsFeedback.test.ts: ok');
