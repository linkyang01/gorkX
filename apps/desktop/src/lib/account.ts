import { invoke } from '@tauri-apps/api/core';
import type { ModelContextInfo } from './usage';

export interface AccountSummary {
  email?: string | null;
  displayName?: string | null;
  authenticated: boolean;
  /** e.g. SuperGrok / SuperGrok Heavy — from token or billing */
  membershipLabel?: string | null;
  /** Profile photo from xAI (https://assets.x.ai/…) */
  avatarUrl?: string | null;
  quotaLabel?: string | null;
  creditUsagePercent?: number | null;
  prepaidBalance?: number | null;
  onDemandUsed?: number | null;
  onDemandCap?: number | null;
  periodEnd?: string | null;
  productUsage?: Array<{ product: string; usagePercent?: number | null }> | null;
  quotaNote: string;
}

/** Local display nickname only — does not change account / API name. */
const DISPLAY_NAME_KEY = 'gorkx.displayNameOverride';

export function loadDisplayNameOverride(): string {
  try {
    return (localStorage.getItem(DISPLAY_NAME_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function saveDisplayNameOverride(name: string): void {
  try {
    const t = name.trim();
    if (!t) localStorage.removeItem(DISPLAY_NAME_KEY);
    else localStorage.setItem(DISPLAY_NAME_KEY, t);
  } catch {
    /* */
  }
}

/** UI label: custom nickname if set, else API displayName / email. */
export function uiDisplayName(
  account: AccountSummary | null | undefined,
  override?: string | null,
): string {
  const custom = (override ?? loadDisplayNameOverride()).trim();
  if (custom) return custom;
  return (
    account?.displayName?.trim() ||
    account?.email?.split('@')[0] ||
    ''
  );
}

/** Model from Grok subscription cache / cli-chat-proxy. */
export interface SubscriptionModel {
  modelId: string;
  name?: string | null;
  contextWindow?: number | null;
  hidden?: boolean | null;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

export async function fetchAccountSummary(): Promise<AccountSummary | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<AccountSummary>('account_summary');
  } catch (e) {
    // Surface a synthetic summary so UI can show the error instead of silent "—"
    const msg = e instanceof Error ? e.message : String(e);
    return {
      authenticated: false,
      quotaNote: msg || 'account_summary invoke failed',
    };
  }
}

/** Clear App GROK_HOME session. Does not re-import ~/.grok until user logs in again. */
export async function logoutAccount(): Promise<string> {
  if (!isTauri()) return 'not in app';
  return invoke<string>('auth_logout');
}

export interface LoginFlowResult {
  ok: boolean;
  importedFromSystem: boolean;
  note: string;
  account: AccountSummary | null;
}

/**
 * Browser device-code login (no Terminal).
 * Opens the system browser, waits for OAuth, writes App GROK_HOME/auth.json.
 */
export async function startLoginFlow(opts?: {
  onTick?: (msg: string) => void;
}): Promise<LoginFlowResult> {
  if (!isTauri()) {
    return { ok: false, importedFromSystem: false, note: 'not in app', account: null };
  }
  opts?.onTick?.('正在打开浏览器登录…');
  try {
    const r = await invoke<{
      ok: boolean;
      email?: string | null;
      displayName?: string | null;
      note: string;
      verificationUri?: string | null;
    }>('auth_login_browser');
    opts?.onTick?.(r.note);
    const account = await fetchAccountSummary();
    return {
      ok: r.ok,
      importedFromSystem: r.note.includes('系统'),
      note: r.note,
      account,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    opts?.onTick?.(msg);
    return {
      ok: false,
      importedFromSystem: false,
      note: msg,
      account: await fetchAccountSummary(),
    };
  }
}

/** Models available under the logged-in Grok subscription (cache + optional network refresh). */
export async function fetchSubscriptionModels(refresh = false): Promise<SubscriptionModel[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<SubscriptionModel[]>('list_available_models', { refresh });
  } catch {
    return [];
  }
}

export async function fetchModelContext(modelId?: string): Promise<ModelContextInfo | null> {
  if (!isTauri()) {
    return {
      modelId: modelId || '',
      contextWindow: 500_000,
      autoCompactPercent: 80,
    };
  }
  try {
    const r = await invoke<{
      modelId: string;
      name?: string;
      contextWindow: number;
      autoCompactPercent: number;
      compactionsRemaining?: number | null;
    }>('model_context_info', { modelId: modelId ?? null });
    return {
      modelId: r.modelId,
      name: r.name,
      contextWindow: r.contextWindow,
      autoCompactPercent: r.autoCompactPercent,
      compactionsRemaining: r.compactionsRemaining,
    };
  } catch {
    return {
      modelId: modelId || '',
      contextWindow: 500_000,
      autoCompactPercent: 80,
    };
  }
}
