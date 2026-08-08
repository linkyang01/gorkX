#!/usr/bin/env node
// Protocol gate for a Grok Build binary. By default it intentionally requires
// no login and never touches the user's GROK_HOME or project directory.
// Pass --authenticated only with an explicit disposable GROK_HOME/project-dir
// pair. `GORKX_ACP_TEST_AUTH_DIR` and `GORKX_ACP_TEST_PROJECT_DIR` are
// preferred over the legacy names: some process runners reserve or strip
// `*_HOME` and `*_CWD`.
// --worktree additionally creates a worktree only in that disposable Git CWD.
// --resource sends one minimal model request with a temporary local attachment.
// --custom-model verifies a disposable [model.*] override can be selected;
// it never sends a prompt to that provider.
// --session-controls checks native session forking and checkpoint listing
// without making a model request or modifying the supplied project CWD.
// --runtime-controls checks the exact session roster, delete and model-reload
// routes used by the gorkX desktop client; it creates/removes only test sessions.
// --rewind-execute requires --resource and performs one real, isolated
// conversation-only rewind after the resource prompt creates a checkpoint.
// --subagent-controls probes lifecycle routes with a guaranteed-missing ID;
// it never starts or cancels a real subagent.
// --hooks-controls reloads the current isolated project's discovered hooks;
// it never creates, enables or executes a hook.
// --btw sends one native side question. It is a billable model acceptance gate
// and must return the exact isolated response, never a queued main prompt.
// --session-info reads the active session's kernel snapshot. It sends no model
// request and proves the desktop Task Info panel's ACP contract, including the
// token-free authentication category and its safe settings destination.
// --voice-controls verifies native voice ACP routes reach the session control
// plane without starting capture, requesting microphone permission, or sending
// audio to a provider.
// --desktop-controls verifies the desktop action routes reach their native
// session guards without creating a session or sending a model request.
// --cloud-controls verifies the native cloud-environment route and its
// authentication guard without creating, updating or deleting a resource.
// --billing-controls verifies the native billing and auto-top-up read routes;
// it never mutates billing settings or sends a model request.
// --session-search verifies the native cross-session FTS search route without
// loading or mutating a session.
// --prompt-history verifies the native durable prompt-history read route without
// sending a model request or changing session state.
// --prompt-suggestion verifies the native next-prompt suggestion route with a
// guaranteed-missing session; it must return an empty suggestion without a model request.
// --session-bundle verifies the native session/state, session/updates and
// session/import guards without reading or mutating a real session.
// --hunk-controls reads the native agent-change ledger for an isolated session;
// it does not accept or reject files.
// --client-fs-write advertises the same bounded client file-write capability
// used by a Full-permission desktop task. It only validates ACP initialize;
// it does not create a session or write a file.
// --disable-web-search starts the exact root-flag + agent invocation used by
// gorkX when a user turns off web research. It sends no model request.
// --model-reload checks the hot model-catalog reload route used after a
// provider changes; it sends no model request and accepts either ACP spelling.
// --agent-profile verifies the portable agent-profile object contract carried
// in ACP session/new. It creates no prompt and changes only the isolated test
// session.
// --agent-profile-name <name> verifies a named, kernel-discovered profile;
// names are bounded identifiers and never file paths.
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const [bin, ...options] = process.argv.slice(2);
if (!bin) {
  console.error('usage: node scripts/verify-grok-acp.mjs /path/to/grok [--authenticated] [--worktree] [--resource] [--custom-model] [--session-controls] [--runtime-controls] [--rewind-execute] [--subagent-controls] [--hooks-controls] [--btw] [--session-info] [--voice-controls] [--desktop-controls] [--cloud-controls] [--billing-controls] [--session-search] [--prompt-history] [--prompt-suggestion] [--session-bundle] [--hunk-controls] [--client-fs-write] [--disable-web-search] [--model-reload] [--agent-profile] [--agent-profile-name <name>]');
  process.exit(2);
}
const authenticated = options.includes('--authenticated');
const worktreeSmoke = options.includes('--worktree');
const resourceSmoke = options.includes('--resource');
const customModelSmoke = options.includes('--custom-model');
const sessionControlsSmoke = options.includes('--session-controls');
const runtimeControlsSmoke = options.includes('--runtime-controls');
const rewindExecuteSmoke = options.includes('--rewind-execute');
const subagentControlsSmoke = options.includes('--subagent-controls');
const hooksControlsSmoke = options.includes('--hooks-controls');
const btwSmoke = options.includes('--btw');
const sessionInfoSmoke = options.includes('--session-info');
const voiceControlsSmoke = options.includes('--voice-controls');
const desktopControlsSmoke = options.includes('--desktop-controls');
const cloudControlsSmoke = options.includes('--cloud-controls');
const billingControlsSmoke = options.includes('--billing-controls');
const sessionSearchSmoke = options.includes('--session-search');
const promptHistorySmoke = options.includes('--prompt-history');
const promptSuggestionSmoke = options.includes('--prompt-suggestion');
const sessionBundleSmoke = options.includes('--session-bundle');
const hunkControlsSmoke = options.includes('--hunk-controls');
const clientFileWriteSmoke = options.includes('--client-fs-write');
const disableWebSearchSmoke = options.includes('--disable-web-search');
const modelReloadSmoke = options.includes('--model-reload');
const agentProfileSmoke = options.includes('--agent-profile');
const agentProfileNameIndex = options.indexOf('--agent-profile-name');
const agentProfileName = agentProfileNameIndex >= 0 ? options[agentProfileNameIndex + 1] : '';
if (agentProfileNameIndex >= 0 && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(agentProfileName)) {
  console.error('--agent-profile-name requires one safe profile name');
  process.exit(2);
}
if ((worktreeSmoke || resourceSmoke || customModelSmoke || sessionControlsSmoke || runtimeControlsSmoke || rewindExecuteSmoke || subagentControlsSmoke || hooksControlsSmoke || btwSmoke || sessionInfoSmoke || hunkControlsSmoke || agentProfileSmoke || agentProfileName) && !authenticated) {
  console.error('--worktree, --resource, --custom-model, --session-controls, --runtime-controls, --rewind-execute, --subagent-controls, --hooks-controls, --btw, --session-info, --hunk-controls and agent-profile checks require --authenticated with explicit disposable auth and project directories');
  process.exit(2);
}
if (rewindExecuteSmoke && !resourceSmoke) {
  console.error('--rewind-execute requires --resource so the isolated session has a real checkpoint');
  process.exit(2);
}
const knownOptions = new Set(['--authenticated', '--worktree', '--resource', '--custom-model', '--session-controls', '--runtime-controls', '--rewind-execute', '--subagent-controls', '--hooks-controls', '--btw', '--session-info', '--voice-controls', '--desktop-controls', '--cloud-controls', '--billing-controls', '--session-search', '--prompt-history', '--prompt-suggestion', '--session-bundle', '--hunk-controls', '--client-fs-write', '--disable-web-search', '--model-reload', '--agent-profile', '--agent-profile-name']);
if (options.some((option, index) => !knownOptions.has(option) && index !== agentProfileNameIndex + 1)) {
  console.error(`unknown option: ${options.find((option, index) => !knownOptions.has(option) && index !== agentProfileNameIndex + 1)}`);
  process.exit(2);
}

