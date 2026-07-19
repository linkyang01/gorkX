/** App-local scheduled tasks; optional native worker reads the same SQLite store. */
import { invoke } from '@tauri-apps/api/core';

export type ScheduleKind = 'interval' | 'daily';

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
}

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
    return arr.filter((j) => j && typeof j === 'object' && typeof (j as ScheduledJob).id === 'string');
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
        return parsed.filter(
          (job): job is ScheduledJob =>
            Boolean(job) && typeof job === 'object' && typeof (job as ScheduledJob).id === 'string',
        );
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

export function formatNextRun(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
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
