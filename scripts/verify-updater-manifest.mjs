#!/usr/bin/env node
/**
 * Validate the public shape of a Tauri updater manifest before it is hosted.
 * Cryptographic signature verification remains Tauri's updater responsibility;
 * this gate prevents unsafe URLs, missing signatures, and malformed versions.
 */
import fs from 'node:fs';

const manifestPath = process.argv[2];
if (!manifestPath || !manifestPath.startsWith('/')) {
  console.error('usage: verify-updater-manifest.mjs /absolute/path/latest.json');
  process.exit(2);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`BLOCKED: cannot parse updater manifest: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

const version = typeof manifest?.version === 'string' ? manifest.version.trim() : '';
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('BLOCKED: updater manifest version is not semver');
  process.exit(3);
}
const platforms = manifest?.platforms;
if (!platforms || typeof platforms !== 'object' || Array.isArray(platforms)) {
  console.error('BLOCKED: updater manifest has no platforms map');
  process.exit(3);
}
const entries = Object.entries(platforms);
if (!entries.length) {
  console.error('BLOCKED: updater manifest has no platform artifacts');
  process.exit(3);
}

for (const [platform, artifact] of entries) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    console.error(`BLOCKED: ${platform} artifact is not an object`);
    process.exit(3);
  }
  const url = typeof artifact.url === 'string' ? artifact.url.trim() : '';
  const signature = typeof artifact.signature === 'string' ? artifact.signature.trim() : '';
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    parsedUrl = null;
  }
  if (!parsedUrl || parsedUrl.protocol !== 'https:' || !parsedUrl.hostname) {
    console.error(`BLOCKED: ${platform} artifact URL must be HTTPS`);
    process.exit(3);
  }
  if (!/^[A-Za-z0-9+/=_-]{40,}$/.test(signature)) {
    console.error(`BLOCKED: ${platform} artifact has no plausible updater signature`);
    process.exit(3);
  }
  if (artifact.sha256 !== undefined && !/^[0-9a-f]{64}$/i.test(String(artifact.sha256))) {
    console.error(`BLOCKED: ${platform} artifact sha256 is invalid`);
    process.exit(3);
  }
}

console.log(`PASS: updater manifest ${version} (${entries.length} platform artifact(s))`);
