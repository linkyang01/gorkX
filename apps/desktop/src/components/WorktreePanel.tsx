import { useCallback, useEffect, useState } from 'react';
import { worktreeGc, worktreeListJson, worktreeRemove } from '../lib/grokAdmin';
import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  grokCmd: string;
  project?: string;
  onCreate: () => void;
}

function rowId(w: unknown): string {
  if (!w || typeof w !== 'object') return '';
  const o = w as Record<string, unknown>;
  return String(o.id ?? o.name ?? o.path ?? o.worktreePath ?? '');
}

function rowLabel(w: unknown): string {
  if (!w || typeof w !== 'object') return String(w);
  const o = w as Record<string, unknown>;
  return String(o.path ?? o.worktreePath ?? o.name ?? o.id ?? JSON.stringify(o).slice(0, 80));
}

export function WorktreePanel({ open, onClose, grokCmd, project, onCreate }: Props) {
  const [rows, setRows] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const list = await worktreeListJson(grokCmd || undefined, project || undefined);
      setRows(list);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [grokCmd, project]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal ext-modal"
        role="dialog"
        aria-label={t('worktreeManage')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 style={{ margin: 0 }}>{t('worktreeManage')}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="text-prompt-msg">{t('worktreeManageHint')}</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm primary-sm" onClick={onCreate}>
            {t('createWorktreeMenu')}
          </button>
          <button type="button" className="btn btn-sm" disabled={loading} onClick={() => void refresh()}>
            {loading ? '…' : t('extRefresh')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              void worktreeGc(grokCmd || undefined)
                .then((s) => {
                  setMsg(s);
                  return refresh();
                })
                .catch((e) => setMsg(String(e)))
                .finally(() => setLoading(false));
            }}
          >
            {t('worktreeGc')}
          </button>
        </div>
        {msg ? <pre className="ext-msg">{msg}</pre> : null}
        <div className="ext-list" style={{ maxHeight: 400, overflow: 'auto' }}>
          {rows.length === 0 ? (
            <div className="hint">{t('worktreeEmpty')}</div>
          ) : (
            rows.map((w, i) => {
              const id = rowId(w) || String(i);
              return (
                <div key={id} className="ext-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                      {rowLabel(w)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      if (!confirm(t('worktreeRmConfirm'))) return;
                      const rid = rowId(w);
                      if (!rid) return;
                      setLoading(true);
                      void worktreeRemove([rid], grokCmd || undefined, true)
                        .then((s) => {
                          setMsg(s);
                          return refresh();
                        })
                        .catch((e) => setMsg(String(e)))
                        .finally(() => setLoading(false));
                    }}
                  >
                    {t('worktreeRm')}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
