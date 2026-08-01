#!/usr/bin/env node
/**
 * Opt-in authenticated smoke: spawn a read-only explore subagent under a real
 * parent session, poll get until terminal, optional cancel.
 *
 * Env:
 *   GORKX_ACP_TEST_AUTH_DIR  — copy of App GROK_HOME (never ~/.grok)
 *   GORKX_ACP_TEST_PROJECT_DIR — disposable git project
 *   GROK binary path as argv[2] or apps/desktop/src-tauri/resources/grok
 *
 * Does not claim App UI acceptance. Deletes nothing outside the disposable dirs.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const authDir = process.env.GORKX_ACP_TEST_AUTH_DIR || process.env.GORKX_ACP_TEST_HOME;
const projectDir = process.env.GORKX_ACP_TEST_PROJECT_DIR || process.env.GORKX_ACP_TEST_CWD;
const defaultGrok = fileURLToPath(new URL('../apps/desktop/src-tauri/resources/grok', import.meta.url));
const grok = resolve(process.argv[2] || process.env.GROK || defaultGrok);

if (!authDir || !projectDir) {
  console.error('usage: GORKX_ACP_TEST_AUTH_DIR=... GORKX_ACP_TEST_PROJECT_DIR=... node scripts/verify-live-subagent-spawn.mjs [grok]');
  process.exit(2);
}
if (!existsSync(grok)) {
  console.error('grok binary missing:', grok);
  process.exit(2);
}

const child = spawn(grok, ['agent', 'stdio'], {
  cwd: projectDir,
  env: { ...process.env, HOME: authDir, GROK_HOME: authDir },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let nextId = 1;
const pending = new Map();
createInterface({ input: child.stdout }).on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.id != null && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result ?? msg);
    }
  } catch {
    /* ignore non-json */
  }
});
let stderr = '';
child.stderr.on('data', (d) => {
  stderr += d.toString();
});

function req(method, params, timeoutMs = 60_000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout ${method}`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(t);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(t);
        reject(e);
      },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

try {
  await req('initialize', {
    protocolVersion: 1,
    clientInfo: { name: 'gorkx-live-subagent', version: '1.0.0' },
    clientCapabilities: { fs: { readTextFile: true } },
  });
  console.log('PASS: initialize');
  await req('authenticate', { methodId: 'cached_token' });
  console.log('PASS: authenticate(cached_token)');
  const created = await req('session/new', { cwd: projectDir, mcpServers: [] });
  const sessionId = created.sessionId || created.session_id;
  if (!sessionId) throw new Error('session/new missing sessionId');
  console.log('PASS: session/new');

  const spawnRes = await req('_x.ai/subagent/spawn', {
    sessionId,
    prompt: 'Read README.md if present. Reply with one short word from it. Do not edit files.',
    description: 'gorkx live explore',
    subagentType: 'explore',
    capabilityMode: 'read-only',
    isolation: 'none',
  });
  const subagentId = spawnRes.subagentId || spawnRes.result?.subagentId;
  if (!subagentId) throw new Error(`spawn missing id: ${JSON.stringify(spawnRes)}`);
  console.log(`PASS: subagent/spawn started id=${subagentId}`);

  let final = null;
  for (let i = 0; i < 36; i++) {
    await sleep(2500);
    const snapWrap = await req('_x.ai/subagent/get', { subagentId, block: false }, 20_000);
    const snap = snapWrap.snapshot || snapWrap.result?.snapshot || snapWrap;
    final = snap;
    const st = String(snap?.status || '');
    console.log(`poll ${i}: ${st}`);
    if (/^(complet|fail|error|cancel)/i.test(st)) break;
  }
  const status = String(final?.status || '');
  if (!/^complet/i.test(status)) {
    throw new Error(`subagent did not complete: ${JSON.stringify(final)?.slice(0, 500)}`);
  }
  console.log(`PASS: subagent completed output=${JSON.stringify(final?.output || '').slice(0, 120)}`);
  process.exitCode = 0;
} catch (error) {
  console.error('FAIL:', error instanceof Error ? error.message : error);
  if (/403|coming soon/i.test(stderr)) console.error('NOTE: stderr mentions Build 403');
  process.exitCode = 1;
} finally {
  try {
    child.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  setTimeout(() => process.exit(process.exitCode || 0), 400);
}
