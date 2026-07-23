import type { ComposerAttachment } from '../lib/attachments';
import { t } from '../lib/i18n';

interface Props {
  items: ComposerAttachment[];
  onRemove?: (id: string) => void;
  onOpen: (a: ComposerAttachment) => void;
  /** compact chips in message bubble */
  compact?: boolean;
  /** Larger media-first presentation for an agent's returned content. */
  variant?: 'chips' | 'gallery';
}

export function AttachmentStrip({ items, onRemove, onOpen, compact, variant = 'chips' }: Props) {
  if (!items.length) return null;
  return (
    <div className={`${compact ? 'att-strip compact' : 'att-strip'}${variant === 'gallery' ? ' att-gallery' : ''}`}>
      {items.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`att-chip kind-${a.kind}`}
          title={a.path}
          onClick={() => onOpen(a)}
        >
          <span className="att-thumb">
            {a.kind === 'image' && a.previewUrl ? (
              <img src={a.previewUrl} alt={a.name} />
            ) : a.kind === 'video' ? (
              <span className="att-ico">▶</span>
            ) : a.kind === 'pdf' ? (
              <span className="att-ico">PDF</span>
            ) : a.kind === 'audio' ? (
              <span className="att-ico">♪</span>
            ) : (
              <span className="att-ico">📄</span>
            )}
          </span>
          <span className="att-name">{a.name}</span>
          {onRemove ? (
            <span
              className="att-x"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(a.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  onRemove(a.id);
                }
              }}
              title={t('removeAttachment')}
            >
              ×
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
