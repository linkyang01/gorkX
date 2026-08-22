#!/usr/bin/env node

/**
 * Real Grok Build SessionStart Hook acceptance.
 *
 * Safety contract:
 * - requires an explicitly supplied disposable GROK_HOME;
 * - creates a fresh Git project under the OS temp directory;
 * - writes one fixed SessionStart command definition, never a user command;
 * - proves the untrusted project does not create a marker;
 * - calls the native trust and reload actions;
 * - creates a second real ACP session and waits for the marker that the
 *   kernel-run Hook creates; this script never creates the marker itself;
 * - removes only its own temporary project and revokes the temporary trust.
 */

import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [bin, ...options] = process.argv.slice(2);
const usage = 'usage: node scripts/verify-grok-hook.mjs /path/to/grok --authenticated [--no-prompt]';
if (!bin) {
  console.error(usage);
  process.exit(2);
}

const authenticated = options.includes('--authenticated');
const noPrompt = options.includes('--no-prompt');
const binPath = resolve(bin);
const knownOptions = new Set(['--authenticated', '--no-prompt']);
const unknown = options.find((option) => !knownOptions.has(option));
if (unknown) {
  console.error(`unknown option: ${unknown}\n${usage}`);
  process.exit(2);
}
if (!authenticated) {
  console.error('FAIL: real Hook execution requires --authenticated and an explicit disposable auth directory');
  process.exit(2);
}

const authHome = process.env.GORKX_HOOK_TEST_AUTH_DIR || process.env.GORKX_ACP_TEST_AUTH_DIR || '';
const userHome = process.env.HOME || '';
let resolvedAuthHome = resolve(authHome);
if (!authHome) {
  console.error('FAIL: set GORKX_HOOK_TEST_AUTH_DIR to a disposable copy of the App login directory');
  process.exit(2);
}
try {
  // Resolve symlink aliases before the protected-home check, so a disposable
  // path cannot bypass the refusal by pointing back into the user's account.
  resolvedAuthHome = await realpath(authHome);
} catch {
  // Let the engine produce the bounded missing-home failure below.
}
if (userHome) {
  const protectedHomes = [
    resolve(userHome, '.grok'),
    resolve(userHome, 'Library/Application Support/gorkX/grok-home'),
  ];
  if (protectedHomes.includes(resolvedAuthHome)) {
    console.error('FAIL: refusing to run Hook acceptance against a standard user GROK_HOME; use a disposable copy');
    process.exit(2);
  }
}

const project = await mkdtemp(join(tmpdir(), 'gorkx-hook-verify-'));
let child;
let timeout;
let stderr = '';
let buffer = '';
let nextId = 1;
const pending = new Map();
let controlSessionId = '';
let trusted = false;
let processExited = false;

function safeEngineStderr(raw) {
  return raw
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .split(/\r?\n/)
    .map((line) => /token|api[_-]?key|secret|password|authorization|rt_prefix/i.test(line)
      ? '[engine diagnostic redacted: credential-related detail omitted]'
      : line)
    .join('\n');
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function rejectPending(error) {
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
}

function request(method, params, timeoutMs = 15_000) {
  const id = nextId++;
  return new Promise((resolveRequest, rejectRequest) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectRequest(new Error(`${method} timed out`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (message) => {
        clearTimeout(timer);
        if (message.error) rejectRequest(new Error(message.error.message || JSON.stringify(message.error)));
        else resolveRequest(message.result);
      },
      reject: (error) => {
        clearTimeout(timer);
        rejectRequest(error);
      },
    });
    send({ jsonrpc: '2.0', id, method, params });
  });
}

function unwrap(value) {
  return value && typeof value === 'object' && 'result' in value ? value.result : value;
}

function sessionIdOf(value) {
  return value?.sessionId || value?._meta?.sessionId || value?.result?.sessionId || value?.result?._meta?.sessionId || '';
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function delay(ms) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function hooksList(sessionId) {
  let method = '_x.ai/hooks/list';
  try {
    return unwrap(await request(method, { sessionId }));
  } catch (error) {
    if (!/method not found/i.test(error instanceof Error ? error.message : String(error))) throw error;
    method = 'x.ai/hooks/list';
    return unwrap(await request(method, { sessionId }));
  }
}

async function hooksAction(sessionId, type) {
  const raw = unwrap(await request('_x.ai/hooks/action', {
    sessionId,
    action: { type },
  }));
  const status = String(raw?.status || '').toLowerCase();
  assertCondition(status === 'success', `Hook action ${type} was not accepted: ${JSON.stringify(raw)}`);
  return raw;
}

async function readMarker(markerPath, token) {
  try {
    const info = await stat(markerPath);
    if (!info.isFile()) throw new Error('verification marker is not a regular file');
    if (info.size > 512) throw new Error('verification marker is unexpectedly large');
    const content = await readFile(markerPath, 'utf8');
    return content === `${token}\n` ? 'match' : 'mismatch';
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing';
    throw error;
  }
}

async function waitForMarker(markerPath, token, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await readMarker(markerPath, token);
    if (status === 'match') return status;
    if (status === 'mismatch') throw new Error('Hook verification marker mismatch');
    await delay(400);
  }
  return readMarker(markerPath, token);
}

