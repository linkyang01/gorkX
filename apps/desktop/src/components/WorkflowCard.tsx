import type { WorkflowRunUpdate } from '../lib/acpClient';
import { t } from '../lib/i18n';

function elapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function statusClass(status: string) {
  if (/complete|success|done/.test(status)) return 'done';
  if (/fail|error|interrupt/.test(status)) return 'failed';
  if (/pause/.test(status)) return 'paused';
  return 'running';
}

/** Live, read-only view of a Grok Build workflow update. */
export function WorkflowCard({
  workflow,
  fallback,
  onAction,
  actionDisabled = false,
}: {
  workflow?: WorkflowRunUpdate;
  fallback?: string;
  onAction?: (action: 'pause' | 'resume') => void;
  actionDisabled?: boolean;
}) {
  if (!workflow) {
    return <div className="workflow-card workflow-card-restored">{fallback || t('workflowTitle')}</div>;
  }
  const progress = workflow.phases.length
    ? Math.round((workflow.phases.filter((phase) => /complete|done|success/.test(phase.state)).length / workflow.phases.length) * 100)
    : null;
  const budget = workflow.agentBudget != null
    ? `${workflow.agentsUsed}/${workflow.agentBudget}`
    : String(workflow.agentsUsed);
  const canManage = Boolean(onAction) && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(workflow.name);
  const canResume = /paused|failed|interrupted/.test(workflow.status);
  return (
    <section className={`workflow-card workflow-${statusClass(workflow.status)}`} aria-label={t('workflowTitle')}>
      <div className="workflow-card-head">
        <div>
          <div className="workflow-card-kicker">{t('workflowTitle')}</div>
          <strong>{workflow.name}</strong>
        </div>
        <span className="workflow-status">{workflow.status}</span>
      </div>
      {workflow.objective ? <p className="workflow-objective">{workflow.objective}</p> : null}
      <div className="workflow-metrics">
        <span>{t('workflowActiveAgents').replace('{count}', String(workflow.activeAgents))}</span>
        <span>{t('workflowAgentBudget').replace('{budget}', budget)}</span>
        <span>{elapsed(workflow.elapsedMs)}</span>
      </div>
      {workflow.phases.length ? (
        <ol className="workflow-phases">
          {workflow.phases.map((phase) => (
            <li key={`${phase.title}-${phase.state}`} className={phase.state}>
              <span className="workflow-phase-dot" />
              <span>{phase.title}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {progress != null ? <div className="workflow-progress" aria-label={`${progress}%`}><i style={{ width: `${progress}%` }} /></div> : null}
      {workflow.agents.length ? (
        <div className="workflow-agents">
          {workflow.agents.slice(0, 8).map((agent) => (
            <div key={agent.id} className={`workflow-agent ${statusClass(agent.state)}`}>
              <span className="workflow-agent-dot" />
              <span>{agent.label}</span>
              <small>{agent.phase || agent.state}</small>
            </div>
          ))}
        </div>
      ) : null}
      {workflow.pauseMessage ? <p className="workflow-note">{workflow.pauseMessage}</p> : null}
      {workflow.resultSummary ? <p className="workflow-result">{workflow.resultSummary}</p> : null}
      {canManage ? (
        <div className="workflow-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={actionDisabled || /complete|success|done|cancelled/.test(workflow.status)}
            onClick={() => onAction?.(canResume ? 'resume' : 'pause')}
          >
            {canResume ? t('workflowResume') : t('workflowPause')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
