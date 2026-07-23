import { useCallback, useEffect, useState } from 'react';
import { inspectProject } from '../lib/grokAdmin';
import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  project: string | null;
  grokCmd: string;
  onClose: () => void;
}

function prettyInspection(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** Read-only `grok inspect --json` surface for the selected project. */
export function ProjectInspectPanel({ open, project, grokCmd, onClose }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      setValue(prettyInspection(await inspectProject(project, grokCmd || undefined)));
    } catch (e) {
      setValue('');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [grokCmd, project]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal ext-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('projectInspectTitle')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 style={{ margin: 0 }}>{t('projectInspectTitle')}</h2>
            <div className="muted mono path-wrap" style={{ fontSize: 11, marginTop: 4 }}>{project || '—'}</div>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label={t('projectInspectTitle')}>
            ×
          </button>
        </div>
        <p className="text-prompt-msg">{t('projectInspectHint')}</p>
        <div className="ext-toolbar" style={{ marginBottom: 10 }}>
          <button type="button" className="btn btn-sm" disabled={loading || !project} onClick={() => void load()}>
            {loading ? t('projectInspectLoading') : t('extRefresh')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!value}
            onClick={() => {
              void navigator.clipboard.writeText(value).then(() => setCopied(true)).catch(() => setCopied(false));
            }}
          >
            {copied ? t('projectInspectCopied') : t('projectInspectCopy')}
          </button>
        </div>
        {error ? <pre className="ext-msg">{error}</pre> : null}
        {!error && !loading && !value ? <div className="hint">{t('projectInspectEmpty')}</div> : null}
        {value ? <pre className="ext-msg project-inspect-result">{value}</pre> : null}
      </section>
    </div>
  );
}
