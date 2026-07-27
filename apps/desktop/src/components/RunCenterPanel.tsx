import { t } from '../lib/i18n';
import type { TaskRunPhase } from '../lib/taskRunStatus';

export interface RunCenterRow {
  threadId: string;
  title: string;
  projectLabel?: string;
  phase: TaskRunPhase;
  stepLabel: string | null;
  stalled?: boolean;
}

interface Props {
  rows: RunCenterRow[];
  activeId: string | null;
  onSelect: (threadId: string) => void;
}

function phaseLabel(phase: TaskRunPhase): string {
  switch (phase) {
    case 'running':
      return t('runPhaseRunning');
    case 'awaiting_decision':
      return t('runPhaseAwaiting');
    case 'failed':
      return t('runPhaseFailed');
    case 'idle':
      return t('runPhaseIdle');
  }
}

/**
 * Cross-task run center: only real ACP-backed non-idle tasks.
 * Click returns to the original task; no fabricated concurrency counts.
 */
export function RunCenterPanel({ rows, activeId, onSelect }: Props) {
  if (!rows.length) {
    return <div className="hint run-center-empty">{t('runCenterEmpty')}</div>;
  }
  return (
    <div className="run-center-list" role="list" aria-label={t('runCenterTitle')}>
      {rows.map((row) => (
        <button
          key={row.threadId}
          type="button"
          role="listitem"
          className={`run-center-row phase-${row.phase}${row.threadId === activeId ? ' active' : ''}${row.stalled ? ' stalled' : ''}`}
          onClick={() => onSelect(row.threadId)}
          title={row.stepLabel || row.title}
        >
          <span className={`run-phase-badge phase-${row.phase}`}>{phaseLabel(row.phase)}</span>
          <span className="run-center-title">{row.title}</span>
          {row.stepLabel ? <span className="run-center-step">{row.stepLabel}</span> : null}
          {row.projectLabel ? <span className="run-center-project">{row.projectLabel}</span> : null}
          {row.stalled ? <span className="run-center-stall">{t('runStalledBadge')}</span> : null}
        </button>
      ))}
    </div>
  );
}
