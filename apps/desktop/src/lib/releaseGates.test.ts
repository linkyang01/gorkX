/**
 * Stage G release gate logic.
 * Run: node --experimental-strip-types src/lib/releaseGates.test.ts
 */
import assert from 'node:assert/strict';
import {
  classifySigningLevel,
  evaluateReleaseGates,
  macosDiagnosticPaths,
  opensWithoutTerminalBypass,
  parseMachOArch,
  platformMaturity,
  updateRollbackPolicy,
} from './releaseGates.ts';

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
