import { invoke } from '@tauri-apps/api/core';
import type { ModelContextInfo } from './usage';

export interface AccountSummary {
  email?: string | null;
  displayName?: string | null;
  authenticated: boolean;
  quotaLabel?: string | null;
  creditUsagePercent?: number | null;
  prepaidBalance?: number | null;
  onDemandUsed?: number | null;
  onDemandCap?: number | null;
  periodEnd?: string | null;
  productUsage?: Array<{ product: string; usagePercent?: number | null }> | null;
  quotaNote: string;
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
