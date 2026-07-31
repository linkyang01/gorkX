import assert from 'node:assert/strict';
import { buildHookDefinition, validateHookHandler } from './hookAuthoring.ts';

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

console.log('hookAuthoring.test.ts: ok');
