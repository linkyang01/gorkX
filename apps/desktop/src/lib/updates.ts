/** Update checks: Grok kernel (CLI) + gorkX app (GitHub releases). */

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
  htmlUrl?: string;
  body?: string;
  error?: string | null;
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

export async function checkAppUpdate(currentVersion: string): Promise<AppUpdateInfo> {
  try {
    const url = `https://api.github.com/repos/${GORKX_GITHUB.owner}/${GORKX_GITHUB.repo}/releases/latest`;
    const resp = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!resp.ok) {
      return {
        currentVersion,
        latestVersion: '—',
        updateAvailable: false,
        error: `GitHub HTTP ${resp.status}`,
      };
    }
    const j = (await resp.json()) as {
      tag_name?: string;
      html_url?: string;
      body?: string;
    };
    const latest = (j.tag_name || '').replace(/^v/i, '');
    const cur = currentVersion.replace(/^v/i, '');
    const updateAvailable = Boolean(latest && cur && latest !== cur && compareSemver(latest, cur) > 0);
    return {
      currentVersion: cur,
      latestVersion: latest || '—',
      updateAvailable,
      htmlUrl: j.html_url || GORKX_GITHUB.releasesUrl,
      body: j.body,
    };
  } catch (e) {
    return {
      currentVersion,
      latestVersion: '—',
      updateAvailable: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** naive semver compare: a>b → 1 */
function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
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
  if (!isTauri()) return '0.3.6';
  try {
    // fall back constant if no command
    return '0.3.7';
  } catch {
    return '0.3.7';
  }
}

// silence unused invoke
void invoke;
