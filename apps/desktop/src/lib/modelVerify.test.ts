/**
 * Stage F model verification helpers.
 * Run: node --experimental-strip-types src/lib/modelVerify.test.ts
 */
import assert from 'node:assert/strict';
import {
  countVerifiedApiProviders,
  formatTaskModelDisplay,
  inferAuthKind,
  isApiEligibleAuth,
  loadModelVerifyRecords,
  modelVerifyKey,
  providerFingerprint,
  resolveProviderForModelId,
  upsertModelVerifyRecord,
} from './modelVerify.ts';

assert.equal(
  modelVerifyKey({ apiBackend: 'responses', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' }),
  'responses|https://api.openai.com/v1|gpt-4o',
);

assert.equal(inferAuthKind({ baseUrl: 'http://127.0.0.1:11434/v1' }), 'local');
assert.equal(inferAuthKind({ baseUrl: 'https://api.openai.com/v1' }), 'api_key');
assert.equal(inferAuthKind({ baseUrl: '', providerLabel: 'ChatGPT Plus web' }), 'subscription_web');
assert.equal(isApiEligibleAuth('subscription_web'), false);
assert.equal(isApiEligibleAuth('api_key'), true);

const mem: Record<string, string> = {};
const storage = {
  getItem: (k: string) => mem[k] ?? null,
  setItem: (k: string, v: string) => {
    mem[k] = v;
  },
};

upsertModelVerifyRecord(
  {
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    apiBackend: 'responses',
    providerLabel: 'OpenAI API',
    ok: true,
    status: 200,
    note: 'ok',
    latencyMs: 120,
  },
  storage,
);
upsertModelVerifyRecord(
  {
    model: 'claude-sonnet',
    baseUrl: 'https://api.anthropic.com/v1',
    apiBackend: 'messages',
    providerLabel: 'Anthropic API',
    ok: true,
    status: 200,
  },
  storage,
);
// Web subscription must not count even if ok=true is attempted
upsertModelVerifyRecord(
  {
    model: 'gpt-4o-web',
    baseUrl: '',
    apiBackend: 'chat_completions',
    providerLabel: 'ChatGPT Plus web',
    ok: true,
    status: 200,
  },
  storage,
);

const records = loadModelVerifyRecords(storage.getItem);
assert.equal(countVerifiedApiProviders(records), 2);
const web = records.find((r) => r.model === 'gpt-4o-web');
assert.ok(web);
assert.equal(web!.ok, false);
assert.match(web!.failReason || '', /subscription|API/i);

assert.equal(
  formatTaskModelDisplay({ modelId: 'gpt-4o', providerLabel: 'OpenAI API' }),
  'OpenAI API · gpt-4o',
);
assert.equal(
  formatTaskModelDisplay({ modelId: 'grok-4', authSource: 'oauth' }),
  'Grok · grok-4',
);

assert.equal(
  resolveProviderForModelId('gpt-4o', [
    { model: 'gpt-4o', id: 'gpt-4o', providerLabel: 'OpenAI API' },
  ]),
  'OpenAI API',
);
assert.equal(resolveProviderForModelId('missing', []), null);

assert.equal(
  providerFingerprint({ providerLabel: 'OpenAI API' }),
  providerFingerprint({ providerLabel: 'openai api' }),
);

console.log('modelVerify.test.ts: ok');
