/** App-local scheduled tasks; optional native worker reads the same SQLite store. */
import { invoke } from '@tauri-apps/api/core';

export type ScheduleKind = 'interval' | 'daily';

/**
 * Background worker is always plan-only (no silent external writes).
 * Foreground “Run now” may use default (user-attended Decisions).
 */
export type SchedulePermissionPolicy = 'plan' | 'default';

export interface ScheduledJob {
  id: string;
  title: string;
  prompt: string;
  /** empty = no project / inbox task */
  projectPath: string;
  kind: ScheduleKind;
  /** for interval: minutes between runs (min 5) */
  intervalMinutes: number;
  /** for daily: local hour 0–23 */
  dailyHour: number;
  dailyMinute: number;
  /** Mon–Fri only when daily */
  weekdaysOnly: boolean;
  enabled: boolean;
  lastRunAt: number | null;
  /** Consecutive failed dispatches; reset only after a successful dispatch. */
  failureCount: number;
  lastError: string | null;
  nextRunAt: number;
  createdAt: number;
  /** IANA zone or "local" — display + daily wall-clock use system local unless specialized. */
  timeZone?: string;
  /** Optional preferred model id for attended runs (hint only). */
  modelId?: string;
  /** Permission policy for automatic / background runs. Default plan. */
  permissionPolicy?: SchedulePermissionPolicy;
  /** Auto-retry cap; after this, job pauses until manual re-run. Default 5. */
  maxAutoRetries?: number;
}

/** Hard stop for automatic retries — never infinite. */
export const DEFAULT_MAX_AUTO_RETRIES = 5;

const LS_KEY = 'gorkx.scheduledJobs.v1';
const STORE_KEY = 'scheduled_jobs_v1';

export interface BackgroundSchedulerStatus {
  supported: boolean;
  enabled: boolean;
  label: string;
  detail: string;
}

export interface BackgroundSchedulerRun {
  jobId: string;
  title: string;
  startedAt: number;
  ok: boolean;
  output: string;
}

export async function getBackgroundSchedulerStatus(): Promise<BackgroundSchedulerStatus> {
  return invoke<BackgroundSchedulerStatus>('scheduler_status');
}

export async function setBackgroundSchedulerEnabled(enabled: boolean): Promise<BackgroundSchedulerStatus> {
  return invoke<BackgroundSchedulerStatus>(enabled ? 'scheduler_enable' : 'scheduler_disable');
}

export async function listBackgroundSchedulerRuns(): Promise<BackgroundSchedulerRun[]> {
  return invoke<BackgroundSchedulerRun[]>('scheduler_list_runs');
}

export function loadJobs(): ScheduledJob[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeScheduledJob).filter((j): j is ScheduledJob => Boolean(j));
  } catch {
    return [];
  }
}

export function saveJobs(jobs: ScheduledJob[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(jobs));
  } catch {
    /* */
  }
}

/**
 * Durable App SQLite storage, with a one-time localStorage import for older
 * installs and browser/dev fallback. The worker layer may later consume this
 * same store without depending on WebView state.
 */
export async function loadPersistentJobs(): Promise<ScheduledJob[]> {
  try {
    const raw = await invoke<string | null>('store_kv_get', { key: STORE_KEY });
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeScheduledJob).filter((j): j is ScheduledJob => Boolean(j));
      }
    }
    const legacy = loadJobs();
    if (legacy.length) await savePersistentJobs(legacy);
    return legacy;
  } catch {
    return loadJobs();
  }
}

export async function savePersistentJobs(jobs: ScheduledJob[]): Promise<void> {
  // Keep this mirror for non-Tauri development and backward-compatible reads.
  saveJobs(jobs);
  try {
    await invoke('store_kv_set', { key: STORE_KEY, value: JSON.stringify(jobs) });
  } catch {
    // WebView storage remains the fallback; do not make a scheduled task UI
    // appear broken solely because the native bridge is not running in dev.
  }
}

