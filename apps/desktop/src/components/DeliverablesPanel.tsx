import { useMemo } from 'react';
import type { ComposerAttachment } from '../lib/attachments';
import {
  buildDeliverableSummary,
  groupDeliverables,
  indexDeliverables,
  type DeliverableCategory,
  type DeliverableItem,
} from '../lib/deliverables';
import { AttachmentStrip } from './AttachmentStrip';
import { IconClose } from './UiIcons';
import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  items: ComposerAttachment[];
  /** Optional external links returned by ACP (non-file resource links). */
  links?: { id: string; href: string; name?: string }[];
  taskTitle?: string;
  onClose: () => void;
  onOpen: (item: ComposerAttachment) => void;
  onReveal: (path: string) => void;
  onCopySummary: (text: string) => void | Promise<void>;
  onExportTask?: () => void | Promise<void>;
  canExport?: boolean;
}

function categoryLabel(cat: DeliverableCategory): string {
  switch (cat) {
    case 'file':
      return t('deliverablesCatFiles');
    case 'link':
      return t('deliverablesCatLinks');
    case 'change':
      return t('deliverablesCatChanges');
  }
}

function toAttachment(item: DeliverableItem): ComposerAttachment {
  return {
    id: item.id,
    path: item.path,
    name: item.name,
    kind: item.kind === 'link' ? 'file' : item.kind,
    size: item.size,
    previewUrl: item.previewUrl,
    href: item.href,
  };
}

/**
 * Conservative deliverables workspace: only ACP-surfaced, validated results.
 * Never scans the project to guess outputs.
 */
export function DeliverablesPanel({
  open,
  items,
  links = [],
  taskTitle,
  onClose,
  onOpen,
  onReveal,
  onCopySummary,
  onExportTask,
  canExport = false,
}: Props) {
  const indexed = useMemo(() => indexDeliverables(items, links), [items, links]);
  const groups = useMemo(() => groupDeliverables(indexed), [indexed]);
  const summary = useMemo(
    () => buildDeliverableSummary(indexed, { taskTitle }),
    [indexed, taskTitle],
  );

  if (!open) return null;

  const order: DeliverableCategory[] = ['change', 'file', 'link'];
  const sections = order
    .map((category) => ({ category, list: groups[category] }))
    .filter((s) => s.list.length > 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal ext-modal deliverables-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('deliverablesTitle')}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 style={{ margin: 0 }}>{t('deliverablesTitle')}</h2>
            <p className="text-prompt-msg" style={{ margin: '5px 0 0' }}>
              {t('deliverablesHint')}
            </p>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label={t('userQuestionCancel')}>
            <IconClose size={14} />
          </button>
        </header>

        {indexed.length ? (
          <>
            <div className="deliverables-actions">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void onCopySummary(summary)}
                title={t('deliverablesCopySummaryHint')}
              >
                {t('deliverablesCopySummary')}
              </button>
              {indexed.some((i) => i.path) ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    const first = indexed.find((i) => i.path);
                    if (first?.path) onReveal(first.path);
                  }}
                  title={t('deliverablesRevealHint')}
                >
                  {t('revealFinder')}
                </button>
              ) : null}
              {canExport && onExportTask ? (
                <button
                  type="button"
                  className="btn btn-sm primary-sm"
                  onClick={() => void onExportTask()}
                  title={t('deliverablesExportHint')}
                >
                  {t('exportSession')}
                </button>
              ) : null}
            </div>

            <div className="deliverables-list">
              {sections.map(({ category, list }) => (
                <section className="deliverables-group" key={category} aria-label={categoryLabel(category)}>
                  <h3>
                    {categoryLabel(category)} <span>{list.length}</span>
                  </h3>
                  {category === 'link' ? (
                    <ul className="deliverables-link-list">
                      {list.map((item) => (
                        <li key={item.id}>
                          <a
                            className="deliverables-link"
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            title={item.href}
                          >
                            {item.name}
                          </a>
                          <span className="deliverables-link-url">{item.href}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <AttachmentStrip
                      items={list.map(toAttachment)}
                      onOpen={(att) => onOpen(att)}
                      variant="gallery"
                    />
                  )}
                </section>
              ))}
            </div>
          </>
        ) : (
          <p className="muted" style={{ margin: '18px 0 4px' }}>
            {t('deliverablesEmpty')}
          </p>
        )}
      </section>
    </div>
  );
}