try {
  execFileSync('git', ['init', '--quiet'], { cwd: project, stdio: 'ignore' });
  const markerToken = `gorkx-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const markerRelativePath = `.grok/gorkx-hook-verification/${markerToken}.marker`;
  const markerPath = join(project, markerRelativePath);
  const markerDirectory = markerPath.slice(0, markerPath.lastIndexOf('/'));
  const script = [
    'set -eu',
    'umask 077',
    `/bin/mkdir -p ${shellQuote(markerDirectory)}`,
    `/usr/bin/printf '%s\\n' ${shellQuote(markerToken)} > ${shellQuote(markerPath)}`,
  ].join('; ');
  const hookDefinition = {
    hooks: {
      SessionStart: [{
        hooks: [{
          type: 'command',
          command: `/bin/sh -c ${shellQuote(script)}`,
          timeout: 5,
        }],
      }],
    },
  };
  await mkdir(join(project, '.grok/hooks'), { recursive: true, mode: 0o700 });
  const hookFile = join(project, '.grok/hooks/gorkx-session-start-verification.json');
  await writeFile(hookFile, `${JSON.stringify(hookDefinition, null, 2)}\n`, { flag: 'wx' });

  child = spawn(binPath, ['agent', '--no-leader', 'stdio'], {
    cwd: project,
    env: { ...process.env, GROK_HOME: resolvedAuthHome },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', (error) => {
    processExited = true;
    rejectPending(error);
  });
  child.on('exit', (code, signal) => {
    processExited = true;
    rejectPending(new Error(`Grok ACP process exited before the request completed (code=${code ?? 'none'}, signal=${signal ?? 'none'})`));
  });
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    while (true) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) break;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }

      // The Hook acceptance prompt is tool-free. Keep the reverse channel
      // bounded anyway, so a kernel diagnostic cannot make this probe hang.
      if (message.method && message.id !== undefined && message.id !== null) {
        send({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: `Method not found in bounded Hook probe: ${message.method}` },
        });
        continue;
      }
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter.resolve(message);
      }
    }
  });

  timeout = setTimeout(() => child.kill('SIGKILL'), noPrompt ? 90_000 : 180_000);
  await request('initialize', {
    protocolVersion: 1,
    _meta: {
      clientType: 'grok-shell',
      clientVersion: '0',
      startupHints: { nonInteractive: true, skipGitStatus: true, skipProjectLayout: true },
    },
    clientInfo: { name: 'gorkX-real-hook-acceptance', version: '0' },
    clientCapabilities: {
      fs: { readTextFile: false, writeTextFile: false },
      terminal: true,
      auth: { terminal: false },
    },
  }, 30_000);
  await request('authenticate', { methodId: 'cached_token', _meta: { headless: true } }, 30_000);
  const control = await request('session/new', { cwd: project, mcpServers: [] }, 30_000);
  controlSessionId = sessionIdOf(control);
  assertCondition(controlSessionId, `session/new did not return a control session: ${JSON.stringify(control)}`);
  console.log('PASS: real ACP control session created');

  const initialHooks = await hooksList(controlSessionId);
  assertCondition(initialHooks && initialHooks.projectTrusted === false, `project unexpectedly trusted before explicit action: ${JSON.stringify(initialHooks)}`);
  assertCondition(await readMarker(markerPath, markerToken) === 'missing', 'marker existed before the trusted task');
  console.log('PASS: untrusted project did not execute the SessionStart Hook');

  await hooksAction(controlSessionId, 'trust');
  trusted = true;
  const trustedHooks = await hooksList(controlSessionId);
  assertCondition(trustedHooks?.projectTrusted === true, `trust was not confirmed by the kernel: ${JSON.stringify(trustedHooks)}`);
  console.log('PASS: native hooks/action trust confirmed');

  await hooksAction(controlSessionId, 'reload');
  const reloadedHooks = await hooksList(controlSessionId);
  assertCondition(reloadedHooks?.projectTrusted === true, 'project trust disappeared after explicit reload');
  assertCondition(
    Array.isArray(reloadedHooks.hooks)
      && reloadedHooks.hooks.some((hook) => /session.?start/i.test(String(hook.event || ''))),
    `restricted SessionStart Hook was not loaded after reload: ${JSON.stringify(reloadedHooks)}`,
  );
  console.log('PASS: native hooks/action reload loaded the restricted SessionStart Hook');

  const real = await request('session/new', { cwd: project, mcpServers: [] }, 30_000);
  const realSessionId = sessionIdOf(real);
  assertCondition(realSessionId, `real session/new did not return a session: ${JSON.stringify(real)}`);
  const markerStatus = await waitForMarker(markerPath, markerToken);
  assertCondition(markerStatus === 'match', `real SessionStart Hook marker was not confirmed: ${markerStatus}`);
  console.log('PASS: Grok Build executed SessionStart Hook and created the one-time marker');

  if (!noPrompt) {
    await request('session/prompt', {
      sessionId: realSessionId,
      messageId: randomUUID(),
      prompt: [{
        type: 'text',
        text: 'Hook verification task. Reply exactly HOOK_VERIFICATION_TASK_OK. Do not call tools, modify files, or inspect project files.',
      }],
      _meta: { clientIdentifier: 'grok-desktop' },
    }, 120_000);
    assertCondition(await readMarker(markerPath, markerToken) === 'match', 'marker changed after the real prompt');
    console.log('PASS: real task prompt completed without changing the Hook marker');
  } else {
    console.log('SKIP: model prompt (--no-prompt); SessionStart execution was still verified');
  }
} catch (error) {
  console.error(`FAIL: real Hook acceptance: ${error instanceof Error ? error.message : String(error)}\n${safeEngineStderr(stderr)}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  if (child && !child.killed && !processExited && controlSessionId && trusted) {
    try {
      await hooksAction(controlSessionId, 'untrust');
      console.log('PASS: temporary project trust revoked');
    } catch (error) {
      console.error(`WARN: could not revoke temporary project trust: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
  if (child && !child.killed && !processExited) child.kill();
  await rm(project, { recursive: true, force: true });
  console.log('PASS: temporary Hook project removed');
}
