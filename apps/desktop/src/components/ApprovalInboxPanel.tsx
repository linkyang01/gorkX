import { t } from '../lib/i18n';
import { IconClose } from './UiIcons';

export type ApprovalInboxKind = 'permission' | 'question' | 'plan' | 'trust';

export interface ApprovalInboxRow {
  key: string;
  kind: ApprovalInboxKind;
  threadId: string;
  threadTitle: string;
  projectLabel?: string;
  title: string;
  detail?: string;
  createdAt: number;
}

interface Props {
  open: boolean;
  rows: ApprovalInboxRow[];
  activeKey: string | null;
  onClose: () => void;
  onSelect: (key: string) => void;
}

function kindLabel(kind: ApprovalInboxKind): string {
  switch (kind) {
    case 'permission': return t('approvalInboxPermission');
    case 'question': return t('approvalInboxQuestion');
    case 'plan': return t('approvalInboxPlan');
    case 'trust': return t('approvalInboxTrust');
  }
}

/**
 * Live-only cross-task queue. It never fabricates a deferred approval: every
 * row represents an outstanding request from a connected ACP session.
 */
export function ApprovalInboxPanel({ open, rows, activeKey, onClose, onSelect }: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal ext-modal approval-inbox" role="dialog" aria-modal="true" aria-label={t('approvalInboxTitle')} onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 style={{ margin: 0 }}>{t('approvalInboxTitle')}</h2>
            <p className="text-prompt-msg" style={{ margin: '5px 0 0' }}>{t('approvalInboxHint')}</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label={t('userQuestionCancel')}><IconClose size={14} /></button>
        </header>
        {rows.length ? (
          <div className="approval-inbox-list">
            {rows.map((row) => (
              <button
                type="button"
                key={row.key}
                className={`approval-inbox-row${row.key === activeKey ? ' active' : ''}`}
                onClick={() => onSelect(row.key)}
              >
                <span className="approval-inbox-kind">{kindLabel(row.kind)}</span>
                <strong>{row.title}</strong>
                {row.detail ? <span className="approval-inbox-detail">{row.detail}</span> : null}
                <span className="approval-inbox-task">{row.threadTitle}{row.projectLabel ? ` · ${row.projectLabel}` : ''}</span>
              </button>
            ))}
          </div>
        ) : <p className="muted" style={{ margin: '18px 0 4px' }}>{t('approvalInboxEmpty')}</p>}
      </section>
    </div>
  );
}
