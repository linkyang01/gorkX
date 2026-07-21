#!/usr/bin/env node
// Action-level browser gate. It never uses a saved browser profile and requires
// an explicit public origin, so CI/local users choose the only site it visits.
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const originIndex = args.indexOf('--origin');
const origin = originIndex >= 0 ? args[originIndex + 1] : '';
if (!origin || !/^https?:\/\/[^/?#@*\s]+$/i.test(origin)) {
  console.error('usage: node scripts/verify-playwright-mcp.mjs --origin https://example.com');
  process.exit(2);
}

let child;
let stderr = '';
let buffer = '';
let nextId = 1;
const pending = new Map();

function safeStderr(raw) {
  return raw
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .split(/\r?\n/)
    .map((line) =>
      /token|api[_-]?key|secret|password|authorization|rt_prefix/i.test(line)
        ? '[mcp diagnostic redacted]'
        : line,
    )
    .join('\n');
}

function request(method, params, timeoutMs = 60_000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, timeoutMs);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message || 'MCP error'));
      else resolve(message.result);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

try {
  child = spawn(
    'npx',
    [
      '-y',
      '@playwright/mcp@0.0.78',
      '--browser',
      'chrome',
      '--isolated',
      '--block-service-workers',
      '--allowed-origins',
      origin,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    while (true) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) break;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      try {
        const message = JSON.parse(line);
        const done = pending.get(message.id);
        if (done) {
          pending.delete(message.id);
          done(message);
        }
      } catch {
        // MCP is JSONL; ignore non-protocol diagnostics on stdout.
      }
    }
  });

  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'gorkX-browser-smoke', version: '0' },
  });
  const listed = await request('tools/list', {});
  const toolNames = (listed.tools || []).map((tool) => tool.name);
  const navigate = toolNames.find((name) => /navigate/i.test(name));
  if (!navigate) throw new Error(`navigate tool unavailable: ${toolNames.join(',')}`);
  const result = await request('tools/call', { name: navigate, arguments: { url: origin } });
  const blocks = Array.isArray(result?.content) ? result.content.length : 0;
  console.log(`PASS: Playwright MCP tools/list (${toolNames.length} tools)`);
  console.log(`PASS: Playwright MCP ${navigate} (${origin}; ${blocks} result blocks)`);
} catch (error) {
  console.error(`FAIL: Playwright MCP smoke: ${error instanceof Error ? error.message : String(error)}\n${safeStderr(stderr)}`);
  process.exitCode = 1;
} finally {
  child?.kill();
}
