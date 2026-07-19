/** Update checks: Grok kernel (CLI) + gorkX app (GitHub releases + DMG install). */

import { invoke } from '@tauri-apps/api/core';
import { shellExec } from './terminal';

export const GORKX_GITHUB = {
  owner: 'linkyang01',
  repo: 'gorkX',
  releasesUrl: 'https://github.com/linkyang01/gorkX/releases',
  sourceUrl: 'https://github.com/linkyang01/gorkX',
};

export const GROK_KERNEL_GITHUB = {
  owner: 'xai-org',
  repo: 'grok-build',
  releasesUrl: 'https://github.com/xai-org/grok-build/releases',
  sourceUrl: 'https://github.com/xai-org/grok-build',
};

export interface KernelUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  channel?: string;
  error?: string | null;
  raw?: string;
}

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  htmlUrl?: string | null;
  body?: string | null;
  dmgUrl?: string | null;
  dmgName?: string | null;
  dmgBytes?: number | null;
  arch?: string | null;
  error?: string | null;
  note?: string | null;
}

export interface AppInstallResult {
  ok: boolean;
  path?: string | null;
  note: string;
}

function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
}

export async function checkKernelUpdate(grokBin?: string): Promise<KernelUpdateInfo> {
  const bin = (grokBin || 'grok').trim() || 'grok';
  try {
    const r = await shellExec(`${JSON.stringify(bin)} update --check --json`);
    const out = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
    const jsonLine = out
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('{'));
    if (jsonLine) {
      const j = JSON.parse(jsonLine) as {
        currentVersion?: string;
        latestVersion?: string;
        updateAvailable?: boolean;
        channel?: string;
        error?: string | null;
      };
      return {
        currentVersion: j.currentVersion || '—',
        latestVersion: j.latestVersion || '—',
        updateAvailable: Boolean(j.updateAvailable),
        channel: j.channel,
        error: j.error,
        raw: out,
      };
    }
    return {
      currentVersion: '—',
      latestVersion: '—',
      updateAvailable: false,
      error: out || 'no json from grok update --check',
      raw: out,
    };
  } catch (e) {
    return {
      currentVersion: '—',
      latestVersion: '—',
      updateAvailable: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function runKernelUpdate(grokBin?: string): Promise<{ ok: boolean; log: string }> {
  const bin = (grokBin || 'grok').trim() || 'grok';
  try {
    const r = await shellExec(`${JSON.stringify(bin)} update`);
    const log = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
    return { ok: (r.exitCode ?? 1) === 0, log };
  } catch (e) {
    return { ok: false, log: e instanceof Error ? e.message : String(e) };
  }
}

/** Native check: GitHub API + release-page fallback, includes DMG asset for this Mac. */
export async function checkAppUpdate(currentVersion?: string): Promise<AppUpdateInfo> {
  const cur = (currentVersion || (await appVersion())).replace(/^v/i, '');
  if (!isTauri()) {
    return {
      currentVersion: cur,
      latestVersion: '—',
      updateAvailable: false,
      error: 'not in app',
      htmlUrl: GORKX_GITHUB.releasesUrl,
    };
  }
  try {
    const r = await invoke<{
      currentVersion: string;
      latestVersion: string;
      updateAvailable: boolean;
      htmlUrl?: string | null;
      dmgUrl?: string | null;
      dmgName?: string | null;
      dmgBytes?: number | null;
      arch?: string | null;
      error?: string | null;
      note?: string | null;
    }>('app_update_check', { currentVersion: cur });
    return {
      currentVersion: r.currentVersion,
      latestVersion: r.latestVersion,
      updateAvailable: r.updateAvailable,
      htmlUrl: r.htmlUrl,
      dmgUrl: r.dmgUrl,
      dmgName: r.dmgName,
      dmgBytes: r.dmgBytes,
      arch: r.arch,
      error: r.error,
      note: r.note,
    };
  } catch (e) {
    return {
      currentVersion: cur,
      latestVersion: '—',
      updateAvailable: false,
      error: e instanceof Error ? e.message : String(e),
      htmlUrl: GORKX_GITHUB.releasesUrl,
    };
  }
}

/**
 * Download DMG to ~/Downloads and open it so the user can drag into Applications.
 * This is the supported path for unsigned .app installs.
 */
export async function installAppUpdate(info?: AppUpdateInfo | null): Promise<AppInstallResult> {
  if (!isTauri()) {
    return { ok: false, note: 'not in app' };
  }
  try {
    return await invoke<AppInstallResult>('app_update_install', {
      dmgUrl: info?.dmgUrl ?? null,
      dmgName: info?.dmgName ?? null,
    });
  } catch (e) {
    return { ok: false, note: e instanceof Error ? e.message : String(e) };
  }
}

export async function openUrlSafe(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch {
      /* */
    }
  }
  window.open(url, '_blank');
}

export async function appVersion(): Promise<string> {
  if (!isTauri()) return '0.4.2';
  try {
    return await invoke<string>('app_current_version');
  } catch {
    return '0.4.2';
  }
}

export function formatBytes(n?: number | null): string {
  if (n == null || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
