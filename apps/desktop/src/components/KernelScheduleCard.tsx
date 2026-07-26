import type { KernelScheduledTaskUpdate } from '../lib/acpClient';
import { t } from '../lib/i18n';

function formatDate(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

/** Bounded projection of a scheduler task the active Grok Build session owns. */
export function KernelScheduleCard({
  task,
  onDelete,
  deleteDisabled = false,
}: {
  task?: KernelScheduledTaskUpdate;
  onDelete?: (task: KernelScheduledTaskUpdate) => void;
  deleteDisabled?: boolean;
}) {
  if (!task) return null;
  const status = task.status === 'fired' ? t('kernelScheduleFired') : t('kernelScheduleActive');
  return (
    <section className="kernel-schedule-card" aria-label={t('kernelScheduleTitle')}>
      <div className="kernel-schedule-head">
        <div>
          <div className="kernel-schedule-kicker">{t('kernelScheduleTitle')}</div>
          <strong>{task.humanSchedule}</strong>
        </div>
        <span className={`kernel-schedule-status ${task.status}`}>{status}</span>
      </div>
      <p className="kernel-schedule-prompt">{task.prompt}</p>
      {task.nextFireAt ? <small>{t('kernelScheduleNext').replace('{time}', formatDate(task.nextFireAt))}</small> : null}
      {task.subagentId ? <small>{t('kernelScheduleRunning')}</small> : null}
      {onDelete ? (
        <div className="kernel-schedule-actions">
          <button type="button" className="btn btn-sm" disabled={deleteDisabled} onClick={() => onDelete(task)}>
            {t('kernelScheduleCancel')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
