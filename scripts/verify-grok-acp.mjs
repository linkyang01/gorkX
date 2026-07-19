#!/usr/bin/env node
// Minimal protocol gate for a Grok Build binary. It intentionally requires no login.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const bin = process.argv[2];
if (!bin) {
  console.error('usage: node scripts/verify-grok-acp.mjs /path/to/grok');
  process.exit(2);
}
const home = await mkdtemp(join(tmpdir(), 'gorkx-acp-smoke-'));
const child = spawn(bin, ['agent', 'stdio'], {
  env: { ...process.env, GROK_HOME: home },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill('SIGKILL'), 15_000);
try {
  const result = await new Promise((resolve, reject) => {
    let buffer = '';
    child.on('error', reject);
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      for (const line of buffer.split('\n')) {
        try {
          const json = JSON.parse(line);
          if (json.id === 1) resolve(json);
        } catch { /* incomplete/non-JSON line */ }
      }
      buffer = buffer.includes('\n') ? buffer.slice(buffer.lastIndexOf('\n') + 1) : buffer;
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientInfo: { name: 'gorkX-kernel-smoke', version: '0' }, clientCapabilities: { fs: { readTextFile: true }, terminal: true } } })}\n`);
  });
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
  if (!result.result) throw new Error(`initialize returned no result: ${JSON.stringify(result)}`);
  console.log(`PASS: ACP initialize (${bin})`);
} catch (error) {
  console.error(`FAIL: ACP initialize: ${error instanceof Error ? error.message : String(error)}\n${stderr}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  child.kill();
  await rm(home, { recursive: true, force: true });
}