const isolatedHome = !authenticated;
const home = authenticated
  ? (process.env.GORKX_ACP_TEST_AUTH_DIR || process.env.GORKX_ACP_TEST_HOME)
  : await mkdtemp(join(tmpdir(), 'gorkx-acp-smoke-'));
const cwd = authenticated
  ? (process.env.GORKX_ACP_TEST_PROJECT_DIR || process.env.GORKX_ACP_TEST_CWD)
  : home;
if (!home || !cwd) {
  console.error('--authenticated requires explicit GROKX_ACP_TEST_AUTH_DIR and GROKX_ACP_TEST_PROJECT_DIR');
  process.exit(2);
}
if (authenticated) {
  const userHome = process.env.HOME;
  const protectedHomes = userHome ? [
    resolve(userHome, '.grok'),
    resolve(userHome, 'Library/Application Support/gorkX/grok-home'),
  ] : [];
  if (protectedHomes.includes(resolve(home))) {
    console.error('refusing to run authenticated smoke against a standard user GROK_HOME; use a disposable test home');
    process.exit(2);
  }
}
const customModelId = 'gorkx-acp-custom-smoke';
if (customModelSmoke) {
  // The explicit test home is disposable by contract.  This proves the
  // released kernel accepts gorkX's persisted schema and advertises the model
  // through ACP, without sending a billable inference request to the endpoint.
  await writeFile(join(home, 'config.toml'), `[model.${customModelId}]\nmodel = "${customModelId}"\nname = "gorkX ACP custom-model smoke"\nbase_url = "http://127.0.0.1:9/v1"\nenv_key = "GORKX_MODEL_${customModelId.replaceAll('-', '_').toUpperCase()}"\napi_backend = "chat_completions"\n\n[models]\ndefault = "${customModelId}"\n`, 'utf8');
}
const child = spawn(bin, disableWebSearchSmoke ? ['--disable-web-search', 'agent', 'stdio'] : ['agent', 'stdio'], {
  env: { ...process.env, GROK_HOME: home },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stderr = '';
let buffer = '';
let nextId = 1;
const pending = new Map();
let resourceFixture = '';
child.stderr.on('data', (chunk) => { stderr += chunk; });
child.on('exit', (code, signal) => {
  const reason = `Grok ACP process exited before the request completed (code=${code ?? 'none'}, signal=${signal ?? 'none'})`;
  for (const waiter of pending.values()) waiter.reject(new Error(reason));
  pending.clear();
});

// The engine's tracing is not an API contract. In particular, an auth refresh
// failure can include credential-derived debug fields. Keep ACP smoke failure
// output useful without allowing it to leak into CI logs or a developer shell.
function safeEngineStderr(raw) {
  return raw
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .split(/\r?\n/)
    .map((line) =>
      /token|api[_-]?key|secret|password|authorization|rt_prefix/i.test(line)
        ? '[engine diagnostic redacted: credential-related detail omitted]'
        : line,
    )
    .join('\n');
}
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) break;
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter.resolve(message);
      }
    } catch {
      // Grok Build should use JSONL, but an unexpected diagnostic must not
      // make the parser lose framing for later protocol messages.
    }
  }
});