export function nid(): string {
  return `sch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function computeNextRun(job: Pick<
  ScheduledJob,
  'kind' | 'intervalMinutes' | 'dailyHour' | 'dailyMinute' | 'weekdaysOnly'
>, fromMs = Date.now()): number {
  if (job.kind === 'interval') {
    const mins = Math.max(5, job.intervalMinutes || 60);
    return fromMs + mins * 60_000;
  }
  // daily at local time
  const d = new Date(fromMs);
  d.setSeconds(0, 0);
  d.setHours(job.dailyHour, job.dailyMinute, 0, 0);
  if (d.getTime() <= fromMs) {
    d.setDate(d.getDate() + 1);
  }
  if (job.weekdaysOnly) {
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
  }
  return d.getTime();
}

/** Bounded exponential retry: 5m, 10m, 20m … capped at 6h. */
export function computeRetryRun(failureCount: number, fromMs = Date.now()): number {
  const minutes = Math.min(360, 5 * 2 ** Math.max(0, failureCount - 1));
  return fromMs + minutes * 60_000;
}

/** Whether another automatic retry is allowed (manual re-run is always ok). */
export function shouldAutoRetry(
  failureCount: number,
  maxAutoRetries: number = DEFAULT_MAX_AUTO_RETRIES,
): boolean {
  const max = Math.max(0, Math.floor(maxAutoRetries));
  return failureCount < max;
}

/**
 * Next schedule after an outcome. Exhausted auto-retries → disable-style
 * far-future nextRunAt; caller should also set enabled=false.
 */
export function nextRunAfterOutcome(
  job: Pick<
    ScheduledJob,
    | 'kind'
    | 'intervalMinutes'
    | 'dailyHour'
    | 'dailyMinute'
    | 'weekdaysOnly'
    | 'maxAutoRetries'
  >,
  ok: boolean,
  failureCount: number,
  fromMs = Date.now(),
): { nextRunAt: number; pauseAuto: boolean } {
  if (ok) {
    return { nextRunAt: computeNextRun(job, fromMs), pauseAuto: false };
  }
  const max = job.maxAutoRetries ?? DEFAULT_MAX_AUTO_RETRIES;
  if (!shouldAutoRetry(failureCount, max)) {
    return { nextRunAt: fromMs, pauseAuto: true };
  }
  return { nextRunAt: computeRetryRun(failureCount, fromMs), pauseAuto: false };
}

export function localTimeZoneId(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  } catch {
    return 'local';
  }
}

/** Normalize legacy rows from storage (missing Stage E fields). */
export function normalizeScheduledJob(raw: unknown): ScheduledJob | null {
  if (!raw || typeof raw !== 'object') return null;
  const j = raw as Partial<ScheduledJob>;
  if (typeof j.id !== 'string' || !j.id) return null;
  const kind: ScheduleKind = j.kind === 'interval' ? 'interval' : 'daily';
  const policy: SchedulePermissionPolicy =
    j.permissionPolicy === 'default' ? 'default' : 'plan';
  return {
    id: j.id,
    title: typeof j.title === 'string' ? j.title : 'Untitled',
    prompt: typeof j.prompt === 'string' ? j.prompt : '',
    projectPath: typeof j.projectPath === 'string' ? j.projectPath : '',
    kind,
    intervalMinutes: Math.max(5, Number(j.intervalMinutes) || 60),
    dailyHour: Math.min(23, Math.max(0, Number(j.dailyHour) || 0)),
    dailyMinute: Math.min(59, Math.max(0, Number(j.dailyMinute) || 0)),
    weekdaysOnly: Boolean(j.weekdaysOnly),
    enabled: j.enabled !== false,
    lastRunAt: typeof j.lastRunAt === 'number' ? j.lastRunAt : null,
    failureCount: Math.max(0, Number(j.failureCount) || 0),
    lastError: typeof j.lastError === 'string' ? j.lastError : null,
    nextRunAt: typeof j.nextRunAt === 'number' ? j.nextRunAt : Date.now(),
    createdAt: typeof j.createdAt === 'number' ? j.createdAt : Date.now(),
    timeZone: typeof j.timeZone === 'string' && j.timeZone ? j.timeZone : localTimeZoneId(),
    modelId: typeof j.modelId === 'string' && j.modelId ? j.modelId : undefined,
    permissionPolicy: policy,
    maxAutoRetries:
      typeof j.maxAutoRetries === 'number' && Number.isFinite(j.maxAutoRetries)
        ? Math.max(0, Math.floor(j.maxAutoRetries))
        : DEFAULT_MAX_AUTO_RETRIES,
  };
}

export function formatNextRun(ts: number): string {
  if (!Number.isFinite(ts) || ts >= Number.MAX_SAFE_INTEGER / 2) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

/** Human-readable schedule + policy summary for the job detail row. */
export function describeScheduleMeta(job: ScheduledJob): {
  frequency: string;
  timeZone: string;
  dataSource: 'project' | 'inbox';
  permissionPolicy: SchedulePermissionPolicy;
  modelId: string | null;
  nextRunAt: number;
  autoRetryPaused: boolean;
} {
  const frequency =
    job.kind === 'interval'
      ? `every ${Math.max(5, job.intervalMinutes)}m`
      : `daily ${String(job.dailyHour).padStart(2, '0')}:${String(job.dailyMinute).padStart(2, '0')}${
          job.weekdaysOnly ? ' weekdays' : ''
        }`;
  const max = job.maxAutoRetries ?? DEFAULT_MAX_AUTO_RETRIES;
  return {
    frequency,
    timeZone: job.timeZone || localTimeZoneId(),
    dataSource: job.projectPath.trim() ? 'project' : 'inbox',
    permissionPolicy: job.permissionPolicy === 'default' ? 'default' : 'plan',
    modelId: job.modelId?.trim() || null,
    nextRunAt: job.nextRunAt,
    autoRetryPaused:
      !job.enabled ||
      (job.failureCount > 0 && !shouldAutoRetry(job.failureCount, max)),
  };
}

/**
 * Lightweight natural-language schedule parse for create form.
 * Does not call the model — deterministic patterns only.
 */
export function parseScheduleFromNaturalLanguage(text: string): {
  title: string;
  prompt: string;
  kind: ScheduleKind;
  intervalMinutes: number;
  dailyHour: number;
  dailyMinute: number;
  weekdaysOnly: boolean;
} | null {
  const raw = text.replace(/\s+/g, ' ').trim();
  if (raw.length < 4) return null;

  let kind: ScheduleKind = 'daily';
  let intervalMinutes = 60;
  let dailyHour = 9;
  let dailyMinute = 0;
  let weekdaysOnly = false;

  const everyMin = raw.match(/(?:每|every)\s*(\d{1,4})\s*(?:分钟|分|min|minutes?)/i);
  const hourly = /每小时|every\s*hour/i.test(raw);
  const daily = /每天|每日|daily|every\s*day/i.test(raw);
  const weekdays = /工作日|weekdays?|mon\s*[-–]\s*fri/i.test(raw);
  const timeHm = raw.match(/(?:([01]?\d|2[0-3])[:：]([0-5]\d)|([01]?\d|2[0-3])\s*点(?:\s*([0-5]?\d)\s*分?)?)/);

  if (everyMin) {
    kind = 'interval';
    intervalMinutes = Math.max(5, Number(everyMin[1]) || 60);
  } else if (hourly) {
    kind = 'interval';
    intervalMinutes = 60;
  } else if (daily || timeHm) {
    kind = 'daily';
  }

  if (timeHm) {
    if (timeHm[1] != null) {
      dailyHour = Number(timeHm[1]);
      dailyMinute = Number(timeHm[2] || 0);
    } else if (timeHm[3] != null) {
      dailyHour = Number(timeHm[3]);
      dailyMinute = Number(timeHm[4] || 0);
    }
  }
  if (weekdays) weekdaysOnly = true;

  // Title: first clause before colon / ： or first 24 chars
  let title = raw;
  const split = raw.split(/[:：]/);
  if (split.length > 1 && split[0].trim().length >= 2 && split[0].trim().length <= 40) {
    title = split[0].trim();
  } else {
    title = raw.slice(0, 28) + (raw.length > 28 ? '…' : '');
  }

  return {
    title,
    prompt: raw,
    kind,
    intervalMinutes,
    dailyHour: Math.min(23, Math.max(0, dailyHour)),
    dailyMinute: Math.min(59, Math.max(0, dailyMinute)),
    weekdaysOnly,
  };
}

export const SUGGESTIONS: Array<{
  title: string;
  prompt: string;
  kind: ScheduleKind;
  intervalMinutes: number;
  dailyHour: number;
  dailyMinute: number;
  weekdaysOnly: boolean;
}> = [
  {
    title: '每日简报',
    prompt:
      '请根据当前项目，简要总结：昨日/近期进展、未关闭的问题、今日建议优先事项。用中文，简洁分点。',
    kind: 'daily',
    intervalMinutes: 1440,
    dailyHour: 8,
    dailyMinute: 0,
    weekdaysOnly: true,
  },
  {
    title: '每周回顾',
    prompt:
      '请回顾本周在此项目上的工作：完成事项、风险与阻塞、下周建议。用中文，结构清晰。',
    kind: 'daily',
    intervalMinutes: 10080,
    dailyHour: 16,
    dailyMinute: 0,
    weekdaysOnly: false,
  },
  {
    title: '跟进监控',
    prompt:
      '检查本项目近期变更与待办：是否有失败的构建/测试线索、未完成的 TODO、需要我关注的事项。用中文列出。',
    kind: 'daily',
    intervalMinutes: 1440,
    dailyHour: 9,
    dailyMinute: 0,
    weekdaysOnly: true,
  },
  {
    title: '每小时状态',
    prompt: '快速检查：当前工作区是否有未提交改动、是否有明显错误信号。用三句话中文汇报。',
    kind: 'interval',
    intervalMinutes: 60,
    dailyHour: 9,
    dailyMinute: 0,
    weekdaysOnly: false,
  },
];
