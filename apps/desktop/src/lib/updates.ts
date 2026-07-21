/** Update checks: Grok kernel (CLI) + gorkX app (GitHub releases + DMG install). */

import { invoke } from '@tauri-apps/api/core';

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
  try {
    const r = await invoke<{ stdout: string; stderr: string; exitCode: number | null }>(
      'grok_admin_exec',
      { args: ['--version'], grokCmd: grokBin || null, cwd: null },
    );
    const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
    const version = r.exitCode === 0 && out ? out.split('\n')[0].trim() : '—';
    return {
      currentVersion: version,
      latestVersion: version,
      updateAvailable: false,
      channel: 'source-locked',
      error: r.exitCode === 0 ? null : out || 'cannot read app kernel version',
      raw: 'Kernel upgrades are performed only through the locked source build and ACP regression gate.',
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

/**
 * Only hand ordinary web links to the OS opener. Callers include GitHub REST
 * fields and release metadata, so a name like `openUrlSafe` must not silently
 * accept custom schemes such as `file:`, `javascript:`, or app deep links.
 */
export function safeExternalUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Invalid external URL');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) {
    throw new Error('Only HTTP(S) external URLs are allowed');
  }
  return url.href;
}

export async function openUrlSafe(raw: string): Promise<void> {
  const url = safeExternalUrl(raw);
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
  if (!isTauri()) return '0.4.3';
  try {
    return await invoke<string>('app_current_version');
  } catch {
    return '0.4.3';
  }
}

export function formatBytes(n?: number | null): string {
  if (n == null || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
