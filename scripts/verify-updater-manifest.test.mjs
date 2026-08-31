import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const script = path.join(root, 'scripts', 'verify-updater-manifest.mjs');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gorkx-updater-manifest-'));

function run(manifest) {
  const file = path.join(tempDir, `${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(manifest));
  return spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
}

const valid = run({
  version: '1.3.2',
  platforms: {
    'darwin-aarch64': {
      url: 'https://github.com/linkyang01/gorkX/releases/download/v1.3.2/gorkX.tar.gz',
      signature: 'A'.repeat(88),
      sha256: 'a'.repeat(64),
    },
  },
});
assert.equal(valid.status, 0, valid.stderr);
assert.match(valid.stdout, /PASS: updater manifest 1\.3\.2/);

const unsafeUrl = run({
  version: '1.3.2',
  platforms: {
    'darwin-aarch64': { url: 'http://example.invalid/app', signature: 'A'.repeat(88) },
  },
});
assert.equal(unsafeUrl.status, 3);

const missingSignature = run({
  version: '1.3.2',
  platforms: {
    'darwin-aarch64': { url: 'https://example.invalid/app' },
  },
});
assert.equal(missingSignature.status, 3);

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('verify-updater-manifest.test.mjs: ok');
