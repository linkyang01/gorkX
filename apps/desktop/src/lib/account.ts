import { invoke } from '@tauri-apps/api/core';
import type { ModelContextInfo } from './usage';
import { t } from './i18n';

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
  periodType?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  productUsage?: Array<{ product: string; usagePercent?: number | null }> | null;
  /** Server-confirmed cached preference; true means coding data sharing is off. */
  codingDataRetentionOptOut?: boolean | null;
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

export interface SubscriptionModelsSnapshot {
  models: SubscriptionModel[];
  /** Whether this display came from a successful live refresh, prior cache, or neither. */
  source: 'live' | 'cache' | 'none';
  fetchedAt?: string | null;
  refreshError?: string | null;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

/**
 * The kernel is allowed to describe its own authentication failure, but the
 * ordinary desktop path must never tell a non-technical user to run a CLI.
 */
function localizeAccountNote(raw: string | null | undefined): string {
  const note = (raw || '').trim();
  if (!note) return note;
  if (/not logged in|no auth(?:entication)? session|no auth\.json/i.test(note)) {
    return t('accountSignInRequired');
  }
  if (/token expired|refresh failed|re-?login/i.test(note)) {
    return t('accountSignInAgain');
  }
  // The billing endpoint can authenticate successfully while omitting a
  // percentage for this subscription. That is not a login failure, and its
  // wire-format diagnostic must never become product-facing copy.
  if (/billing ok but no creditUsagePercent field/i.test(note)) {
    return t('accountQuotaUnavailable');
  }
  return note;
}

/**
 * Keep authentication recovery desktop-first.  The engine can return several
 * transport-specific phrasings, but the user only needs one safe action:
 * sign in again.  This classifier never inspects or returns credential data.
 */
export function requiresAccountReauthentication(raw: string | null | undefined): boolean {
  const note = (raw || '').trim();
  return /token expired|session expired|re-?authentication required|refresh failed|not logged in|no auth(?:entication)? session|no auth\.json/i.test(note);
}

export async function fetchAccountSummary(): Promise<AccountSummary | null> {
  if (!isTauri()) return null;
  try {
    const summary = await invoke<AccountSummary>('account_summary');
    return { ...summary, quotaNote: localizeAccountNote(summary.quotaNote) };
  } catch (e) {
    // Surface a synthetic summary so UI can show the error instead of silent "—"
    const msg = localizeAccountNote(e instanceof Error ? e.message : String(e));
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
  /** Skip the local ~/.grok fast path and start a fresh device-code OAuth flow. */
  force?: boolean;
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
    }>('auth_login_browser', { force: Boolean(opts?.force) });
    const note = localizeAccountNote(r.note);
    opts?.onTick?.(note);
    const account = await fetchAccountSummary();
    return {
      ok: r.ok,
      importedFromSystem: r.note.includes('系统'),
      note,
      account,
    };
  } catch (e) {
    const msg = localizeAccountNote(e instanceof Error ? e.message : String(e));
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

/**
 * Subscription-only model evidence from Grok Build. Custom provider entries
 * are intentionally absent so a provider catalog cannot be mistaken for the
 * models actually entitled by the current Grok login.
 */
export async function fetchSubscriptionModelsSnapshot(refresh = false): Promise<SubscriptionModelsSnapshot> {
  if (!isTauri()) return { models: [], source: 'none' };
  try {
    return await invoke<SubscriptionModelsSnapshot>('subscription_models_snapshot', { refresh });
  } catch (e) {
    return {
      models: [],
      source: 'none',
      refreshError: e instanceof Error ? e.message : String(e),
    };
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
