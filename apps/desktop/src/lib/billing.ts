/** Pure parsing for Grok Build's authenticated billing ACP responses. */

export interface BillingSnapshot {
  creditUsagePercent?: number;
  subscriptionTier?: string;
  onDemandEnabled?: boolean;
  monthlyLimitUsd?: number;
  includedUsedUsd?: number;
  onDemandCapUsd?: number;
  onDemandUsedUsd?: number;
  prepaidBalanceUsd?: number;
  currentPeriod?: { type?: string; start?: string; end?: string };
  history?: Array<{
    billingCycle?: { year?: number; month?: number };
    includedUsedUsd?: number;
    onDemandUsedUsd?: number;
    totalUsedUsd?: number;
  }>;
}

export interface AutoTopupSnapshot {
  enabled: boolean;
  minBeforeHittingUsd?: number;
  topupAmountUsd?: number;
  maxAmountPerMonthUsd?: number;
}

function rawBillingRoot(raw: unknown): Record<string, unknown> {
  const outer = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return outer.result && typeof outer.result === 'object'
    ? outer.result as Record<string, unknown>
    : outer;
}

function numberFrom(row: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function centsFrom(row: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  if (!row) return undefined;
  for (const key of keys) {
    const value = row[key];
    if (value && typeof value === 'object') {
      const cents = numberFrom(value as Record<string, unknown>, 'val', 'value');
      if (cents != null) return cents / 100;
    }
    const cents = typeof value === 'number' || typeof value === 'string'
      ? numberFrom({ value }, 'value')
      : undefined;
    if (cents != null) return cents / 100;
  }
  return undefined;
}

export function parseBillingSnapshot(raw: unknown): BillingSnapshot {
  const root = rawBillingRoot(raw);
  const config = root.config && typeof root.config === 'object'
    ? root.config as Record<string, unknown>
    : {};
  const period = config.currentPeriod && typeof config.currentPeriod === 'object'
    ? config.currentPeriod as Record<string, unknown>
    : config.current_period && typeof config.current_period === 'object'
      ? config.current_period as Record<string, unknown>
      : undefined;
  const rawHistory = Array.isArray(config.history) ? config.history : [];
  const history = rawHistory.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const cycle = row.billingCycle && typeof row.billingCycle === 'object'
      ? row.billingCycle as Record<string, unknown>
      : row.billing_cycle && typeof row.billing_cycle === 'object'
        ? row.billing_cycle as Record<string, unknown>
        : undefined;
    return [{
      billingCycle: cycle ? {
        year: numberFrom(cycle, 'year'),
        month: numberFrom(cycle, 'month'),
      } : undefined,
      includedUsedUsd: centsFrom(row, 'includedUsed', 'included_used'),
      onDemandUsedUsd: centsFrom(row, 'onDemandUsed', 'on_demand_used'),
      totalUsedUsd: centsFrom(row, 'totalUsed', 'total_used'),
    }];
  });
  const boolean = (...keys: string[]) => {
    for (const key of keys) if (typeof root[key] === 'boolean') return root[key] as boolean;
    return undefined;
  };
  return {
    creditUsagePercent: numberFrom(config, 'creditUsagePercent', 'credit_usage_percent'),
    subscriptionTier: typeof root.subscriptionTier === 'string' ? root.subscriptionTier : undefined,
    onDemandEnabled: boolean('onDemandEnabled', 'on_demand_enabled'),
    monthlyLimitUsd: centsFrom(config, 'monthlyLimit', 'monthly_limit'),
    includedUsedUsd: centsFrom(config, 'used'),
    onDemandCapUsd: centsFrom(config, 'onDemandCap', 'on_demand_cap'),
    onDemandUsedUsd: centsFrom(config, 'onDemandUsed', 'on_demand_used'),
    prepaidBalanceUsd: centsFrom(config, 'prepaidBalance', 'prepaid_balance'),
    currentPeriod: period ? {
      type: typeof period.type === 'string'
        ? period.type
        : typeof period.periodType === 'string'
          ? period.periodType
          : typeof period.period_type === 'string'
            ? period.period_type
            : undefined,
      start: typeof period.start === 'string' ? period.start : undefined,
      end: typeof period.end === 'string' ? period.end : undefined,
    } : undefined,
    history: history.length ? history : undefined,
  };
}

export function parseAutoTopupSnapshot(raw: unknown): AutoTopupSnapshot {
  const root = rawBillingRoot(raw);
  const rule = root.rule && typeof root.rule === 'object' ? root.rule as Record<string, unknown> : {};
  return {
    enabled: rule.enabled === true,
    minBeforeHittingUsd: centsFrom(rule, 'minBeforeHittingSl', 'min_before_hitting_sl'),
    topupAmountUsd: centsFrom(rule, 'topupAmount', 'topup_amount'),
    maxAmountPerMonthUsd: centsFrom(rule, 'maxAmountPerMonth', 'max_amount_per_month'),
  };
}
