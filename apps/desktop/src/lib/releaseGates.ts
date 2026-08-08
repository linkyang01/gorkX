/**
 * Stage G: release credibility gates (pure logic).
 * Never claims notarization or dual-arch coverage without evidence.
 * Shipping DMG/tag/Release requires explicit user approval (product plan §7.6).
 */

export type SigningLevel = 'none' | 'adhoc' | 'developer_id' | 'notarized';

export type HostArch = 'arm64' | 'x86_64' | 'other';

export type PlatformTrack = 'macos' | 'windows' | 'linux';

export type PlatformMaturity = 'real' | 'trial' | 'eval' | 'blocked';

/** Map codesign / spctl observations to a signing level. */
export function classifySigningLevel(input: {
  hasSignature: boolean;
  /** e.g. "adhoc", "Apple Development", "Developer ID Application: …" */
  authority?: string | null;
  /** True only when notarization staple/online check succeeded. */
  notarized?: boolean;
}): SigningLevel {
  if (input.notarized) return 'notarized';
  if (!input.hasSignature) return 'none';
  const auth = (input.authority || '').toLowerCase();
  if (!auth || auth.includes('adhoc') || auth === 'signature=adhoc') return 'adhoc';
  if (auth.includes('developer id')) return 'developer_id';
  // Apple Development / other — treat as ad-hoc class for Gatekeeper downloads
  return 'adhoc';
}

/**
 * Downloaded apps from the internet open without Terminal workarounds only when notarized
 * (or already approved by the user in Gatekeeper history — not claimed here).
 */
export function opensWithoutTerminalBypass(level: SigningLevel): boolean {
  return level === 'notarized';
}

export function parseMachOArch(fileOutput: string): HostArch {
  const s = fileOutput.toLowerCase();
  if (s.includes('arm64') || s.includes('aarch64')) return 'arm64';
  if (s.includes('x86_64') || s.includes('x86-64')) return 'x86_64';
  return 'other';
}

export function platformMaturity(track: PlatformTrack): PlatformMaturity {
  switch (track) {
    case 'macos':
      return 'real';
    case 'windows':
      return 'trial';
    case 'linux':
      return 'eval';
  }
}

export interface ReleaseGateInput {
  /** npm run test:stages (A–F) exit 0 */
  stageTestsPass: boolean;
  /** verify-macos-app-bundle (engine + isolated GROK_HOME) */
  bundleEngineOk: boolean;
  /** One real authenticated Grok Build prompt completed successfully. */
  realPromptPassed: boolean;
  /** Clean-machine install, login, first task and reopen evidence. */
  cleanInstallPassed: boolean;
  /** One user-configured third-party endpoint produced a real reply. */
  thirdPartyModelPassed: boolean;
  /** macOS microphone permission, dictation and editable draft evidence. */
  microphonePassed: boolean;
  signingLevel: SigningLevel;
  /** Architectures that completed install+login+real project+bundle engine verify */
  archVerified: readonly HostArch[];
  /** Windows trial checklist all real (not assumed) */
  windowsTrialPassed: boolean;
  /** Linux support-cost decision recorded as approved for Beta */
  linuxBetaApproved: boolean;
  /** Explicit human approval to tag / Release / DMG — product plan §7.6 */
  userApprovedShip: boolean;
}

export interface ReleaseGateResult {
  /** Source-level “ready to consider a release candidate” */
  releaseCandidateReady: boolean;
  /** Allowed to create tag + GitHub Release + DMG */
  canShipPublicArtifacts: boolean;
  blockers: string[];
  warnings: string[];
  platform: Record<PlatformTrack, PlatformMaturity>;
}

export function evaluateReleaseGates(input: ReleaseGateInput): ReleaseGateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.stageTestsPass) blockers.push('Stage A–F automated tests have not all passed');
  if (!input.bundleEngineOk) blockers.push('macOS app bundle engine verification failed or missing');
  if (!input.realPromptPassed) blockers.push('No real authenticated Grok Build prompt acceptance evidence');
  if (!input.cleanInstallPassed) blockers.push('No clean-machine install/login/reopen acceptance evidence');
  if (!input.thirdPartyModelPassed) blockers.push('No real third-party model endpoint acceptance evidence');
  if (!input.microphonePassed) blockers.push('No real macOS microphone transcription acceptance evidence');

  if (!opensWithoutTerminalBypass(input.signingLevel)) {
    if (input.signingLevel === 'none') {
      blockers.push('App is unsigned — Developer ID + notarization required for downloadable macOS builds');
    } else if (input.signingLevel === 'adhoc') {
      warnings.push(
        'App is ad-hoc signed only; users may need Gatekeeper workarounds until Developer ID + notarization',
      );
    } else if (input.signingLevel === 'developer_id') {
      warnings.push('Developer ID signed but not notarized — notarize before public DMG distribution');
    }
  }

  const archs = new Set(input.archVerified.filter((a) => a === 'arm64' || a === 'x86_64'));
  if (!archs.has('arm64')) {
    warnings.push('Apple Silicon (arm64) install+project verification evidence missing');
  }
  if (!archs.has('x86_64')) {
    warnings.push('Intel (x86_64) install+project verification evidence missing');
  }

  if (!input.windowsTrialPassed) {
    warnings.push('Windows trial acceptance not complete (isolated data dir, secrets, kernel, install/uninstall)');
  }
  if (!input.linuxBetaApproved) {
    warnings.push('Linux remains evaluation-only until secrets/sandbox/desktop cost is approved');
  }

  if (!input.userApprovedShip) {
    blockers.push('No explicit user approval to ship tag/Release/DMG (PRODUCT_DEVELOPMENT_PLAN §7.6)');
  }

  const releaseCandidateReady =
    input.stageTestsPass &&
    input.bundleEngineOk &&
    // RC can be ad-hoc for internal; public ship needs notarization + approval
    input.signingLevel !== 'none';

  const canShipPublicArtifacts =
    input.userApprovedShip &&
    input.stageTestsPass &&
    input.bundleEngineOk &&
    input.realPromptPassed &&
    input.cleanInstallPassed &&
    input.thirdPartyModelPassed &&
    input.microphonePassed &&
    opensWithoutTerminalBypass(input.signingLevel) &&
    archs.has('arm64') &&
    archs.has('x86_64');

  return {
    releaseCandidateReady,
    canShipPublicArtifacts,
    blockers,
    warnings,
    platform: {
      macos: platformMaturity('macos'),
      windows: platformMaturity('windows'),
      linux: platformMaturity('linux'),
    },
  };
}

/** Crash / diagnostic locations (macOS) for support docs — no PII collection. */
export function macosDiagnosticPaths(home = '$HOME'): {
  appSupport: string;
  grokHome: string;
  diagnosticReports: string;
  unifiedLogHint: string;
} {
  return {
    appSupport: `${home}/Library/Application Support/gorkX`,
    grokHome: `${home}/Library/Application Support/gorkX/grok-home`,
    diagnosticReports: `${home}/Library/Logs/DiagnosticReports`,
    unifiedLogHint: 'log show --predicate \'process == "gorkx"\' --last 1h',
  };
}

/** Update / rollback policy summary for UI and docs. */
export function updateRollbackPolicy(): {
  updateSource: string;
  rollback: string;
  noSilentKernelUpgrade: string;
} {
  return {
    updateSource: 'GitHub Releases DMG for this Mac architecture; in-app check never auto-installs without user action',
    rollback: 'Keep previous gorkX.app; replace the new app with the previous copy from Time Machine or the prior DMG',
    noSilentKernelUpgrade: 'Kernel upgrades only via locked source build + ACP regression — not grok update',
  };
}
