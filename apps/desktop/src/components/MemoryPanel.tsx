import { useCallback, useEffect, useState } from 'react';
import {
  appendMemoryNote,
  compactMemory,
  deleteMemoryFile,
  fetchMemoryStatus,
  forgetMemory,
  openMemoryDir,
  readMemoryFile,
  searchMemory,
  setMemoryAutoLearn,
  setMemoryEnabled,
  type MemorySearchHit,
  type MemoryStatus,
} from '../lib/memory';
import { memoryClear } from '../lib/grokAdmin';
import { t } from '../lib/i18n';
import { IconClose } from './UiIcons';

interface Props {
  open: boolean;
  onClose: () => void;
  project?: string;
  grokCmd?: string;
  /** Send a slash line into the active agent session when possible */
  onSendSlash?: (cmd: string) => void;
}

export function MemoryPanel({ open, onClose, project, grokCmd, onSendSlash }: Props) {
  const [st, setSt] = useState<MemoryStatus | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rememberDraft, setRememberDraft] = useState('');
  const [rememberOpen, setRememberOpen] = useState(false);
  const [forgetDraft, setForgetDraft] = useState('');
  const [forgetOpen, setForgetOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchHits, setSearchHits] = useState<MemorySearchHit[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const s = await fetchMemoryStatus(project);
      setSt(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [project]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      const next = await setMemoryEnabled(!st?.enabled);
      setSt(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (path: string) => {
    setSel(path);
    try {
      setBody(await readMemoryFile(path));
    } catch (e) {
      setBody(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal ext-modal"
        role="dialog"
        aria-label={t('memoryTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 style={{ margin: 0 }}>{t('memoryTitle')}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="close">
            <IconClose size={14} />
          </button>
        </div>
        <p className="text-prompt-msg">{t('memoryHint')}</p>
        {err ? <div className="hint">{err}</div> : null}
        <div className="field-row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={Boolean(st?.enabled)}
              disabled={busy || !st}
              onChange={() => void toggle()}
            />
            {st?.enabled ? t('memoryOn') : t('memoryOff')}
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }} title={t('memoryAutoLearnHint')}>
            <input
              type="checkbox"
              checked={Boolean(st?.autoLearn)}
              disabled={busy || !st || !st?.enabled}
              onChange={() => {
                setBusy(true);
                void setMemoryAutoLearn(!st?.autoLearn)
                  .then((s) => setSt(s))
                  .catch((e) => setErr(String(e)))
                  .finally(() => setBusy(false));
              }}
            />
            {t('memoryAutoLearn')}
          </label>
          <button type="button" className="btn btn-sm" onClick={() => void refresh()}>
            {t('kernelRefresh')}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => void openMemoryDir()}>
            {t('revealFinder')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => {
              if (!confirm(t('memoryClearConfirm'))) return;
              setBusy(true);
              void memoryClear('workspace', grokCmd, project)
                .then(() => refresh())
                .catch((e) => setErr(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            {t('memoryClearWorkspace')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => {
              if (!confirm(t('memoryClearConfirm'))) return;
              setBusy(true);
              void memoryClear('global', grokCmd)
                .then(() => refresh())
                .catch((e) => setErr(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            {t('memoryClearGlobal')}
          </button>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>
          {st?.note}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-sm"
            title={t('memoryFlushHint')}
            onClick={() => onSendSlash?.('/flush')}
            disabled={!onSendSlash}
          >
            {t('memoryFlush')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            title={t('memoryDreamHint')}
            onClick={() => onSendSlash?.('/dream')}
            disabled={!onSendSlash}
          >
            {t('memoryDream')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            title={t('memoryCompactHint')}
            disabled={busy}
            onClick={() => {
              if (!confirm(t('memoryCompactConfirm'))) return;
              setBusy(true);
              setErr(null);
              void compactMemory(project)
                .then((s) => {
                  setSt(s);
                  setMsg(t('memoryCompactOk'));
                  if (sel) void openFile(sel);
                })
                .catch((e) => setErr(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            {t('memoryCompact')}
          </button>
          <button
            type="button"
            className="btn btn-sm primary-sm"
            onClick={() => {
              setRememberOpen((v) => !v);
              setForgetOpen(false);
            }}
          >
            {t('memoryRemember')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setForgetOpen((v) => !v);
              setRememberOpen(false);
            }}
          >
            {t('memoryForget')}
          </button>
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>{t('memorySearch')}</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => {
                setSearchDraft(e.target.value);
                if (e.target.value.trim().length < 2) setSearchHits(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchDraft.trim().length >= 2) {
                  setBusy(true);
                  setErr(null);
                  void searchMemory(searchDraft.trim(), project)
                    .then((hits) => setSearchHits(hits))
                    .catch((e) => setErr(String(e)))
                    .finally(() => setBusy(false));
                }
              }}
              placeholder={t('memorySearchPlaceholder')}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy || searchDraft.trim().length < 2}
              onClick={() => {
                setBusy(true);
                setErr(null);
                void searchMemory(searchDraft.trim(), project)
                  .then((hits) => setSearchHits(hits))
                  .catch((e) => setErr(String(e)))
                  .finally(() => setBusy(false));
              }}
            >
              {t('memorySearch')}
            </button>
          </div>
          {searchHits ? (
            <div style={{ marginTop: 8 }}>
              <div className="hint" style={{ marginBottom: 6 }}>
                {searchHits.length === 0
                  ? t('memorySearchEmpty')
                  : t('memorySearchHits').replace('{n}', String(searchHits.length))}
              </div>
              {searchHits.length > 0 ? (
                <div
                  style={{
                    maxHeight: 140,
                    overflow: 'auto',
                    border: '1px solid var(--hairline)',
                    borderRadius: 8,
                    padding: 4,
                  }}
                >
                  {searchHits.map((h) => (
                    <button
                      key={`${h.path}:${h.lineNo}`}
                      type="button"
                      className={sel === h.path ? 'slash-item on' : 'slash-item'}
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => void openFile(h.path)}
                    >
                      <span className="mono">
                        {h.name}:{h.lineNo}
                      </span>
                      <span className="muted">
                        {h.scope} · {h.preview}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {msg ? <div className="hint" style={{ marginBottom: 8 }}>{msg}</div> : null}
        {st ? (
          <div className="hint" style={{ marginBottom: 10 }}>
            {t('memoryUsageLine')
              .replace('{user}', String(st.userChars ?? 0))
              .replace('{agent}', String(st.agentChars ?? 0))
              .replace('{project}', String(st.projectChars ?? 0))}
          </div>
        ) : null}
        {rememberOpen ? (
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t('memoryRememberPrompt')}</label>
            <input
              type="text"
              value={rememberDraft}
              onChange={(e) => setRememberDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && rememberDraft.trim()) {
                  const note = rememberDraft.trim();
                  setBusy(true);
                  void appendMemoryNote(project ? 'project' : 'user', note, project)
                    .then((s) => {
                      setSt(s);
                      setRememberDraft('');
                      setRememberOpen(false);
                      setMsg(t('memoryRememberOk'));
                      onSendSlash?.(`/remember ${note}`);
                    })
                    .catch((e) => setErr(String(e)))
                    .finally(() => setBusy(false));
                }
              }}
              placeholder={t('memoryRememberPlaceholder')}
            />
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-sm" onClick={() => setRememberOpen(false)}>
                {t('cancel')}
              </button>
              <button
                type="button"
                className="btn btn-sm primary-sm"
                disabled={!rememberDraft.trim() || busy}
                onClick={() => {
                  const note = rememberDraft.trim();
                  if (!note) return;
                  setBusy(true);
                  void appendMemoryNote(project ? 'project' : 'user', note, project)
                    .then((s) => {
                      setSt(s);
                      setRememberDraft('');
                      setRememberOpen(false);
                      setMsg(t('memoryRememberOk'));
                      onSendSlash?.(`/remember ${note}`);
                    })
                    .catch((e) => setErr(String(e)))
                    .finally(() => setBusy(false));
                }}
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        ) : null}
        {forgetOpen ? (
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t('memoryForgetPrompt')}</label>
            <input
              type="text"
              value={forgetDraft}
              onChange={(e) => setForgetDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && forgetDraft.trim().length >= 2) {
                  const q = forgetDraft.trim();
                  setBusy(true);
                  setErr(null);
                  void forgetMemory(q, 'all', project)
                    .then((r) => {
                      if (!r) return;
                      setSt(r.status);
                      setForgetDraft('');
                      setForgetOpen(false);
                      setMsg(
                        t('memoryForgetOk')
                          .replace('{n}', String(r.removedLines))
                          .replace('{files}', String(r.filesTouched.length)),
                      );
                      if (sel) void openFile(sel);
                    })
                    .catch((e) => setErr(String(e)))
                    .finally(() => setBusy(false));
                }
              }}
              placeholder={t('memoryForgetPlaceholder')}
            />
            <p className="hint" style={{ marginTop: 6 }}>
              {t('memoryForgetHint')}
            </p>
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-sm" onClick={() => setForgetOpen(false)}>
                {t('cancel')}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={forgetDraft.trim().length < 2 || busy}
                onClick={() => {
                  const q = forgetDraft.trim();
                  if (q.length < 2) return;
                  setBusy(true);
                  setErr(null);
                  void forgetMemory(q, 'all', project)
                    .then((r) => {
                      if (!r) return;
                      setSt(r.status);
                      setForgetDraft('');
                      setForgetOpen(false);
                      setMsg(
                        t('memoryForgetOk')
                          .replace('{n}', String(r.removedLines))
                          .replace('{files}', String(r.filesTouched.length)),
                      );
                      if (sel) void openFile(sel);
                    })
                    .catch((e) => setErr(String(e)))
                    .finally(() => setBusy(false));
                }}
              >
                {t('memoryForgetConfirm')}
              </button>
            </div>
          </div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12, minHeight: 240 }}>
          <div style={{ overflow: 'auto', border: '1px solid var(--hairline)', borderRadius: 10, padding: 8 }}>
            {(st?.files ?? []).length === 0 ? (
              <div className="hint">{t('memoryEmpty')}</div>
            ) : (
              st!.files.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  className={sel === f.path ? 'slash-item on' : 'slash-item'}
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => void openFile(f.path)}
                >
                  <span className="mono">{f.name}</span>
                  <span className="muted">
                    {f.scope} · {f.size} B
                  </span>
                </button>
              ))
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 8 }}>
            {sel ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => {
                    if (!sel || !confirm(t('memoryDeleteFileConfirm'))) return;
                    setBusy(true);
                    void deleteMemoryFile(sel)
                      .then((s) => {
                        setSt(s);
                        setSel(null);
                        setBody(null);
                        setMsg(t('memoryDeleteFileOk'));
                      })
                      .catch((e) => setErr(String(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  {t('memoryDeleteFile')}
                </button>
              </div>
            ) : null}
            <pre
              className="modal-body"
              style={{ margin: 0, maxHeight: 360, whiteSpace: 'pre-wrap', fontSize: 12, flex: 1 }}
            >
              {body ?? t('memoryPickFile')}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
