import assert from 'node:assert/strict';
import {
  AGENT_PROCESS_EXITED,
  humanizeEngineError,
  isAgentProcessExited,
  isGrokBuildAccessDenied,
  sanitizeText,
  summarizeError,
} from './chatFormat.ts';

const ansiDump =
  '\u001b[2m2026-08-01T05:31:04Z\u001b[0m \u001b[31mERROR\u001b[0m Internal error: {"message":"API error (status 403 Forbidden): Grok Build is coming soon. You don\'t have access now."}';

assert.equal(sanitizeText(ansiDump).includes('\u001b'), false);
assert.equal(isGrokBuildAccessDenied(ansiDump), true);
assert.equal(humanizeEngineError(ansiDump), 'GROKX_BUILD_ACCESS_DENIED');
assert.equal(
  humanizeEngineError(
    JSON.stringify({
      code: -32603,
      message: 'Internal error',
      data: {
        message: "API error (status 403 Forbidden): Grok Build is coming soon. You don't have access now.",
        http_status: 403,
      },
    }),
  ),
  'GROKX_BUILD_ACCESS_DENIED',
);
assert.equal(isAgentProcessExited(AGENT_PROCESS_EXITED), true);
assert.equal(isAgentProcessExited('Agent process exited'), true);
assert.equal(humanizeEngineError(AGENT_PROCESS_EXITED), 'GROKX_AGENT_PROCESS_EXITED');
assert.match(summarizeError('spawn failed: No such file or directory'), /No such file|spawn failed/i);


// Live 2026-08-01 probe body (auth ok, session ok, prompt 403)
assert.equal(
  isGrokBuildAccessDenied(
    'API error (status 403 Forbidden): Grok Build is coming soon. You don\'t have access now.',
  ),
  true,
);
assert.equal(
  humanizeEngineError(
    'API error (status 403 Forbidden): Grok Build is coming soon. You don\'t have access now.',
  ),
  'GROKX_BUILD_ACCESS_DENIED',
);

console.log('chatFormat.test.ts: ok');
