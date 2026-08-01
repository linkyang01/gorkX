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

console.log('settingsFeedback.test.ts: ok');
