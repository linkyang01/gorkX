import { useEffect, useState } from 'react';
import { fetchGitSnapshot, type GitSnapshot } from '../lib/git';
import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  cwd: string;
  onClose: () => void;
}

export function DiffPanel({ open, cwd, onClose }: Props) {
  const [snap, setSnap] = useState<GitSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    if (!cwd) return;
    setLoading(true);
    void fetchGitSnapshot(cwd)
      .then(setSnap)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open && cwd) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cwd]);

  if (!open) return null;

  return (
    <aside className="diff-panel">
      <div className="diff-head">
        <div>
          <div className="block-title">{t('diffTitle')}</div>
          <div className="muted">
            {loading
              ? '…'
              : snap?.ok
                ? `${snap.branch}${snap.dirty ? ' · dirty' : ' · clean'}`
                : snap?.error || '—'}
          </div>
        </div>
        <div className="diff-actions">
          <button type="button" className="btn btn-sm" onClick={refresh} disabled={loading}>
            ↻
          </button>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      {snap?.ok && snap.files.length > 0 ? (
        <div className="diff-files">
          {snap.files.map((f) => (
            <div key={f.path} className="diff-file">
              <span className="diff-st">{f.status}</span>
              <span className="mono">{f.path}</span>
            </div>
          ))}
        </div>
      ) : null}

      <pre className="diff-body mono">
        {snap?.diff?.trim()
          ? snap.diff
          : snap?.ok
            ? t('diffClean')
            : snap?.error || ''}
      </pre>
    </aside>
  );
}
