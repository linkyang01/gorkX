#!/usr/bin/env node
// Protocol gate for a Grok Build binary. By default it intentionally requires
// no login and never touches the user's GROK_HOME or project directory.
// Pass --authenticated only with an explicit disposable GROK_HOME/CWD pair.
// --worktree additionally creates a worktree only in that disposable Git CWD.
// --resource sends one minimal model request with a temporary local attachment.
// --custom-model verifies a disposable [model.*] override can be selected;
// it never sends a prompt to that provider.
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const [bin, ...options] = process.argv.slice(2);
if (!bin) {
  console.error('usage: node scripts/verify-grok-acp.mjs /path/to/grok [--authenticated] [--worktree] [--resource] [--custom-model]');
  process.exit(2);
}
const authenticated = options.includes('--authenticated');
const worktreeSmoke = options.includes('--worktree');
const resourceSmoke = options.includes('--resource');
const customModelSmoke = options.includes('--custom-model');
if ((worktreeSmoke || resourceSmoke || customModelSmoke) && !authenticated) {
  console.error('--worktree, --resource and --custom-model require --authenticated with an explicit disposable CWD');
  process.exit(2);
}
if (options.some((option) => !['--authenticated', '--worktree', '--resource', '--custom-model'].includes(option))) {
  console.error(`unknown option: ${options.find((option) => !['--authenticated', '--worktree', '--resource', '--custom-model'].includes(option))}`);
  process.exit(2);
}

const isolatedHome = !authenticated;
const home = authenticated ? process.env.GORKX_ACP_TEST_HOME : await mkdtemp(join(tmpdir(), 'gorkx-acp-smoke-'));
const cwd = authenticated ? process.env.GORKX_ACP_TEST_CWD : home;
if (!home || !cwd) {
  console.error('--authenticated requires explicit GROKX_ACP_TEST_HOME and GROKX_ACP_TEST_CWD');
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
const child = spawn(bin, ['agent', 'stdio'], {
  env: { ...process.env, GROK_HOME: home },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stderr = '';
let buffer = '';
let nextId = 1;
const pending = new Map();
let resourceFixture = '';
child.stderr.on('data', (chunk) => { stderr += chunk; });

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

// Resource smoke deliberately permits a full model turn; all other protocol
// gates retain the short fail-fast process ceiling.
const timeout = setTimeout(() => child.kill('SIGKILL'), resourceSmoke ? 150_000 : 20_000);
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
    clientInfo: { name: 'gorkX-kernel-smoke', version: '0' },
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: false }, terminal: true },
  }, 30_000);
  console.log(`PASS: ACP initialize (${bin})`);

  if (!authenticated) {
    console.log('SKIP: authenticated session/extensions gate (pass --authenticated with isolated test paths)');
    process.exitCode = 0;
  } else {
    // OIDC refresh can legitimately exceed the generic short ACP request
    // timeout on a cold network connection; match the desktop client's gate.
    await request('authenticate', { methodId: 'cached_token' }, 30_000);
    console.log('PASS: ACP authenticate(cached_token)');

    const created = await request('session/new', { cwd, mcpServers: [] });
    const sessionId = created?.sessionId;
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new Error(`session/new returned no sessionId: ${JSON.stringify(created)}`);
    }
    console.log('PASS: ACP session/new');

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

    await request('session/set_mode', { sessionId, modeId: 'plan' });
    console.log('PASS: ACP session/set_mode(plan)');

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
      }, 120_000);
      console.log('PASS: ACP session/prompt resource_link');
    }

    try {
      const hooks = await request('x.ai/hooks/list', { sessionId });
      if (!hooks || !Array.isArray(hooks.hooks)) {
        throw new Error(`x.ai/hooks/list returned invalid payload: ${JSON.stringify(hooks)}`);
      }
      console.log('PASS: ACP x.ai/hooks/list');
    } catch (error) {
      // Hooks are an optional Grok Build extension. A missing method is a
      // capability gap to report, not evidence that session/Plan regression
      // failed; other advertised ACP extensions still need their own gate.
      if (/method not found/i.test(error instanceof Error ? error.message : String(error))) {
        console.log('SKIP: ACP x.ai/hooks/list (kernel does not expose Hooks API)');
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
      const raw = await request('x.ai/subagent/list_running', { sessionId });
      const subagents = Array.isArray(raw?.result?.subagents)
        ? raw.result.subagents
        : Array.isArray(raw?.subagents)
          ? raw.subagents
          : null;
      if (!subagents) {
        throw new Error(`x.ai/subagent/list_running returned invalid payload: ${JSON.stringify(raw)}`);
      }
      console.log('PASS: ACP x.ai/subagent/list_running');
    } catch (error) {
      if (/method not found/i.test(error instanceof Error ? error.message : String(error))) {
        console.log('SKIP: ACP x.ai/subagent/list_running (kernel does not expose subagent recovery API)');
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
