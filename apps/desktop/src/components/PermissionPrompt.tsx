import type { PermissionRequest } from '../lib/acpClient';
import { t } from '../lib/i18n';
import { humanPermissionOptionLabel, summarizePermissionTool } from '../lib/toolHuman';

interface Props {
  request: PermissionRequest;
  onAnswer: (optionId: string) => void;
}

/** Visible, per-tool ACP approval prompt. The App owns the agent response. */
export function PermissionPrompt({ request, onAnswer }: Props) {
  const summary = summarizePermissionTool(request.toolCall ?? request.raw);
  const extraOptions = (request.options ?? []).filter((option) => {
    // Avoid duplicating the standard allow/reject affordances with engine labels.
    const id = option.optionId.toLowerCase();
    return !/allow-once|allow_once|^allow$|reject-once|reject_once|^reject$/.test(id);
  });

  return (
    <div className="modal-backdrop">
      <div className="modal perm-modal">
        <h2>{t('permissionTitle')}</h2>
        <p className="perm-explain">{t('permissionExplain')}</p>
        <div className="perm-summary">
          <div className="perm-kind">{summary.kindLabel}</div>
          <div className="perm-title">{summary.title}</div>
          {summary.description ? <p className="perm-desc">{summary.description}</p> : null}
          {summary.command ? (
            <div className="perm-cmd-block">
              <div className="perm-cmd-label">{t('permissionCommand')}</div>
              <pre className="perm-cmd">{summary.command}</pre>
            </div>
          ) : null}
          <details className="perm-raw">
            <summary>{t('permissionShowRaw')}</summary>
            <pre>{JSON.stringify(request.toolCall ?? request.raw, null, 2)}</pre>
          </details>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={() => onAnswer('allow')}>
            {t('allow')}
          </button>
          <button type="button" className="btn" onClick={() => onAnswer('reject')}>
            {t('reject')}
          </button>
          {extraOptions.map((option) => (
            <button
              key={option.optionId}
              type="button"
              className="btn"
              onClick={() => onAnswer(option.optionId)}
            >
              {humanPermissionOptionLabel(option.name, option.optionId)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