// Resource smoke deliberately permits a full model turn. Authenticated control
// gates still send no model request, but OAuth refresh/keychain recovery can
// legitimately take longer than an unauthenticated initialize; do not kill a
// healthy session while it is restoring credentials.
const timeout = setTimeout(
  () => child.kill('SIGKILL'),
  resourceSmoke || btwSmoke ? 150_000 : authenticated ? 60_000 : 20_000,
);
function request(method, params, timeoutMs = 8_000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
        else resolve(message.result);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function unwrapResult(value) {
  return value && typeof value === 'object' && 'result' in value ? value.result : value;
}

try {
  // Keep this aligned with the desktop ACP client. A configured/authenticated
  // GROK_HOME can load catalogs and credential state before initialize replies.
  await request('initialize', {
    protocolVersion: 1,
    _meta: { clientIdentifier: 'grok-desktop' },
    clientInfo: { name: 'gorkX-kernel-smoke', version: '0' },
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: clientFileWriteSmoke },
      terminal: true,
      meta: {
        'x.ai/hunkTracker': { mode: 'agent_only' },
        'x.ai/codeNavigation': { enabled: true },
      },
    },
  }, 30_000);
  console.log(`PASS: ACP initialize (${bin})${clientFileWriteSmoke ? ' with client fs write capability' : ''}${disableWebSearchSmoke ? ' with web research disabled' : ''}`);

  if (voiceControlsSmoke) {
    // Do not call voice/start on a real session: that would request macOS
    // microphone access and could stream audio. A guaranteed-missing session
    // still reaches the native route and is rejected at its session guard,
    // proving the desktop control plane without authentication or capture.
    const missingVoiceSessionId = `gorkx-voice-missing-${Date.now().toString(36)}`;
    for (const method of ['_x.ai/voice/start', '_x.ai/voice/stop', '_x.ai/voice/shutdown']) {
      try {
        await request(method, { sessionId: missingVoiceSessionId }, 15_000);
        throw new Error(`${method} unexpectedly accepted a missing session`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/unexpectedly accepted|method not found/i.test(message)) throw error;
        if (!/session not found|resource.*not found|not found/i.test(message)) {
          throw new Error(`${method} did not reach native voice session guard: ${message}`);
        }
      }
      console.log(`PASS: ACP ${method} (native route, no capture)`);
    }
  }

  if (desktopControlsSmoke) {
    const missingSessionId = `gorkx-desktop-missing-${Date.now().toString(36)}`;
    const probes = [
      ['_x.ai/interject', { sessionId: missingSessionId, text: 'gorkX desktop control probe' }],
      ['_x.ai/btw', { sessionId: missingSessionId, question: 'gorkX desktop side-question probe' }],
      ['_x.ai/memory/flush', { session_id: missingSessionId }],
      ['_x.ai/session/repair', { sessionId: missingSessionId, dryRun: true }],
      ['_x.ai/desktop/goal', { sessionId: missingSessionId, objective: 'gorkX desktop control probe' }],
      ['_x.ai/desktop/command', { sessionId: missingSessionId, command: 'context' }],
      ['_x.ai/desktop/workflow/launch', { sessionId: missingSessionId, name: 'deep-research', input: 'probe' }],
      ['_x.ai/desktop/workflow/manage', { sessionId: missingSessionId, runId: 'missing', op: 'pause' }],
      ['_x.ai/hunk-tracker/get-files', { sessionId: missingSessionId }],
      ['_x.ai/hunk-tracker/file-action', { sessionId: missingSessionId, path: 'missing', action: 'accept' }],
      ['_x.ai/code/status', { sessionId: missingSessionId, cwd: home }],
      ['_x.ai/code/find-definitions', { sessionId: missingSessionId, cwd: home, symbol: 'missing' }],
      ['_x.ai/code/find-references', { sessionId: missingSessionId, cwd: home, symbol: 'missing' }],
      ['_x.ai/git/info', { sessionId: missingSessionId }],
      ['_x.ai/git/discard', { sessionId: missingSessionId, paths: ['missing'], scope: 'both', includeUntracked: true }],
      ['_x.ai/git/stash', { sessionId: missingSessionId, includeUntracked: true }],
      ['_x.ai/git/commit', { sessionId: missingSessionId, message: 'gorkX route probe', push: false, sync: false }],
    ];
    for (const [method, params] of probes) {
      const routeWithoutSessionGuard = method.startsWith('_x.ai/git/')
        || method === '_x.ai/hunk-tracker/file-action'
        || method === '_x.ai/code/status';
      try {
        const result = await request(method, params, 15_000);
        if (method === '_x.ai/code/status') {
          const status = unwrapResult(result);
          if (status?.eligible !== false || status?.reason !== 'sessionRequired') {
            throw new Error(`${method} returned an unexpected missing-session status: ${JSON.stringify(status)}`);
          }
        }
        if (routeWithoutSessionGuard) {
          console.log(`PASS: ACP ${method} (native route, no model request)`);
          continue;
        }
        throw new Error(`${method} unexpectedly accepted a missing session`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/method not found/i.test(message)) throw error;
        if (routeWithoutSessionGuard) {
          console.log(`PASS: ACP ${method} (native route, no model request)`);
          continue;
        }
        if (/unexpectedly accepted/i.test(message)) throw error;
        if (!/session.*not found|unknown session|resource.*not found|invalid params|not found/i.test(message)) {
          throw new Error(`${method} did not reach its native session guard: ${message}`);
        }
      }
      console.log(`PASS: ACP ${method} (native route, no model request)`);
    }
  }

  if (cloudControlsSmoke) {
    try {
      const result = unwrapResult(await request('_x.ai/cloud/env/list', {}, 15_000));
      if (!result || !Array.isArray(result.environments)) {
        throw new Error(`cloud environment list returned an unexpected shape: ${JSON.stringify(result)}`);
      }
      console.log(`PASS: ACP _x.ai/cloud/env/list (native route, ${result.environments.length} environments, no mutation)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/method not found/i.test(message)) throw error;
      if (!/authentication required|run .*login|not authenticated|auth/i.test(message)) {
        throw new Error(`cloud environment route did not reach its native auth guard: ${message}`);
      }
      console.log('PASS: ACP _x.ai/cloud/env/list (native route and auth guard, no mutation)');
    }
  }

  if (billingControlsSmoke) {
    for (const method of ['_x.ai/billing', '_x.ai/auto-topup-rule']) {
      try {
        const result = unwrapResult(await request(method, {}, 15_000));
        if (!result || typeof result !== 'object') throw new Error(`${method} returned an unexpected shape`);
        console.log(`PASS: ACP ${method} (native read route, no mutation)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/method not found/i.test(message)) throw error;
        if (!/authentication required|run .*login|not authenticated|auth/i.test(message)) {
          throw new Error(`${method} did not reach its native auth guard: ${message}`);
        }
        console.log(`PASS: ACP ${method} (native read route and auth guard, no mutation)`);
      }
    }
  }

  if (modelReloadSmoke) {
    let method = '_x.ai/internal/reload_models';
    try {
      const result = unwrapResult(await request(method, {}, 15_000));
      if (result != null && typeof result !== 'object') {
        throw new Error(`${method} returned an unexpected shape`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/method not found/i.test(message)) {
        if (!/authentication required|run .*login|not authenticated|auth|session/i.test(message)) {
          throw new Error(`${method} did not reach the native catalog reload route: ${message}`);
        }
        console.log(`PASS: ACP ${method} (native route and guard, no model request)`);
        method = '';
      }
      if (method) {
        method = 'x.ai/internal/reload_models';
        try {
          const result = unwrapResult(await request(method, {}, 15_000));
          if (result != null && typeof result !== 'object') {
            throw new Error(`${method} returned an unexpected shape`);
          }
        } catch (legacyError) {
          const legacyMessage = legacyError instanceof Error ? legacyError.message : String(legacyError);
          if (!/authentication required|run .*login|not authenticated|auth|session/i.test(legacyMessage)) {
            throw new Error(`${method} did not reach the native catalog reload route: ${legacyMessage}`);
          }
        }
      }
    }
    console.log(`PASS: ACP model catalog reload (${method || '_x.ai/internal/reload_models'} route/guard, no model request)`);
  }

  if (sessionSearchSmoke) {
    const result = unwrapResult(await request('_x.ai/session/search', {
      query: 'gorkX ACP smoke',
      cwd: home,
      limit: 5,
      offset: 0,
      includeContent: true,
    }, 15_000));
    if (!result || !Array.isArray(result.results)) {
      throw new Error(`session search returned an unexpected shape: ${JSON.stringify(result)}`);
    }
    console.log(`PASS: ACP _x.ai/session/search (${result.results.length} results, no model request)`);
  }

  if (promptHistorySmoke) {
    const result = unwrapResult(await request('_x.ai/prompt_history', {
      cwd: cwd,
    }, 15_000));
    if (!result || !Array.isArray(result.prompts) || result.prompts.some((item) => typeof item !== 'string')) {
      throw new Error(`prompt history returned an unexpected shape: ${JSON.stringify(result)}`);
    }
    console.log(`PASS: ACP _x.ai/prompt_history (${result.prompts.length} prompts, no model request)`);
  }

  if (promptSuggestionSmoke) {
    const generation = 1;
    const result = unwrapResult(await request('_x.ai/suggestPrompt', {
      sessionId: `gorkx-missing-suggestion-${Date.now().toString(36)}`,
      generation,
    }, 15_000));
    if (!result || result.generation !== generation || result.suggestion !== null) {
      throw new Error(`prompt suggestion returned an unexpected shape: ${JSON.stringify(result)}`);
    }
    console.log('PASS: ACP _x.ai/suggestPrompt (missing-session guard, no model request)');
  }

  if (sessionBundleSmoke) {
    const missingSessionId = '00000000-0000-4000-8000-000000000001';
    const updates = unwrapResult(await request('_x.ai/session/updates', {
      sessionId: missingSessionId,
      cwd: home,
      offset: 0,
      limit: 1,
    }, 15_000));
    if (!updates || !Array.isArray(updates.updates) ||
        typeof updates.totalCount !== 'number' || typeof updates.hasMore !== 'boolean') {
      throw new Error(`session updates returned an unexpected shape: ${JSON.stringify(updates)}`);
    }
    console.log('PASS: ACP _x.ai/session/updates (bounded empty-session guard, no mutation)');

    try {
      await request('_x.ai/session/state', {
        sessionId: missingSessionId,
        cwd: home,
      }, 15_000);
      throw new Error('_x.ai/session/state unexpectedly accepted a missing session');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unexpectedly accepted|method not found/i.test(message)) throw error;
      if (!/session not found|resource.*not found|not found|invalid params/i.test(message)) {
        throw new Error(`session state did not reach its native missing-session guard: ${message}`);
      }
    }
    console.log('PASS: ACP _x.ai/session/state (missing-session guard, no mutation)');

    try {
      await request('_x.ai/session/import', {
        sessionId: missingSessionId,
        cwd: home,
        state: {},
        updates: [],
      }, 15_000);
      throw new Error('_x.ai/session/import unexpectedly accepted an invalid package');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unexpectedly accepted|method not found/i.test(message)) throw error;
      if (!/summary column|invalid params|invalid.*summary/i.test(message)) {
        throw new Error(`session import did not reject an invalid package at its native guard: ${message}`);
      }
    }
    console.log('PASS: ACP _x.ai/session/import (invalid-package guard, no mutation)');
  }

  if (!authenticated) {
    console.log('SKIP: authenticated session/extensions gate (pass --authenticated with isolated test paths)');
    process.exitCode = 0;
  } else {
    // OIDC refresh can legitimately exceed the generic short ACP request
    // timeout on a cold network connection; match the desktop client's gate.
    await request('authenticate', { methodId: 'cached_token' }, 30_000);
    console.log('PASS: ACP authenticate(cached_token)');

    const agentProfile = agentProfileName || (agentProfileSmoke
      ? {
          name: 'gorkx-acp-profile-smoke',
          description: 'Isolated gorkX ACP profile contract smoke test.',
          promptMode: 'extend',
          permissionMode: 'default',
          promptBody: 'Keep this isolated protocol validation concise.',
        }
      : undefined);
    const created = await request('session/new', {
      cwd,
      mcpServers: [],
      ...(agentProfile ? { _meta: { agentProfile } } : {}),
    });
    const sessionId = created?.sessionId;
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new Error(`session/new returned no sessionId: ${JSON.stringify(created)}`);
    }
    console.log('PASS: ACP session/new');
    if (agentProfileSmoke) {
      console.log('PASS: ACP session/new _meta.agentProfile (portable profile)');
    }
    if (agentProfileName) {
      console.log(`PASS: ACP session/new _meta.agentProfile (${agentProfileName})`);
    }

    if (customModelSmoke) {
      if (!JSON.stringify(created).includes(customModelId)) {
        throw new Error('session/new did not advertise the configured custom model');
      }
      await request('session/set_model', { sessionId, modelId: customModelId });
      console.log(`PASS: ACP session/set_model(${customModelId})`);
    }

    const loaded = await request('session/load', { sessionId, cwd, mcpServers: [] });
    const loadedId = loaded?.sessionId ?? loaded?._meta?.sessionId;
    if (loadedId !== sessionId) {
      throw new Error(`session/load did not restore ${sessionId}: ${JSON.stringify(loaded)}`);
    }
    console.log('PASS: ACP session/load');

    if (hunkControlsSmoke) {
      const readHunkFiles = async (method) => {
        const payload = unwrapResult(await request(method, { sessionId }, 15_000));
        if (!payload || !Array.isArray(payload.files)) {
          throw new Error(`${method} returned invalid payload: ${JSON.stringify(payload)}`);
        }
        return payload;
      };
      let files;
      try {
        files = await readHunkFiles('_x.ai/hunk-tracker/get-files');
      } catch (error) {
        if (!/method not found/i.test(error instanceof Error ? error.message : String(error))) throw error;
        files = await readHunkFiles('x.ai/hunk-tracker/get-files');
      }
      console.log(`PASS: ACP hunk-tracker/get-files (agent ledger, ${files.files.length} files; no mutation)`);
    }

    // A real prompt must remain in the ordinary conversation mode. On 0.2.112
    // switching a fresh session to Plan before the first prompt can close the
    // ACP actor without returning the later prompt result. Keep Plan-mode
    // coverage for control-plane-only gates, where no inference is expected.
    if (!resourceSmoke && !btwSmoke) {
      await request('session/set_mode', { sessionId, modeId: 'plan' });
      console.log('PASS: ACP session/set_mode(plan)');
    }

    if (btwSmoke) {
      // `/btw` is deliberately a separate side turn. Do not accept an empty
      // acknowledgement: the desktop can render it only after the kernel
      // returns the answer field from the extension response.
      const result = unwrapResult(await request('x.ai/btw', {
        sessionId,
        question: 'Reply with exactly: GORKX_BTW_OK',
      }, 120_000));
      if (result?.answer !== 'GORKX_BTW_OK') {
        throw new Error(`x.ai/btw returned unexpected side answer: ${JSON.stringify(result)}`);
      }
      console.log('PASS: ACP x.ai/btw (isolated side answer)');
    }

    if (sessionInfoSmoke) {
      // This is a local session snapshot, not a model turn. Validate the
      // stable session-level fields plus the structured context payload the
      // desktop client presents as Task Info.
      let method = 'x.ai/session/info';
      let info;
      try {
        info = unwrapResult(await request(method, { sessionId }, 15_000));
      } catch (error) {
        if (!/method not found/i.test(error instanceof Error ? error.message : String(error))) throw error;
        method = '_x.ai/session/info';
        info = unwrapResult(await request(method, { sessionId }, 15_000));
      }
      if (!info || info.sessionId !== sessionId || typeof info.cwd !== 'string' || !info.context || typeof info.context !== 'object') {
        throw new Error(`${method} returned invalid payload: ${JSON.stringify(info)}`);
      }
      const sources = new Set(['oauth', 'api_key', 'external', 'not_authenticated']);
      const destinations = new Set(['account', 'models']);
      if (!sources.has(info.authSource) || !destinations.has(info.authManagement)) {
        throw new Error(`${method} returned unsafe or incomplete auth snapshot: ${JSON.stringify(info)}`);
      }
      console.log(`PASS: ACP ${method} (session, context, and token-free auth snapshot)`);
    }

    if (sessionControlsSmoke) {
      // Rename a disposable session through the same native endpoint used by
      // the sidebar action. This writes only inside the explicit test home.
      const renameTitle = `gorkx-acp-rename-${Date.now().toString(36)}`;
      const verifyRename = async (method) => {
        const renamed = unwrapResult(await request(method, { sessionId, title: renameTitle, cwd }, 15_000));
        if (renamed?.success !== true) {
          throw new Error(`${method} returned invalid rename result: ${JSON.stringify(renamed)}`);
        }
        console.log(`PASS: ACP ${method} (durable session title)`);
      };
      try {
        await verifyRename('x.ai/session/rename');
      } catch (error) {
        if (!/method not found/i.test(error instanceof Error ? error.message : String(error))) throw error;
        await verifyRename('_x.ai/session/rename');
        console.log('NOTE: session rename is available only through the legacy underscored ACP route');
      }

      // Forking copies only kernel-owned session data into the explicitly
      // disposable test home. It sends no prompt and leaves the parent active.
      // ACP extensions are not baseline methods; record an unavailable method
      // as an explicit capability gap rather than silently passing it.
      const verifyFork = async (method) => {
        const forked = unwrapResult(await request(method, {
          sourceSessionId: sessionId,
          sourceCwd: cwd,
          newCwd: cwd,
        }, 30_000));
        const forkedSessionId = typeof forked?.newSessionId === 'string' ? forked.newSessionId : '';
        if (!forkedSessionId || forkedSessionId === sessionId || forked.parentSessionId !== sessionId) {
          throw new Error(`x.ai/session/fork returned invalid payload: ${JSON.stringify(forked)}`);
        }
        const forkedLoaded = await request('session/load', { sessionId: forkedSessionId, cwd, mcpServers: [] });
        const loadedForkedId = forkedLoaded?.sessionId ?? forkedLoaded?._meta?.sessionId;
        if (loadedForkedId !== forkedSessionId) {
          throw new Error(`forked session could not be loaded: ${JSON.stringify(forkedLoaded)}`);
        }
        const sourceLoaded = await request('session/load', { sessionId, cwd, mcpServers: [] });
        const loadedSourceId = sourceLoaded?.sessionId ?? sourceLoaded?._meta?.sessionId;
        if (loadedSourceId !== sessionId) {
          throw new Error(`source session changed after fork: ${JSON.stringify(sourceLoaded)}`);
        }
        console.log(`PASS: ACP ${method} (durable child and unchanged parent)`);
      };
      try {
        await verifyFork('x.ai/session/fork');
      } catch (error) {
        if (/method not found/i.test(error instanceof Error ? error.message : String(error))) {
          try {
            await verifyFork('_x.ai/session/fork');
            console.log('NOTE: session fork is available only through the legacy underscored ACP route');
          } catch (legacyError) {
            if (/method not found/i.test(legacyError instanceof Error ? legacyError.message : String(legacyError))) {
              console.log('SKIP: ACP session/fork (kernel exposes neither x.ai nor _x.ai route)');
            } else {
              throw legacyError;
            }
          }
        } else {
          throw error;
        }
      }

      // History repair is a non-model, dry-run inspection. A clean new
      // session should return a typed no-op report, proving the route exists
      // before the desktop offers the destructive confirmed repair action.
      const repair = unwrapResult(await request('_x.ai/session/repair', {
        sessionId,
        dryRun: true,
      }, 30_000));
      if (!repair || typeof repair.repaired !== 'boolean' || repair.dryRun !== true) {
        throw new Error(`_x.ai/session/repair returned invalid dry-run payload: ${JSON.stringify(repair)}`);
      }
      console.log('PASS: ACP _x.ai/session/repair (dry-run, no model request)');

      // A new session has no prompt checkpoint. A well-typed empty response
      // proves the native list endpoint is available without inventing a
      // destructive execute case or billing a model request.
      const verifyRewindPoints = async (method) => {
        const rewindPoints = unwrapResult(await request(method, { sessionId }, 15_000));
        const points = rewindPoints?.rewindPoints ?? rewindPoints?.rewind_points;
        if (!Array.isArray(points)) {
          throw new Error(`x.ai/rewind/points returned invalid payload: ${JSON.stringify(rewindPoints)}`);
        }
        console.log(`PASS: ACP ${method} (native empty checkpoint list)`);
      };
      try {
        await verifyRewindPoints('x.ai/rewind/points');
      } catch (error) {
        if (/method not found/i.test(error instanceof Error ? error.message : String(error))) {
          try {
            await verifyRewindPoints('_x.ai/rewind/points');
            console.log('NOTE: rewind is available only through the legacy underscored ACP route');
          } catch (legacyError) {
            if (/method not found/i.test(legacyError instanceof Error ? legacyError.message : String(legacyError))) {
              console.log('SKIP: ACP rewind/points (kernel exposes neither x.ai nor _x.ai route)');
            } else {
              throw legacyError;
            }
          }
        } else {
          throw error;
        }
      }
    }

    if (runtimeControlsSmoke) {
      // Check the exact underscored routes the desktop client calls. A source
      // implementation under another spelling is not enough to call the UI
      // feature real.
      const rosterRaw = unwrapResult(await request('_x.ai/sessions/list', { cwd }, 15_000));
      const roster = rosterRaw?.sessions;
      if (!Array.isArray(roster) || !roster.some((entry) => entry?.sessionId === sessionId)) {
        throw new Error(`_x.ai/sessions/list did not include the live session: ${JSON.stringify(rosterRaw)}`);
      }
      console.log('PASS: ACP _x.ai/sessions/list (contains live session)');

      const reloadRaw = unwrapResult(await request('_x.ai/internal/reload_models', {}, 15_000));
      if (!reloadRaw || typeof reloadRaw !== 'object') {
        throw new Error(`_x.ai/internal/reload_models returned invalid payload: ${JSON.stringify(reloadRaw)}`);
      }
      console.log('PASS: ACP _x.ai/internal/reload_models');

      const disposable = await request('session/new', { cwd, mcpServers: [] });
      const disposableSessionId = disposable?.sessionId;
      if (typeof disposableSessionId !== 'string' || !disposableSessionId) {
        throw new Error(`session/new returned no disposable sessionId: ${JSON.stringify(disposable)}`);
      }
      await request('_x.ai/session/delete', { sessionId: disposableSessionId }, 15_000);
      try {
        await request('session/load', { sessionId: disposableSessionId, cwd, mcpServers: [] }, 15_000);
        throw new Error('_x.ai/session/delete did not make the disposable session unavailable');
      } catch (error) {
        if (/did not make the disposable session unavailable/.test(error instanceof Error ? error.message : String(error))) {
          throw error;
        }
      }
      console.log('PASS: ACP _x.ai/session/delete (deleted session cannot load)');
    }

    if (subagentControlsSmoke) {
      const missingId = `gorkx-acp-missing-${Date.now().toString(36)}`;
      const probe = async (method, params) => {
        try {
          return { method, value: unwrapResult(await request(method, params, 15_000)) };
        } catch (error) {
          if (/method not found/i.test(error instanceof Error ? error.message : String(error))) return null;
          // A missing subagent is the expected business-level response. It is
          // evidence that the route reached the control plane, not a failure.
          return { method, value: null };
        }
      };
      const preferRuntimeRoute = async (suffix, params) => {
        const standard = await probe(`x.ai/${suffix}`, params);
        return standard ?? probe(`_x.ai/${suffix}`, params);
      };
      const listed = await preferRuntimeRoute('subagent/list_running', { sessionId });
      if (!listed || !Array.isArray(listed.value?.subagents ?? listed.value?.result?.subagents)) {
        throw new Error('subagent/list_running is not exposed by either ACP route');
      }
      console.log(`PASS: ACP ${listed.method} (subagent list_running)`);

      const snapshot = await preferRuntimeRoute('subagent/get', { subagentId: missingId, block: false });
      if (!snapshot) throw new Error('subagent/get is not exposed by either ACP route');
      console.log(`PASS: ACP ${snapshot.method} (subagent get route)`);

      const cancelled = await preferRuntimeRoute('subagent/cancel', { subagentId: missingId });
      if (!cancelled) throw new Error('subagent/cancel is not exposed by either ACP route');
      console.log(`PASS: ACP ${cancelled.method} (subagent cancel route)`);

      // Route-only probe: the parent session is intentionally missing, so the
      // kernel rejects before queueing any child or making a model request.
      const spawned = await preferRuntimeRoute('subagent/spawn', {
        sessionId: `gorkx-acp-missing-parent-${Date.now().toString(36)}`,
        prompt: 'route probe only',
        description: 'route probe',
        subagentType: 'explore',
        capabilityMode: 'read-only',
        isolation: 'none',
      });
      if (!spawned) throw new Error('subagent/spawn is not exposed by either ACP route');
      console.log(`PASS: ACP ${spawned.method} (subagent spawn route; rejected missing parent as expected)`);
    }

    if (hooksControlsSmoke) {
      const reloaded = unwrapResult(await request('_x.ai/hooks/action', {
        sessionId,
        action: { type: 'reload' },
      }, 15_000));
      if (!reloaded || (reloaded.status !== 'success' && !Array.isArray(reloaded.hooks))) {
        throw new Error(`_x.ai/hooks/action(reload) returned invalid payload: ${JSON.stringify(reloaded)}`);
      }
      console.log('PASS: ACP _x.ai/hooks/action(reload)');
    }

    if (resourceSmoke) {
      // Deliberately opt-in: this makes a real model request. The caller must
      // supply a disposable CWD, and the fixture is deleted in finally.
      resourceFixture = join(cwd, `.gorkx-resource-smoke-${Date.now().toString(36)}.txt`);
      await writeFile(resourceFixture, 'gorkX ACP resource-link smoke fixture\n', 'utf8');
      const size = (await stat(resourceFixture)).size;
      await request('session/prompt', {
        sessionId,
        prompt: [
          { type: 'text', text: 'Read the attached local text resource. Reply with exactly: RESOURCE_LINK_OK' },
          {
            type: 'resource_link',
            name: 'gorkx-resource-smoke.txt',
            uri: pathToFileURL(resourceFixture).href,
            mimeType: 'text/plain',
            size,
          },
        ],
      }, 240_000);
      console.log('PASS: ACP session/prompt resource_link');

      if (rewindExecuteSmoke) {
        // Rewinding a session to its only prompt is correctly rejected by the
        // kernel. Add a second minimal turn, then restore to the first saved
        // point so this covers a meaningful, non-destructive history change.
        await request('session/prompt', {
          sessionId,
          prompt: [{ type: 'text', text: 'Reply with exactly: REWIND_SECOND_TURN_OK' }],
        }, 240_000);
        console.log('PASS: ACP session/prompt rewind second turn');
        // `session/prompt` acknowledges dispatch before the actor has written
        // its history/checkpoint. Wait for the bounded actor flush before
        // testing a destructive operation against that persisted history.
        await delay(8_000);
        const rewindPoints = unwrapResult(await request('_x.ai/rewind/points', { sessionId }, 15_000));
        const points = rewindPoints?.rewindPoints ?? rewindPoints?.rewind_points;
        const target = Array.isArray(points) && points.length >= 2 ? points[0] : null;
        const targetPromptIndex = typeof target?.promptIndex === 'number'
          ? target.promptIndex
          : typeof target?.prompt_index === 'number' ? target.prompt_index : null;
        if (targetPromptIndex === null) {
          throw new Error(`_x.ai/rewind/points did not produce two checkpoints after prompts: ${JSON.stringify(rewindPoints)}`);
        }
        // Grok Build deliberately uses `force: false` as a non-mutating
        // preview. A successful preview is therefore `success: false` with
        // no error or conflicts; it must be followed by an explicit commit.
        const preview = unwrapResult(await request('_x.ai/rewind/execute', {
          sessionId,
          targetPromptIndex,
          mode: 'conversation_only',
          force: false,
        }, 30_000));
        if (preview?.success !== false || preview?.mode !== 'conversation_only' || preview?.error || (preview?.conflicts?.length ?? 0) !== 0) {
          throw new Error(`_x.ai/rewind/execute preview was not safe: ${JSON.stringify(preview)}`);
        }
        console.log('PASS: ACP _x.ai/rewind/execute preview (conversation_only, force=false)');
        const rewind = unwrapResult(await request('_x.ai/rewind/execute', {
          sessionId,
          targetPromptIndex,
          mode: 'conversation_only',
          force: true,
        }, 30_000));
        if (rewind?.success !== true || rewind?.mode !== 'conversation_only') {
          throw new Error(`_x.ai/rewind/execute commit did not succeed: ${JSON.stringify(rewind)}`);
        }
        const rewoundLoaded = await request('session/load', { sessionId, cwd, mcpServers: [] }, 15_000);
        const rewoundId = rewoundLoaded?.sessionId ?? rewoundLoaded?._meta?.sessionId;
        if (rewoundId !== sessionId) {
          throw new Error(`rewound session could not be loaded: ${JSON.stringify(rewoundLoaded)}`);
        }
        console.log('PASS: ACP _x.ai/rewind/execute commit (conversation_only, force=true, reloadable)');
      }
    }

    try {
      let hooks;
      let hooksMethod = 'x.ai/hooks/list';
      try {
        hooks = await request(hooksMethod, { sessionId });
      } catch (error) {
        if (!/method not found/i.test(error instanceof Error ? error.message : String(error))) throw error;
        hooksMethod = '_x.ai/hooks/list';
        hooks = await request(hooksMethod, { sessionId });
      }
      const hooksSnapshot = hooks?.result ?? hooks;
      if (!hooksSnapshot || !Array.isArray(hooksSnapshot.hooks)) {
        throw new Error(`${hooksMethod} returned invalid payload: ${JSON.stringify(hooks)}`);
      }
      console.log(`PASS: ACP ${hooksMethod}`);
    } catch (error) {
      // Hooks are an optional Grok Build extension. A missing method is a
      // capability gap to report, not evidence that session/Plan regression
      // failed; other advertised ACP extensions still need their own gate.
      if (/method not found/i.test(error instanceof Error ? error.message : String(error))) {
        console.log('SKIP: ACP hooks/list (kernel does not expose either ACP route)');
      } else {
        throw error;
      }
    }

    const worktreeRaw = await request('_x.ai/git/worktree/list', {});
    const worktrees = Array.isArray(worktreeRaw?.result) ? worktreeRaw.result : worktreeRaw;
    if (!Array.isArray(worktrees)) {
      throw new Error(`_x.ai/git/worktree/list returned invalid payload: ${JSON.stringify(worktreeRaw)}`);
    }
    console.log('PASS: ACP _x.ai/git/worktree/list');

    try {
      let raw;
      let subagentListMethod = 'x.ai/subagent/list_running';
      try {
        raw = await request(subagentListMethod, { sessionId });
      } catch (error) {
        if (!/method not found/i.test(error instanceof Error ? error.message : String(error))) throw error;
        subagentListMethod = '_x.ai/subagent/list_running';
        raw = await request(subagentListMethod, { sessionId });
      }
      const subagents = Array.isArray(raw?.result?.subagents)
        ? raw.result.subagents
        : Array.isArray(raw?.subagents)
          ? raw.subagents
          : null;
      if (!subagents) {
        throw new Error(`${subagentListMethod} returned invalid payload: ${JSON.stringify(raw)}`);
      }
      console.log(`PASS: ACP ${subagentListMethod}`);
    } catch (error) {
      if (/method not found/i.test(error instanceof Error ? error.message : String(error))) {
        console.log('SKIP: ACP subagent/list_running (kernel does not expose either ACP route)');
      } else {
        throw error;
      }
    }

    if (worktreeSmoke) {
      const createdRaw = await request('_x.ai/git/worktree/create', {
        sessionId,
        sourcePath: cwd,
        name: `gorkx-acp-smoke-${Date.now().toString(36)}`,
      }, 60_000);
      const created = unwrapResult(createdRaw) || {};
      let worktreePath = typeof created.worktreePath === 'string' ? created.worktreePath : '';
      // Grok Build may return "creating" first; the authoritative list is
      // polled rather than treating an accepted request as a finished clone.
      for (let attempt = 0; !worktreePath && attempt < 12; attempt += 1) {
        await delay(1_000);
        const listed = unwrapResult(await request('_x.ai/git/worktree/list', {}, 15_000));
        if (Array.isArray(listed)) {
          const hit = listed.find((entry) => entry && typeof entry === 'object' &&
            (entry.sessionId === sessionId || entry.sourcePath === cwd || entry.sourceGitRoot === cwd));
          if (hit && typeof hit.worktreePath === 'string') worktreePath = hit.worktreePath;
        }
      }
      if (!worktreePath) {
        throw new Error(`worktree create did not produce a path: ${JSON.stringify(createdRaw)}`);
      }
      console.log(`PASS: ACP _x.ai/git/worktree/create (${worktreePath})`);
    }
  }
} catch (error) {
  console.error(
    `FAIL: ACP smoke: ${error instanceof Error ? error.message : String(error)}\n${safeEngineStderr(stderr)}`,
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  child.kill();
  if (resourceFixture) await rm(resourceFixture, { force: true });
  if (isolatedHome) await rm(home, { recursive: true, force: true });
}
