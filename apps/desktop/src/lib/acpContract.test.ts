import assert from 'node:assert/strict';
import {
  PROTOCOL_VERSION,
  agent,
  client,
  methods,
} from '@agentclientprotocol/sdk';

type RoundTrace = {
  requests: string[];
  permissionToolIds: string[];
};

async function withTimeout<T>(promise: Promise<T>, label: string, ms = 2_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`ACP fixture timeout: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function fixtureAgent(trace: RoundTrace) {
  let releaseHeldPrompt: (() => void) | null = null;
  let holdStarted: (() => void) | null = null;
  const holdStartedPromise = new Promise<void>((resolve) => {
    holdStarted = resolve;
  });

  const app = agent({ name: 'gorkx-acp-fixture' })
    .onRequest(methods.agent.initialize, () => {
      trace.requests.push('initialize');
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: { loadSession: false },
      };
    })
    .onRequest(methods.agent.session.new, ({ params }) => {
      trace.requests.push(`session/new:${params.cwd}`);
      return { sessionId: 'fixture-session' };
    })
    .onRequest(methods.agent.session.prompt, async ({ params, client: agentClient }) => {
      const text = params.prompt.find((block) => block.type === 'text')?.text ?? '';
      trace.requests.push(`session/prompt:${text}`);
      if (text === 'hold') {
        holdStarted?.();
        await new Promise<void>((resolve) => {
          releaseHeldPrompt = resolve;
        });
        return { stopReason: 'cancelled' };
      }

      const permission = await agentClient.request(
        methods.client.session.requestPermission,
        {
          sessionId: params.sessionId,
          toolCall: {
            toolCallId: 'fixture-tool-1',
            kind: 'execute',
            status: 'in_progress',
            title: 'Run ACP fixture command',
          },
          options: [
            {
              optionId: 'allow-once',
              name: 'Allow once',
              kind: 'allow_once',
            },
          ],
        },
      );
      assert.deepEqual(permission.outcome, { outcome: 'selected', optionId: 'allow-once' });
      await agentClient.notify(methods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'fixture response' },
        },
      });
      return { stopReason: 'end_turn' };
    })
    .onNotification(methods.agent.session.cancel, ({ params }) => {
      trace.requests.push(`session/cancel:${params.sessionId}`);
      releaseHeldPrompt?.();
      releaseHeldPrompt = null;
    });

  return { app, holdStartedPromise };
}

async function runRound(): Promise<RoundTrace> {
  const trace: RoundTrace = { requests: [], permissionToolIds: [] };
  const fixture = fixtureAgent(trace);
  const fixtureClient = client({ name: 'gorkx-acp-client' })
    .onRequest(methods.client.session.requestPermission, ({ params }) => {
      trace.permissionToolIds.push(params.toolCall.toolCallId);
      return {
        outcome: {
          outcome: 'selected',
          optionId: params.options[0]?.optionId ?? 'allow-once',
        },
      };
    });

  await fixtureClient.connectWith(fixture.app, async (context) => {
    await context.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: { name: 'gorkx-acp-client', version: 'test' },
    });
    const session = await context.buildSession('/tmp/gorkx-acp-fixture').start();
    try {
      const response = await session.prompt('hello');
      assert.equal(response.stopReason, 'end_turn');
      const update = await withTimeout(session.nextUpdate(), 'session/update');
      assert.equal(update.kind, 'session_update');
      if (update.kind === 'session_update') {
        assert.equal(update.update.sessionUpdate, 'agent_message_chunk');
      }
      const stop = await withTimeout(session.nextUpdate(), 'prompt completion');
      assert.equal(stop.kind, 'stop');
      if (stop.kind === 'stop') assert.equal(stop.stopReason, 'end_turn');

      const pending = session.prompt('hold');
      await withTimeout(fixture.holdStartedPromise, 'prompt start');
      await context.notify(methods.agent.session.cancel, { sessionId: session.sessionId });
      const cancelled = await withTimeout(pending, 'cancelled prompt');
      assert.equal(cancelled.stopReason, 'cancelled');
      assert.deepEqual(
        await withTimeout(session.nextUpdate(), 'cancel completion'),
        { kind: 'stop', response: { stopReason: 'cancelled' }, stopReason: 'cancelled' },
      );
    } finally {
      session.dispose();
    }
  });

  assert.deepEqual(trace.requests, [
    'initialize',
    'session/new:/tmp/gorkx-acp-fixture',
    'session/prompt:hello',
    'session/prompt:hold',
    'session/cancel:fixture-session',
  ]);
  assert.deepEqual(trace.permissionToolIds, ['fixture-tool-1']);
  return trace;
}

const first = await runRound();
const second = await runRound();
assert.equal(first.requests[0], 'initialize');
assert.equal(second.requests[0], 'initialize');
assert.equal(second.requests.at(-1), 'session/cancel:fixture-session');

console.log('acpContract.test.ts: ok');
