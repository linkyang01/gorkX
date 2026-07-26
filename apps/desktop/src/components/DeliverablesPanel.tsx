import type { ComposerAttachment } from '../lib/attachments';
import { AttachmentStrip } from './AttachmentStrip';
import { IconClose } from './UiIcons';
import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  items: ComposerAttachment[];
  onClose: () => void;
  onOpen: (item: ComposerAttachment) => void;
}

/**
 * A conservative deliverables view: it lists only media/files explicitly
 * delivered by the agent in this task. It never scans the project to infer
 * outputs that the agent did not surface.
 */
export function DeliverablesPanel({ open, items, onClose, onOpen }: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal ext-modal deliverables-panel" role="dialog" aria-modal="true" aria-label={t('deliverablesTitle')} onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 style={{ margin: 0 }}>{t('deliverablesTitle')}</h2>
            <p className="text-prompt-msg" style={{ margin: '5px 0 0' }}>{t('deliverablesHint')}</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label={t('userQuestionCancel')}><IconClose size={14} /></button>
        </header>
        {items.length ? (
          <div className="deliverables-list">
            <AttachmentStrip items={items} onOpen={onOpen} variant="gallery" />
          </div>
        ) : <p className="muted" style={{ margin: '18px 0 4px' }}>{t('deliverablesEmpty')}</p>}
      </section>
    </div>
  );
}
