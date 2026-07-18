import { useCallback, useEffect, useState } from 'react';
import {
  sessionsList,
  sessionsSearch,
  type CliSessionRow,
} from '../lib/grokAdmin';
import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  grokCmd: string;
  onResume: (sessionId: string, title?: string) => void;
}

/** Full kernel session browser: list / search / resume (grok sessions CLI). */
export function KernelSessionsPanel({ open, onClose, grokCmd, onResume }: Props) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<CliSessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = q.trim()
        ? await sessionsSearch(q.trim(), grokCmd || undefined, 48)
        : await sessionsList(grokCmd || undefined, 48);
      setRows(r.rows);
      if (!r.rows.length && r.raw) setErr(r.raw.slice(0, 400));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [grokCmd, q]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal ext-modal"
        role="dialog"
        aria-label={t('kernelSessionsTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 style={{ margin: 0 }}>{t('kernelSessionsTitle')}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="text-prompt-msg">{t('kernelSessionsHint')}</p>
        <div className="ext-toolbar" style={{ marginBottom: 10 }}>
          <input
            className="ext-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('kernelSessionsSearch')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load();
            }}
          />
          <button type="button" className="btn btn-sm" disabled={loading} onClick={() => void load()}>
            {loading ? '…' : t('extRefresh')}
          </button>
        </div>
        {err ? <pre className="ext-msg">{err}</pre> : null}
        <div className="ext-list" style={{ maxHeight: 420, overflow: 'auto' }}>
          {rows.length === 0 && !loading ? (
            <div className="hint">{t('kernelSessionsEmpty')}</div>
          ) : (
            rows.map((r) => (
              <div key={r.sessionId} className="ext-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="thread-title" style={{ whiteSpace: 'normal' }}>
                    {r.summary}
                  </div>
                  <div className="muted mono" style={{ fontSize: 11 }}>
                    {r.sessionId.slice(0, 13)}… · {r.updated || r.created || ''} · {r.status || ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm primary-sm"
                  onClick={() => {
                    onResume(r.sessionId, r.summary);
                    onClose();
                  }}
                >
                  {t('resumeSession')}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
