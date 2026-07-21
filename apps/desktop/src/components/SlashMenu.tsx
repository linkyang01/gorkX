import { t } from '../lib/i18n';

export interface SlashMenuItem {
  name: string;
  description?: string;
  source: string;
}

interface Props {
  open: boolean;
  items: SlashMenuItem[];
  activeIndex: number;
  sourceLabel: (source: string) => string;
  onActiveIndex: (index: number) => void;
  onPick: (name: string) => void;
}

/** Presentation-only command picker. Command discovery and keyboard handling
 * remain in App so this component never advertises an engine capability itself. */
export function SlashMenu({
  open,
  items,
  activeIndex,
  sourceLabel,
  onActiveIndex,
  onPick,
}: Props) {
  if (!open) return null;
  const selected = items.length ? Math.min(activeIndex, items.length - 1) : 0;
  return (
    <div className="slash-menu" role="listbox" aria-label={t('slashHint')}>
      <div className="hint">{t('slashHintNav')}</div>
      {items.length === 0 ? (
        <div className="hint">{t('slashEmpty')}</div>
      ) : (
        items.map((item, index) => (
          <button
            key={`${item.source}:${item.name}`}
            type="button"
            role="option"
            aria-selected={index === selected}
            className={index === selected ? 'slash-item on' : 'slash-item'}
            ref={(element) => {
              if (index === selected && element) element.scrollIntoView({ block: 'nearest' });
            }}
            onMouseEnter={() => onActiveIndex(index)}
            onClick={() => onPick(item.name)}
          >
            <span className="mono">
              /{item.name}
              <span className="muted"> · {sourceLabel(item.source)}</span>
            </span>
            {item.description ? <span className="muted">{item.description}</span> : null}
          </button>
        ))
      )}
    </div>
  );
}
