import type { ChatLine } from './MessageList';
import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  lines: ChatLine[];
  onClose: () => void;
  onJump: (lineId: string) => void;
}

function preview(line: ChatLine): string {
  const clean = line.text.replace(/\s+/g, ' ').trim();
  if (clean) return clean.slice(0, 120) + (clean.length > 120 ? '…' : '');
  if (line.role === 'plan') return t('timelinePlan');
  if (line.role === 'workflow') return t('timelineWorkflow');
  if (line.role === 'scheduled') return t('timelineScheduled');
  return t('timelineUntitled');
}

function label(line: ChatLine): string {
  switch (line.role) {
    case 'user': return t('timelineUser');
    case 'assistant': return t('timelineAssistant');
    case 'plan': return t('timelinePlan');
    case 'workflow': return t('timelineWorkflow');
    case 'scheduled': return t('timelineScheduled');
    default: return t('timelineEvent');
  }
}

/** Local, read-only navigation for the mounted conversation. */
export function ConversationTimelinePanel({ open, lines, onClose, onJump }: Props) {
  if (!open) return null;
  const entries = lines.filter((line) =>
    line.role === 'user' || line.role === 'assistant' || line.role === 'plan' || line.role === 'workflow' || line.role === 'scheduled',
  );
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal conversation-timeline-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('timelineTitle')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 style={{ margin: 0 }}>{t('timelineTitle')}</h2>
            <p className="hint" style={{ margin: '4px 0 0' }}>{t('timelineHint')}</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label={t('timelineClose')}>×</button>
        </div>
        <div className="conversation-timeline-list">
          {entries.length ? entries.map((line, index) => (
            <button
              type="button"
              className="conversation-timeline-item"
              key={line.id}
              onClick={() => onJump(line.id)}
            >
              <span className="conversation-timeline-index">{index + 1}</span>
              <span className="conversation-timeline-copy">
                <span className="conversation-timeline-label">{label(line)}</span>
                <span className="conversation-timeline-preview">{preview(line)}</span>
              </span>
            </button>
          )) : (
            <div className="hint">{t('timelineEmpty')}</div>
          )}
        </div>
      </section>
    </div>
  );
}
