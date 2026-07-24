import { useEffect, useRef, useState } from 'react';
import { projectDisplayName } from '../lib/projects';
import { searchThreadHistory, type ThreadSearchHit } from '../lib/threads';
import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  aliases: Record<string, string>;
  onClose: () => void;
  onOpenTask: (hit: ThreadSearchHit) => void;
}

/** Local task/history search. No model request, project scan, or network call. */
export function TaskSearchDialog({ open, aliases, onClose, onOpenTask }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ThreadSearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const needle = query.trim();
    if (!needle) {
      setHits(null);
      setBusy(false);
      return;
    }
    setHits(null);
    setBusy(true);
    const handle = window.setTimeout(() => {
      void searchThreadHistory(needle)
        .then(setHits)
        .finally(() => setBusy(false));
    }, 160);
    return () => window.clearTimeout(handle);
  }, [open, query]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('taskSearchAll')}
        style={{ maxWidth: 680 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{t('taskSearchAll')}</h2>
            <p className="hint" style={{ margin: '4px 0 0' }}>{t('taskSearchAllHint')}</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label={t('cancel')}>×</button>
        </div>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('taskSearchAllPlaceholder')}
          aria-label={t('taskSearchAllPlaceholder')}
          style={{ width: '100%', boxSizing: 'border-box', marginTop: 12 }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'Enter' && hits?.[0]) onOpenTask(hits[0]);
          }}
        />
        <div style={{ marginTop: 12, maxHeight: '52vh', overflow: 'auto' }}>
          {!query.trim() ? <p className="hint">{t('taskSearchAllStart')}</p> : null}
          {busy ? <p className="hint">{t('reviewLoading')}</p> : null}
          {!busy && hits?.length === 0 ? <p className="hint">{t('taskSearchAllEmpty')}</p> : null}
          {hits?.map((hit) => {
            const project = hit.project === '__none__' ? t('noProjectInbox') : projectDisplayName(hit.project, aliases);
            return (
              <button
                type="button"
                key={`${hit.project}:${hit.id}`}
                className="slash-item"
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px' }}
                onClick={() => onOpenTask(hit)}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hit.title || t('newThread')}</strong>
                  {hit.archived ? <span className="hint" style={{ flex: '0 0 auto' }}>{t('taskSearchArchived')}</span> : null}
                </div>
                <div className="hint" style={{ marginTop: 3 }}>{project}</div>
                {hit.excerpt ? <div className="hint" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{hit.excerpt}</div> : null}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
