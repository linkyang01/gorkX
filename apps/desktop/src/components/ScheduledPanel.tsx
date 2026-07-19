/**
 * 已安排任务 — foreground jobs plus an opt-in, read-only macOS worker.
 */
import { useEffect, useState } from 'react';
import {
  type BackgroundSchedulerRun,
  type ScheduledJob,
  computeNextRun,
  computeRetryRun,
  formatNextRun,
  getBackgroundSchedulerStatus,
  listBackgroundSchedulerRuns,
  loadPersistentJobs,
  nid,
  savePersistentJobs,
  setBackgroundSchedulerEnabled,
  SUGGESTIONS,
} from '../lib/scheduled';
import { projectDisplayName } from '../lib/projects';
import { t } from '../lib/i18n';
import { IconClose } from './UiIcons';

interface Props {
  open: boolean;
  onClose: () => void;
  projects: string[];
  aliases?: Record<string, string>;
  currentProject?: string;
  /** Called when a job should run: parent creates a task and sends the prompt */
  onRunJob: (job: ScheduledJob) => Promise<{ ok: boolean; error?: string }>;
}

export function ScheduledPanel({
  open,
  onClose,
  projects,
  aliases = {},
  currentProject,
  onRunJob,
}: Props) {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [projectPath, setProjectPath] = useState(currentProject || '');
  const [kind, setKind] = useState<'interval' | 'daily'>('daily');
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [dailyHour, setDailyHour] = useState(9);
  const [dailyMinute, setDailyMinute] = useState(0);
  const [weekdaysOnly, setWeekdaysOnly] = useState(true);
  const [backgroundEnabled, setBackgroundEnabled] = useState(false);
  const [backgroundSupported, setBackgroundSupported] = useState(false);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [backgroundMsg, setBackgroundMsg] = useState<string | null>(null);
  const [backgroundRuns, setBackgroundRuns] = useState<BackgroundSchedulerRun[]>([]);

  useEffect(() => {
    if (!open) return;
    void loadPersistentJobs().then(setJobs);
    void getBackgroundSchedulerStatus()
      .then((status) => {
        setBackgroundSupported(status.supported);
        setBackgroundEnabled(status.enabled);
        setBackgroundMsg(null);
      })
      .catch(() => setBackgroundSupported(false));
    void listBackgroundSchedulerRuns().then(setBackgroundRuns).catch(() => setBackgroundRuns([]));
  }, [open]);

  useEffect(() => {
    if (currentProject) setProjectPath(currentProject);
  }, [currentProject]);

  if (!open) return null;

  const persist = (next: ScheduledJob[]) => {
    setJobs(next);
    void savePersistentJobs(next);
  };

  const addJob = (partial: Omit<
    ScheduledJob,
    'id' | 'createdAt' | 'nextRunAt' | 'lastRunAt' | 'failureCount' | 'lastError'
  >) => {
    const job: ScheduledJob = {
      ...partial,
      id: nid(),
      createdAt: Date.now(),
      lastRunAt: null,
      failureCount: 0,
      lastError: null,
      nextRunAt: computeNextRun(partial),
    };
    persist([job, ...jobs]);
    setCreating(false);
    setTitle('');
    setPrompt('');
  };

  const fromSuggestion = (s: (typeof SUGGESTIONS)[0]) => {
    addJob({
      title: s.title,
      prompt: s.prompt,
      projectPath: currentProject || '',
      kind: s.kind,
      intervalMinutes: s.intervalMinutes,
      dailyHour: s.dailyHour,
      dailyMinute: s.dailyMinute,
      weekdaysOnly: s.weekdaysOnly,
      enabled: true,
    });
  };

  const toggle = (id: string) => {
    persist(
      jobs.map((j) => {
        if (j.id !== id) return j;
        const enabled = !j.enabled;
        return {
          ...j,
          enabled,
          nextRunAt: enabled ? computeNextRun(j) : j.nextRunAt,
        };
      }),
    );
  };

  const remove = (id: string) => {
    if (!confirm(t('schedDeleteConfirm'))) return;
    persist(jobs.filter((j) => j.id !== id));
  };

  const runNow = async (job: ScheduledJob) => {
    const result = await onRunJob(job);
    const now = Date.now();
    persist(
      jobs.map((j) =>
        j.id === job.id
          ? {
              ...j,
              lastRunAt: now,
              failureCount: result.ok ? 0 : (j.failureCount ?? 0) + 1,
              lastError: result.ok ? null : (result.error || '无法启动 Agent').slice(0, 500),
              nextRunAt: result.ok
                ? computeNextRun(j, now)
                : computeRetryRun((j.failureCount ?? 0) + 1, now),
            }
          : j,
      ),
    );
  };

  const submitCreate = () => {
    if (!title.trim() || !prompt.trim()) return;
    addJob({
      title: title.trim(),
      prompt: prompt.trim(),
      projectPath: projectPath.trim(),
      kind,
      intervalMinutes: Math.max(5, intervalMinutes),
      dailyHour,
      dailyMinute,
      weekdaysOnly,
      enabled: true,
    });
  };

  const toggleBackground = async () => {
    setBackgroundBusy(true);
    try {
      const status = await setBackgroundSchedulerEnabled(!backgroundEnabled);
      setBackgroundEnabled(status.enabled);
      setBackgroundSupported(status.supported);
      setBackgroundMsg(status.enabled ? t('schedBackgroundOn') : t('schedBackgroundOff'));
      if (status.enabled) void listBackgroundSchedulerRuns().then(setBackgroundRuns).catch(() => {});
    } catch (error) {
      setBackgroundMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setBackgroundBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal sched-modal"
        role="dialog"
        aria-label={t('schedTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 style={{ margin: 0 }}>{t('schedTitle')}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="close">
            <IconClose size={14} />
          </button>
        </div>
        <p className="sched-lead">{t('schedLead')}</p>

        <div className="settings-card" style={{ marginBottom: 12 }}>
          <div className="settings-row">
            <div>
              <div className="settings-row-title">{t('schedBackgroundTitle')}</div>
              <div className="settings-row-hint">{t('schedBackgroundHint')}</div>
            </div>
            {backgroundSupported ? (
              <button type="button" className="btn btn-sm" disabled={backgroundBusy} onClick={() => void toggleBackground()}>
                {backgroundEnabled ? t('schedBackgroundDisable') : t('schedBackgroundEnable')}
              </button>
            ) : <span className="muted">{t('schedBackgroundUnavailable')}</span>}
          </div>
          {backgroundMsg ? <div className="settings-row-hint" style={{ marginTop: 6 }}>{backgroundMsg}</div> : null}
          {backgroundRuns.length ? (
            <div className="settings-row-hint" style={{ marginTop: 8 }}>
              <div>{t('schedBackgroundRecent')}</div>
              {backgroundRuns.slice(0, 3).map((run) => (
                <details key={`${run.jobId}-${run.startedAt}`} style={{ marginTop: 4 }}>
                  <summary>{`${run.title} · ${run.ok ? t('schedBackgroundSuccess') : t('schedBackgroundFailed')} · ${formatNextRun(run.startedAt)}`}</summary>
                  <pre style={{ maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{run.output || '—'}</pre>
                </details>
              ))}
            </div>
          ) : null}
        </div>

        <div className="sched-toolbar">
          <button
            type="button"
            className="btn primary"
            onClick={() => setCreating((v) => !v)}
          >
            {creating ? t('cancel') : t('schedCreate')}
          </button>
        </div>

        {creating ? (
          <div className="sched-form settings-card">
            <label className="field">
              <span>{t('schedFieldTitle')}</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('schedTitlePlaceholder')}
              />
            </label>
            <label className="field">
              <span>{t('schedFieldPrompt')}</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder={t('schedPromptPlaceholder')}
              />
            </label>
            <label className="field">
              <span>{t('schedFieldProject')}</span>
              <select value={projectPath} onChange={(e) => setProjectPath(e.target.value)}>
                <option value="">{t('projectPickerNoProject')}</option>
                {projects.map((p) => (
                  <option key={p} value={p}>
                    {projectDisplayName(p, aliases)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('schedFieldWhen')}</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as 'interval' | 'daily')}
              >
                <option value="daily">{t('schedKindDaily')}</option>
                <option value="interval">{t('schedKindInterval')}</option>
              </select>
            </label>
            {kind === 'interval' ? (
              <label className="field">
                <span>{t('schedIntervalMin')}</span>
                <input
                  type="number"
                  min={5}
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value) || 60)}
                />
              </label>
            ) : (
              <div className="field-row">
                <label className="field" style={{ flex: 1 }}>
                  <span>{t('schedHour')}</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={dailyHour}
                    onChange={(e) => setDailyHour(Number(e.target.value) || 0)}
                  />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span>{t('schedMinute')}</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={dailyMinute}
                    onChange={(e) => setDailyMinute(Number(e.target.value) || 0)}
                  />
                </label>
                <label className="field toggle-row" style={{ flex: 1.2 }}>
                  <span>{t('schedWeekdays')}</span>
                  <input
                    type="checkbox"
                    checked={weekdaysOnly}
                    onChange={(e) => setWeekdaysOnly(e.target.checked)}
                  />
                </label>
              </div>
            )}
            <button
              type="button"
              className="btn primary"
              disabled={!title.trim() || !prompt.trim()}
              onClick={submitCreate}
            >
              {t('schedSave')}
            </button>
          </div>
        ) : null}

        <h3 className="subhead">{t('schedSuggestions')}</h3>
        <div className="sched-suggestions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.title}
              type="button"
              className="sched-suggest-card"
              onClick={() => fromSuggestion(s)}
            >
              <strong>{s.title}</strong>
              <span>
                {s.kind === 'interval'
                  ? t('schedEveryN').replace('{n}', String(s.intervalMinutes))
                  : t('schedDailyAt')
                      .replace('{h}', String(s.dailyHour).padStart(2, '0'))
                      .replace('{m}', String(s.dailyMinute).padStart(2, '0'))}
                {s.weekdaysOnly ? ` · ${t('schedWeekdays')}` : ''}
              </span>
              <span className="muted">{s.prompt.slice(0, 72)}…</span>
            </button>
          ))}
        </div>

        <h3 className="subhead">{t('schedMyJobs')}</h3>
        {jobs.length === 0 ? (
          <p className="hint">{t('schedEmpty')}</p>
        ) : (
          <ul className="sched-list">
            {jobs.map((j) => (
              <li key={j.id} className={`sched-item${j.enabled ? '' : ' off'}`}>
                <div className="sched-item-main">
                  <div className="sched-item-title">{j.title}</div>
                  <div className="sched-item-meta">
                    {j.projectPath
                      ? projectDisplayName(j.projectPath, aliases)
                      : t('projectPickerNoProject')}
                    {' · '}
                    {j.kind === 'interval'
                      ? t('schedEveryN').replace('{n}', String(j.intervalMinutes))
                      : t('schedDailyAt')
                          .replace('{h}', String(j.dailyHour).padStart(2, '0'))
                          .replace('{m}', String(j.dailyMinute).padStart(2, '0'))}
                    {j.weekdaysOnly ? ` · ${t('schedWeekdays')}` : ''}
                  </div>
                  <div className="sched-item-meta">
                    {t('schedNext')}: {formatNextRun(j.nextRunAt)}
                    {j.lastRunAt
                      ? ` · ${t('schedLast')}: ${formatNextRun(j.lastRunAt)}`
                      : ''}
                  </div>
                  {j.failureCount > 0 ? (
                    <div className="sched-item-meta" style={{ color: 'var(--danger, #c33)' }}>
                      最近调度失败 {j.failureCount} 次{j.lastError ? `：${j.lastError.slice(0, 120)}` : ''}
                    </div>
                  ) : null}
                </div>
                <div className="sched-item-actions">
                  <button type="button" className="btn btn-sm" onClick={() => void runNow(j)}>
                    {t('schedRunNow')}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => toggle(j.id)}>
                    {j.enabled ? t('schedPause') : t('schedResume')}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => remove(j.id)}>
                    {t('schedDelete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="hint" style={{ marginTop: 12 }}>
          {t('schedFootnote')}
        </p>
      </div>
    </div>
  );
}
