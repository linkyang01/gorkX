import { useCallback, useEffect, useState } from 'react';
import { worktreeGc, worktreeListJson, worktreeRemove } from '../lib/grokAdmin';
import { revealInFinder } from '../lib/host';
import { t } from '../lib/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  grokCmd: string;
  project?: string;
  /** Original main repo when currently inside a worktree path */
  mainProject?: string | null;
  onCreate: () => void;
  /** Switch the app project cwd to this worktree path */
  onOpenPath?: (path: string) => void;
  /** Start a new task whose cwd is this worktree */
  onOpenAsTask?: (path: string) => void;
  /** Leave worktree and restore main project folder */
  onBackToMain?: () => void;
}

function asObj(w: unknown): Record<string, unknown> {
  return w && typeof w === 'object' ? (w as Record<string, unknown>) : {};
}

function rowId(w: unknown): string {
  const o = asObj(w);
  return String(o.id ?? o.name ?? o.path ?? o.worktreePath ?? '');
}

function rowPath(w: unknown): string {
  const o = asObj(w);
  return String(o.path ?? o.worktreePath ?? o.dir ?? '').trim();
}

function rowBranch(w: unknown): string {
  const o = asObj(w);
  return String(o.branch ?? o.gitBranch ?? o.ref ?? '').trim();
}

function rowLabel(w: unknown): string {
  const path = rowPath(w);
  if (path) return path;
  const o = asObj(w);
  return String(o.name ?? o.id ?? JSON.stringify(w).slice(0, 80));
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/\/+$/, '');
  return Boolean(a) && Boolean(b) && norm(a) === norm(b);
}

export function WorktreePanel({
  open,
  onClose,
  grokCmd,
  project,
  mainProject,
  onCreate,
  onOpenPath,
  onOpenAsTask,
  onBackToMain,
}: Props) {
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

  const canBack =
    Boolean(mainProject && onBackToMain) &&
    Boolean(project) &&
    !samePath(project || '', mainProject || '');

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
        {project ? (
          <p className="hint mono" style={{ marginTop: 0 }}>
            {project}
          </p>
        ) : (
          <p className="hint">{t('worktreeNeedProject')}</p>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm primary-sm"
            disabled={!project}
            onClick={onCreate}
          >
            {t('createWorktreeMenu')}
          </button>
          <button type="button" className="btn btn-sm" disabled={loading} onClick={() => void refresh()}>
            {loading ? '…' : t('extRefresh')}
          </button>
          {canBack ? (
            <button
              type="button"
              className="btn btn-sm"
              title={t('worktreeBackMainHint')}
              onClick={() => {
                onBackToMain?.();
                onClose();
              }}
            >
              {t('worktreeBackMain')}
            </button>
          ) : null}
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
              const path = rowPath(w);
              const branch = rowBranch(w);
              const isCurrent = path && project ? samePath(path, project) : false;
              return (
                <div key={id} className="ext-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {branch ? (
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                        {branch}
                        {isCurrent ? (
                          <span className="muted" style={{ marginLeft: 8, fontWeight: 500 }}>
                            {t('worktreeCurrent')}
                          </span>
                        ) : null}
                      </div>
                    ) : isCurrent ? (
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                        {t('worktreeCurrent')}
                      </div>
                    ) : null}
                    <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                      {rowLabel(w)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                    {path ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        title={t('worktreeOpenFinderHint')}
                        onClick={() => void revealInFinder(path).catch(() => {})}
                      >
                        {t('worktreeOpenFinder')}
                      </button>
                    ) : null}
                    {path && onOpenPath ? (
                      <button
                        type="button"
                        className="btn btn-sm primary-sm"
                        title={t('worktreeUseHint')}
                        disabled={isCurrent}
                        onClick={() => {
                          onOpenPath(path);
                          onClose();
                        }}
                      >
                        {t('worktreeUse')}
                      </button>
                    ) : null}
                    {path && onOpenAsTask ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        title={t('worktreeOpenTaskHint')}
                        onClick={() => {
                          onOpenAsTask(path);
                          onClose();
                        }}
                      >
                        {t('worktreeOpenTask')}
                      </button>
                    ) : null}
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
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
