import assert from 'node:assert/strict';
import { parseAutoTopupSnapshot, parseBillingSnapshot } from './billing.ts';

const billing = parseBillingSnapshot({
  config: {
    creditUsagePercent: '0',
    monthlyLimit: { val: 5000 },
    used: { val: 0 },
    onDemandCap: { val: 1200 },
    onDemandUsed: { val: 35 },
    prepaidBalance: { val: 700 },
    currentPeriod: {
      type: 'USAGE_PERIOD_TYPE_WEEKLY',
      start: '2026-07-25T20:51:00Z',
      end: '2026-08-01T20:51:00Z',
    },
    history: [{ billingCycle: { year: 2026, month: 7 }, includedUsed: { val: 0 }, totalUsed: { val: 35 } }],
  },
  subscriptionTier: 'SuperGrok',
  onDemandEnabled: true,
});

assert.equal(billing.creditUsagePercent, 0);
assert.equal(billing.monthlyLimitUsd, 50);
assert.equal(billing.includedUsedUsd, 0);
assert.equal(billing.onDemandUsedUsd, 0.35);
assert.equal(billing.prepaidBalanceUsd, 7);
assert.equal(billing.history?.[0]?.totalUsedUsd, 0.35);
assert.equal(billing.subscriptionTier, 'SuperGrok');
assert.equal(billing.currentPeriod?.type, 'USAGE_PERIOD_TYPE_WEEKLY');
assert.equal(billing.currentPeriod?.start, '2026-07-25T20:51:00Z');
assert.equal(billing.currentPeriod?.end, '2026-08-01T20:51:00Z');

const autoTopup = parseAutoTopupSnapshot({ result: { rule: { topupAmount: { val: 500 }, enabled: true } } });
assert.equal(autoTopup.enabled, true);
assert.equal(autoTopup.topupAmountUsd, 5);
assert.equal(parseAutoTopupSnapshot({ rule: {} }).enabled, false);

console.log('billing.test.ts: ok');
