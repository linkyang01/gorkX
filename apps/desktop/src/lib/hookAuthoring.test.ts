import assert from 'node:assert/strict';
import {
  buildHookDefinition,
  buildHookVerificationDefinition,
  HOOK_VERIFICATION_HOOK_FILE,
  validateHookHandler,
} from './hookAuthoring.ts';

const command = JSON.parse(buildHookDefinition({
  event: 'PreToolUse',
  matcher: 'run_terminal_cmd',
  type: 'command',
  handler: './.grok/hooks/bin/check.sh',
  timeoutSeconds: 12,
}));
assert.equal(command.hooks.PreToolUse[0].matcher, 'run_terminal_cmd');
assert.equal(command.hooks.PreToolUse[0].hooks[0].command, './.grok/hooks/bin/check.sh');
assert.equal(command.hooks.PreToolUse[0].hooks[0].timeout, 12);

const http = JSON.parse(buildHookDefinition({
  event: 'PostToolUse',
  matcher: '',
  type: 'http',
  handler: 'https://hooks.example.test/check',
  timeoutSeconds: 0,
}));
assert.equal(http.hooks.PostToolUse[0].matcher, undefined);
assert.equal(http.hooks.PostToolUse[0].hooks[0].url, 'https://hooks.example.test/check');
assert.equal(http.hooks.PostToolUse[0].hooks[0].timeout, 1);

assert.equal(validateHookHandler('http', 'http://example.test/hook'), 'https');
assert.equal(validateHookHandler('http', 'https://example.test/hook'), null);
assert.equal(validateHookHandler('command', ''), 'required');

const verification = JSON.parse(buildHookVerificationDefinition({
  projectPath: '/private/tmp/gorkx-hook-verify-test',
  markerRelativePath: '.grok/gorkx-hook-verification/gorkx-test-token.marker',
  markerToken: 'gorkx-test-token',
  hookFileName: HOOK_VERIFICATION_HOOK_FILE,
}));
const sessionStart = verification.hooks.SessionStart[0].hooks[0];
assert.deepEqual(Object.keys(verification.hooks), ['SessionStart']);
assert.equal(verification.hooks.SessionStart.length, 1);
assert.equal(sessionStart.type, 'command');
assert.equal(sessionStart.timeout, 5);
assert.match(sessionStart.command, /\/bin\/sh -c/);
assert.match(sessionStart.command, /gorkx-test-token/);
assert.match(sessionStart.command, /gorkx-hook-verify-test/);
assert.doesNotThrow(() => JSON.parse(buildHookVerificationDefinition({
  projectPath: "/private/tmp/gorkx'safe-project",
  markerRelativePath: '.grok/gorkx-hook-verification/token_123456.marker',
  markerToken: 'token_123456',
  hookFileName: HOOK_VERIFICATION_HOOK_FILE,
})));
assert.throws(() => buildHookVerificationDefinition({
  projectPath: '/private/tmp/gorkx-hook-verify-test',
  markerRelativePath: '.grok/gorkx-hook-verification/token_123456.marker',
  markerToken: 'token_123456',
  hookFileName: 'arbitrary.json',
}), /file name/i);
assert.throws(() => buildHookVerificationDefinition({
  projectPath: '/private/tmp/gorkx-hook-verify-test',
  markerRelativePath: '../outside.marker',
  markerToken: 'token_123456',
  hookFileName: HOOK_VERIFICATION_HOOK_FILE,
}), /bounded directory/i);

console.log('hookAuthoring.test.ts: ok');
