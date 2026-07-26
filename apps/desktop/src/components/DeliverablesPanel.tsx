import type { AttachKind, ComposerAttachment } from '../lib/attachments';
import { AttachmentStrip } from './AttachmentStrip';
import { IconClose } from './UiIcons';
import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  items: ComposerAttachment[];
  onClose: () => void;
  onOpen: (item: ComposerAttachment) => void;
}

type DeliverableGroup = 'document' | 'image' | 'media' | 'other';

function groupOf(kind: AttachKind): DeliverableGroup {
  if (kind === 'text' || kind === 'pdf') return 'document';
  if (kind === 'image') return 'image';
  if (kind === 'video' || kind === 'audio') return 'media';
  return 'other';
}

const groupOrder: DeliverableGroup[] = ['document', 'image', 'media', 'other'];

function groupLabel(group: DeliverableGroup) {
  switch (group) {
    case 'document': return t('deliverablesDocuments');
    case 'image': return t('deliverablesImages');
    case 'media': return t('deliverablesMedia');
    case 'other': return t('deliverablesFiles');
  }
}

/**
 * A conservative deliverables view: it lists only media/files explicitly
 * delivered by the agent in this task. It never scans the project to infer
 * outputs that the agent did not surface.
 */
export function DeliverablesPanel({ open, items, onClose, onOpen }: Props) {
  if (!open) return null;
  const groups = groupOrder.flatMap((group) => {
    const groupItems = items.filter((item) => groupOf(item.kind) === group);
    return groupItems.length ? [{ group, items: groupItems }] : [];
  });
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
            {groups.map(({ group, items: groupItems }) => (
              <section className="deliverables-group" key={group} aria-label={groupLabel(group)}>
                <h3>{groupLabel(group)} <span>{groupItems.length}</span></h3>
                <AttachmentStrip items={groupItems} onOpen={onOpen} variant="gallery" />
              </section>
            ))}
          </div>
        ) : <p className="muted" style={{ margin: '18px 0 4px' }}>{t('deliverablesEmpty')}</p>}
      </section>
    </div>
  );
}
