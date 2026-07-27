/**
 * Stage E schedule helpers.
 * Run: node --experimental-strip-types src/lib/scheduled.test.ts
 */
import assert from 'node:assert/strict';
import {
  computeNextRun,
  computeRetryRun,
  DEFAULT_MAX_AUTO_RETRIES,
  describeScheduleMeta,
  nextRunAfterOutcome,
  normalizeScheduledJob,
  parseScheduleFromNaturalLanguage,
  shouldAutoRetry,
} from './scheduled.ts';

assert.equal(shouldAutoRetry(0), true);
assert.equal(shouldAutoRetry(4), true);
assert.equal(shouldAutoRetry(5), false);
assert.equal(shouldAutoRetry(5, 10), true);
assert.equal(shouldAutoRetry(0, 0), false);

const base = {
  kind: 'daily' as const,
  intervalMinutes: 60,
  dailyHour: 9,
  dailyMinute: 0,
  weekdaysOnly: false,
  maxAutoRetries: DEFAULT_MAX_AUTO_RETRIES,
};
const now = Date.UTC(2026, 0, 1, 0, 0, 0);
const ok = nextRunAfterOutcome(base, true, 0, now);
assert.ok(ok.nextRunAt > now);
assert.equal(ok.pauseAuto, false);

const retry = nextRunAfterOutcome(base, false, 1, now);
assert.equal(retry.nextRunAt, computeRetryRun(1, now));
assert.equal(retry.pauseAuto, false);

const paused = nextRunAfterOutcome(base, false, 5, now);
assert.equal(paused.pauseAuto, true);

const nl = parseScheduleFromNaturalLanguage('每天 9:30 工作日 项目简报：总结昨日进展与今日优先事项');
assert.ok(nl);
assert.equal(nl!.kind, 'daily');
assert.equal(nl!.dailyHour, 9);
assert.equal(nl!.dailyMinute, 30);
assert.equal(nl!.weekdaysOnly, true);
assert.ok(nl!.prompt.includes('总结'));

const nl2 = parseScheduleFromNaturalLanguage('every 30 minutes check build status');
assert.ok(nl2);
assert.equal(nl2!.kind, 'interval');
assert.equal(nl2!.intervalMinutes, 30);

assert.equal(parseScheduleFromNaturalLanguage('ab'), null);

const normalized = normalizeScheduledJob({
  id: 'sch_1',
  title: 'T',
  prompt: 'P',
  projectPath: '/proj',
  kind: 'interval',
  intervalMinutes: 15,
  enabled: true,
  nextRunAt: 1,
  createdAt: 1,
});
assert.ok(normalized);
assert.equal(normalized!.permissionPolicy, 'plan');
assert.equal(normalized!.maxAutoRetries, DEFAULT_MAX_AUTO_RETRIES);
assert.ok(normalized!.timeZone);

assert.equal(normalizeScheduledJob({ title: 'x' }), null);

const meta = describeScheduleMeta(normalized!);
assert.equal(meta.dataSource, 'project');
assert.equal(meta.permissionPolicy, 'plan');
assert.match(meta.frequency, /every 15m/);

// next interval from known time
const next = computeNextRun(
  { kind: 'interval', intervalMinutes: 10, dailyHour: 0, dailyMinute: 0, weekdaysOnly: false },
  1_000_000,
);
assert.equal(next, 1_000_000 + 10 * 60_000);

console.log('scheduled.test.ts: ok');
