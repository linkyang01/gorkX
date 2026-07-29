/**
 * Stage G release gate logic.
 * Run: node --experimental-strip-types src/lib/releaseGates.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  classifySigningLevel,
  evaluateReleaseGates,
  macosDiagnosticPaths,
  opensWithoutTerminalBypass,
  parseMachOArch,
  platformMaturity,
  updateRollbackPolicy,
} from './releaseGates.ts';

// A stale renderer constant previously made Settings and update checks report
// an older release than the app bundle. Keep every published package marker
// aligned with the package manifest before a release can pass its local gate.
const packageVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const tauriVersion = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
const rendererMeta = fs.readFileSync('src/lib/appMeta.ts', 'utf8');
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const cargoToml = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
assert.equal(tauriVersion, packageVersion);
assert.equal(packageLock.version, packageVersion);
assert.equal(packageLock.packages[''].version, packageVersion);
assert.match(rendererMeta, new RegExp(`APP_VERSION = '${packageVersion.replace(/\./g, '\\.')}'`));
assert.match(cargoToml, new RegExp(`^version = \"${packageVersion.replace(/\./g, '\\.')}\"$`, 'm'));

assert.equal(classifySigningLevel({ hasSignature: false }), 'none');
assert.equal(classifySigningLevel({ hasSignature: true, authority: 'adhoc' }), 'adhoc');
assert.equal(
  classifySigningLevel({
    hasSignature: true,
    authority: 'Developer ID Application: Example (TEAM)',
  }),
  'developer_id',
);
assert.equal(
  classifySigningLevel({
    hasSignature: true,
    authority: 'Developer ID Application: Example',
    notarized: true,
  }),
  'notarized',
);

assert.equal(opensWithoutTerminalBypass('notarized'), true);
assert.equal(opensWithoutTerminalBypass('adhoc'), false);
assert.equal(opensWithoutTerminalBypass('developer_id'), false);

assert.equal(parseMachOArch('Mach-O 64-bit executable arm64'), 'arm64');
assert.equal(parseMachOArch('Mach-O 64-bit executable x86_64'), 'x86_64');
assert.equal(parseMachOArch('ELF 64-bit'), 'other');

assert.equal(platformMaturity('macos'), 'real');
assert.equal(platformMaturity('windows'), 'trial');
assert.equal(platformMaturity('linux'), 'eval');

const blocked = evaluateReleaseGates({
  stageTestsPass: true,
  bundleEngineOk: true,
  signingLevel: 'adhoc',
  archVerified: ['arm64'],
  windowsTrialPassed: false,
  linuxBetaApproved: false,
  userApprovedShip: false,
});
assert.equal(blocked.canShipPublicArtifacts, false);
assert.ok(blocked.blockers.some((b) => /user approval|§7\.6|explicit/i.test(b)));
assert.ok(blocked.warnings.some((b) => /Intel|x86_64/i.test(b)));
assert.equal(blocked.releaseCandidateReady, true);

const shippable = evaluateReleaseGates({
  stageTestsPass: true,
  bundleEngineOk: true,
  signingLevel: 'notarized',
  archVerified: ['arm64', 'x86_64'],
  windowsTrialPassed: true,
  linuxBetaApproved: false,
  userApprovedShip: true,
});
assert.equal(shippable.canShipPublicArtifacts, true);
assert.equal(shippable.blockers.length, 0);

const paths = macosDiagnosticPaths('/Users/demo');
assert.match(paths.grokHome, /gorkX\/grok-home/);
assert.match(paths.diagnosticReports, /DiagnosticReports/);

const policy = updateRollbackPolicy();
assert.match(policy.noSilentKernelUpgrade, /locked source/i);
assert.match(policy.rollback, /previous/i);

console.log('releaseGates.test.ts: ok');
