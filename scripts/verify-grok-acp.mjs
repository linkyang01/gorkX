#!/usr/bin/env node
// Protocol gate for a Grok Build binary. By default it intentionally requires
// no login and never touches the user's GROK_HOME or project directory.
// Pass --authenticated only with an explicit disposable GROK_HOME/CWD pair.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const [bin, ...options] = process.argv.slice(2);
if (!bin) {
  console.error('usage: node scripts/verify-grok-acp.mjs /path/to/grok [--authenticated]');
  process.exit(2);
}
const authenticated = options.includes('--authenticated');
if (options.some((option) => option !== '--authenticated')) {
  console.error(`unknown option: ${options.find((option) => option !== '--authenticated')}`);
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
const child = spawn(bin, ['agent', 'stdio'], {
  env: { ...process.env, GROK_HOME: home },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stderr = '';
let buffer = '';
let nextId = 1;
const pending = new Map();
child.stderr.on('data', (chunk) => { stderr += chunk; });
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

const timeout = setTimeout(() => child.kill('SIGKILL'), 20_000);
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

try {
  await request('initialize', {
    protocolVersion: 1,
    clientInfo: { name: 'gorkX-kernel-smoke', version: '0' },
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: false }, terminal: true },
  });
  console.log(`PASS: ACP initialize (${bin})`);

  if (!authenticated) {
    console.log('SKIP: authenticated session/extensions gate (pass --authenticated with isolated test paths)');
    process.exitCode = 0;
  } else {
    await request('authenticate', { methodId: 'cached_token' });
    console.log('PASS: ACP authenticate(cached_token)');

    const created = await request('session/new', { cwd, mcpServers: [] });
    const sessionId = created?.sessionId;
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new Error(`session/new returned no sessionId: ${JSON.stringify(created)}`);
    }
    console.log('PASS: ACP session/new');

    const loaded = await request('session/load', { sessionId, cwd, mcpServers: [] });
    const loadedId = loaded?.sessionId ?? loaded?._meta?.sessionId;
    if (loadedId !== sessionId) {
      throw new Error(`session/load did not restore ${sessionId}: ${JSON.stringify(loaded)}`);
    }
    console.log('PASS: ACP session/load');

    await request('session/set_mode', { sessionId, modeId: 'plan' });
    console.log('PASS: ACP session/set_mode(plan)');

    const hooks = await request('x.ai/hooks/list', { sessionId });
    if (!hooks || !Array.isArray(hooks.hooks)) {
      throw new Error(`x.ai/hooks/list returned invalid payload: ${JSON.stringify(hooks)}`);
    }
    console.log('PASS: ACP x.ai/hooks/list');

    const worktrees = await request('_x.ai/git/worktree/list', {});
    if (!Array.isArray(worktrees)) {
      throw new Error(`_x.ai/git/worktree/list returned invalid payload: ${JSON.stringify(worktrees)}`);
    }
    console.log('PASS: ACP _x.ai/git/worktree/list');
  }
} catch (error) {
  console.error(`FAIL: ACP smoke: ${error instanceof Error ? error.message : String(error)}\n${stderr}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  child.kill();
  if (isolatedHome) await rm(home, { recursive: true, force: true });
}
