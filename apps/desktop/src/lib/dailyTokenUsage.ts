/** Local, de-duplicated daily token counters reported by the ACP kernel. */

import { invoke } from '@tauri-apps/api/core';
import type { UsageSnapshot } from './usage';

export interface DailyTokenUsage {
  day: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  reasoningTokens: number;
  updatedAt: number;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

export function localUsageDay(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function usagePayload(usage: UsageSnapshot) {
  return {
    totalTokens: usage.totalTokens ?? null,
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    cachedReadTokens: usage.cachedReadTokens ?? null,
    reasoningTokens: usage.reasoningTokens ?? null,
  };
}

/**
 * Persist an increment calculated from ACP's monotonic session counters. It
 * deliberately has no web-preview fallback: a browser cannot truthfully claim
 * that its temporary data is durable desktop usage history.
 */
export async function recordDailyTokenUsage(
  threadId: string,
  usage: UsageSnapshot,
): Promise<DailyTokenUsage | null> {
  if (!isTauri() || !threadId.trim()) return null;
  if (usage.totalTokens == null && usage.inputTokens == null && usage.outputTokens == null) return null;
  return invoke<DailyTokenUsage>('store_record_daily_token_usage', {
    day: localUsageDay(),
    threadId,
    modelId: usage.modelId ?? null,
    usage: usagePayload(usage),
  });
}

export async function getTodayTokenUsage(): Promise<DailyTokenUsage | null> {
  if (!isTauri()) return null;
  return invoke<DailyTokenUsage>('store_get_daily_token_usage', { day: localUsageDay() });
}
