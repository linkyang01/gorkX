/**
 * Drives shipped designTokens helpers against real App.css (Stage A token source).
 * Run: node --experimental-strip-types src/lib/designTokens.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL_TOKEN_NAMES,
  COLOR_TOKEN_NAMES,
  extractTokenBlock,
  findMissingThemeTokens,
} from './designTokens.ts';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, '..', 'App.css');
const css = readFileSync(cssPath, 'utf8');

const light = extractTokenBlock(css, ':root');
const dark = extractTokenBlock(css, ':root[data-theme="dark"]');

assert.ok(light.size > 20, 'light theme must define many tokens');
assert.ok(dark.size > 10, 'dark theme must redefine color tokens');
assert.ok(light.has('--bg-app'), 'light has --bg-app');
assert.ok(dark.has('--bg-app'), 'dark has --bg-app');
assert.notEqual(light.get('--bg-app'), dark.get('--bg-app'), 'dark bg differs from light');

for (const name of ALL_TOKEN_NAMES) {
  assert.ok(light.has(name), `light missing ${name}`);
}
for (const name of COLOR_TOKEN_NAMES) {
  assert.ok(dark.has(name), `dark missing ${name}`);
}

const missing = findMissingThemeTokens(css);
assert.deepEqual(missing, {}, `unexpected missing tokens: ${JSON.stringify(missing)}`);

// Primary chrome surfaces consume tokens (not one-off hex on chrome-btn)
assert.match(css, /\.chrome-btn\s*\{[\s\S]*?color:\s*var\(--icon-muted\)/);
assert.match(css, /\.chrome-btn:hover\s*\{[\s\S]*?color:\s*var\(--icon-strong\)/);
assert.match(css, /\.btn\.primary[\s\S]*?background:\s*var\(--accent\)/);
assert.match(css, /\.empty\s*\{/);
assert.match(css, /var\(--focus-ring-color\)/);

// Task-first layout: narrow widths keep main prioritized
assert.match(css, /@media\s*\(max-width:\s*960px\)/);
assert.match(css, /\.shell\.with-review/);

// Session hierarchy layers
assert.match(css, /\.tl-plan\b/);
assert.match(css, /\.tl-tool\b/);
assert.match(css, /\.tl-decision\b/);
assert.match(css, /\.tl-result\b/);

console.log('designTokens.test.ts: ok');
console.log(`  light tokens: ${light.size}, dark color tokens: ${dark.size}`);
