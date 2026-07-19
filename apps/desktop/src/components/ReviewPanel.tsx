import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { fetchGitSnapshot, type GitSnapshot } from '../lib/git';
import { revealInFinder } from '../lib/host';
import { t } from '../lib/i18n';
import type { ToolEvent } from './ToolTimeline';
import type { PlanEntry } from '../lib/acpClient';
import {
  humanFileName,
  humanPlanStatus,
  humanPlanText,
  humanToolStatus,
  humanToolTitle,
} from '../lib/toolHuman';
import { IconClose, IconRefresh } from './UiIcons';

type Tab = 'diff' | 'plan' | 'tools';

/** Porcelain-ish status → short Chinese label for the file list. */
function gitStatusLabel(st: string): string {
  const s = (st || '').trim();
  if (s === 'WS') return t('gitStatusWorkspace');
  if (!s || s === '??') return t('gitStatusUntracked');
  if (s.includes('A') || s === 'A ') return t('gitStatusAdded');
  if (s.includes('D')) return t('gitStatusDeleted');
  if (s.includes('R')) return t('gitStatusRenamed');
  if (s.includes('M') || s.includes('U')) return t('gitStatusModified');
  return t('gitStatusModified');
}

/** Soften raw git/engine errors for the review header. */
function humanRepoSubtitle(
  loading: boolean,
  snap: GitSnapshot | null,
  cwd: string,
): string {
  if (loading) return t('reviewLoading');
  if (!cwd) return t('reviewNeedProject');
  const folder = cwd.split('/').filter(Boolean).pop() || cwd;
  if (!snap) return folder;
  if (snap.ok) {
    if (snap.isGit === false) {
      return `${folder} · ${t('reviewWorkspace')}${
        snap.files.length ? ` · ${snap.files.length}` : ''
      }`;
    }
    const branch = snap.branch || 'HEAD';
    return snap.dirty
      ? `${folder} · ${branch} · ${t('gitDirty')}`
      : `${folder} · ${branch} · ${t('gitClean')}`;
  }
  const err = (snap.error || '').toLowerCase();
  if (err.includes('git') || err.includes('不是') || err.includes('not a git')) {
    return `${folder} · ${t('reviewNotGit')}`;
  }
  if (snap.error) return `${folder} · ${snap.error}`;
  return folder;
}

interface Props {
  open: boolean;
  cwd: string;
  tools: ToolEvent[];
  planEntries: PlanEntry[];
  onClose: () => void;
  onApplyPlan?: () => void;
  onTogglePlanEntry?: (entryId: string) => void;
  onToggleAllPlan?: (checked: boolean) => void;
}

export function ReviewPanel({
  open,
  cwd,
  tools,
  planEntries,
  onClose,
  onApplyPlan,
  onTogglePlanEntry,
  onToggleAllPlan,
}: Props) {
  const [tab, setTab] = useState<Tab>('diff');
  const [snap, setSnap] = useState<GitSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<string>('');
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = () => {
    if (!cwd) {
      setSnap(null);
      return;
    }
    setLoading(true);
    void fetchGitSnapshot(cwd)
      .then((s) => {
        setSnap(s);
        if (s.files.length && !selected) setSelected(s.files[0].path);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open && cwd) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cwd]);

  useEffect(() => {
    if (!open || !cwd || !selected) {
      setFileDiff('');
      return;
    }
    const isWs = Boolean(snap?.ok && snap.isGit === false);
    if (isWs) {
      // Non-git: read-only file preview (first lines), not a fake diff
      void invoke<string>('read_workspace_file_preview', { cwd, path: selected, maxLines: 120 })
        .then((text) => setFileDiff(text || ''))
        .catch(() => {
          // Fallback: try absolute path join via git_file_diff errors as plain text
          void invoke<string>('git_file_diff', { cwd, path: selected })
            .then(setFileDiff)
            .catch((e) => setFileDiff(String(e)));
        });
      return;
    }
    void invoke<string>('git_file_diff', { cwd, path: selected })
      .then(setFileDiff)
      .catch((e) => setFileDiff(String(e)));
  }, [open, cwd, selected, snap?.diff, snap?.ok, snap?.isGit]);

  const diffSrc = selected ? fileDiff : snap?.diff || '';
  const colored = useMemo(() => {
    const src = diffSrc;
    if (!src.trim()) return null;
    return src.split('\n').map((line, i) => {
      let cls = 'diff-line';
      let display = line;
      if (line.startsWith('+') && !line.startsWith('+++')) cls += ' add';
      else if (line.startsWith('-') && !line.startsWith('---')) cls += ' del';
      else if (line.startsWith('@@')) {
        cls += ' hunk';
        // @@ -1,3 +1,4 @@ context → 变更位置
        display = line.replace(
          /^@@\s*-\d+(?:,\d+)?\s*\+\d+(?:,\d+)?\s*@@\s*/,
          `${t('reviewDiffHunk')} `,
        );
      } else if (
        line.startsWith('###') ||
        line.startsWith('diff ') ||
        line.startsWith('index ') ||
        line.startsWith('--- ') ||
        line.startsWith('+++ ') ||
        line.startsWith('# ')
      ) {
        cls += ' meta';
        if (line.startsWith('diff --git')) {
          const m = line.match(/b\/(.+)$/);
          display = m ? `${t('reviewDiffFile')}: ${m[1]}` : t('reviewDiffFile');
        } else if (line.startsWith('###')) {
          display = line.replace(/^###\s*/, '');
        }
      }
      return (
        <div key={i} className={cls}>
          {display || ' '}
        </div>
      );
    });
  }, [diffSrc]);

  if (!open) return null;

  const branchLabel = humanRepoSubtitle(loading, snap, cwd);
  const doneCount = planEntries.filter((e) => e.checked).length;
  const toolsSorted = [...tools].reverse();
  const isGit = Boolean(snap?.ok && snap.isGit !== false);
  const isWorkspace = Boolean(snap?.ok && snap.isGit === false);

  return (
    <aside className="review-panel" aria-label={t('reviewTitle')}>
      <div className="review-head">
        <div className="review-head-text">
          <div className="review-title">{t('reviewTitle')}</div>
          <div className="review-sub" title={cwd || undefined}>
            {branchLabel}
          </div>
        </div>
        <div className="diff-actions">
          <button
            type="button"
            className="btn-icon"
            onClick={refresh}
            disabled={loading || !cwd}
            title={t('refresh')}
            aria-label={t('refresh')}
          >
            <IconRefresh size={15} />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            title={t('reviewClose')}
            aria-label={t('reviewClose')}
          >
            <IconClose size={15} />
          </button>
        </div>
      </div>

      <div className="ext-tabs review-tabs">
        {(
          [
            ['diff', t('diffTitle'), snap?.files.length ?? 0],
            ['plan', t('reviewPlanTab'), planEntries.length],
            ['tools', t('reviewToolsTab'), tools.length],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'ext-tab on' : 'ext-tab'}
            onClick={() => setTab(id)}
          >
            {label}
            <span className="ext-count">{n}</span>
          </button>
        ))}
      </div>

      {msg ? <div className="ext-msg review-toast">{msg}</div> : null}

      {tab === 'diff' ? (
        <div className="review-body">
          {!cwd ? (
            <div className="review-empty pad">{t('reviewNeedProject')}</div>
          ) : (
            <>
              <div className="diff-files review-files">
                {isWorkspace ? (
                  <>
                    <div className="review-empty" style={{ paddingBottom: 8 }}>
                      <strong>{t('reviewNotGit')}</strong>
                      <p className="hint" style={{ marginTop: 6 }}>
                        {t('reviewWorkspaceHint')}
                      </p>
                    </div>
                    {(snap?.files ?? []).length === 0 ? (
                      <div className="review-empty">{t('diffClean')}</div>
                    ) : (
                      snap!.files.map((f) => {
                        const { name, dir } = humanFileName(f.path);
                        return (
                          <button
                            key={f.path}
                            type="button"
                            className={
                              selected === f.path ? 'diff-file-btn on' : 'diff-file-btn'
                            }
                            onClick={() => setSelected(f.path)}
                            title={f.path}
                          >
                            <span className="diff-st">{gitStatusLabel(f.status)}</span>
                            <span className="diff-file-text">
                              <span className="diff-file-name">{name}</span>
                              {dir ? <span className="diff-file-dir">{dir}</span> : null}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </>
                ) : !isGit ? (
                  <div className="review-empty">
                    <strong>{t('reviewNotGit')}</strong>
                    <p className="hint" style={{ marginTop: 8 }}>
                      {t('reviewNotGitHint')}
                    </p>
                  </div>
                ) : (snap?.files ?? []).length === 0 ? (
                  <div className="review-empty">
                    {t('diffClean')}
                    <div className="hint" style={{ marginTop: 8 }}>
                      {t('reviewDiffHint')}
                    </div>
                  </div>
                ) : (
                  snap!.files.map((f) => {
                    const { name, dir } = humanFileName(f.path);
                    return (
                      <button
                        key={f.path}
                        type="button"
                        className={selected === f.path ? 'diff-file-btn on' : 'diff-file-btn'}
                        onClick={() => setSelected(f.path)}
                        title={f.path}
                      >
                        <span className="diff-st">{gitStatusLabel(f.status)}</span>
                        <span className="diff-file-text">
                          <span className="diff-file-name">{name}</span>
                          {dir ? <span className="diff-file-dir">{dir}</span> : null}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="review-diff-actions">
                {isGit ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm"
                      title={t('gitStage')}
                      disabled={!selected || !cwd}
                      onClick={() =>
                        void invoke('git_stage', { cwd, path: selected })
                          .then(() => {
                            const { name } = humanFileName(selected || '');
                            setMsg(
                              t('reviewStagedHint').replace('{path}', name || selected || ''),
                            );
                            refresh();
                          })
                          .catch((e) => setMsg(String(e)))
                      }
                    >
                      {t('gitStage')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      title={t('gitUnstage')}
                      disabled={!selected || !cwd}
                      onClick={() =>
                        void invoke('git_unstage', { cwd, path: selected })
                          .then(() => {
                            const { name } = humanFileName(selected || '');
                            setMsg(
                              t('reviewUnstagedHint').replace(
                                '{path}',
                                name || selected || '',
                              ),
                            );
                            refresh();
                          })
                          .catch((e) => setMsg(String(e)))
                      }
                    >
                      {t('gitUnstage')}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="btn btn-sm"
                  title={t('reviewCopyDiff')}
                  disabled={!diffSrc.trim()}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(diffSrc)
                      .then(() => setMsg(t('copied')))
                      .catch((e) => setMsg(String(e)));
                  }}
                >
                  {t('reviewCopyDiff')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  title={t('reviewCopyPath')}
                  disabled={!selected}
                  onClick={() => {
                    if (!selected) return;
                    void navigator.clipboard
                      .writeText(selected)
                      .then(() => setMsg(t('copied')))
                      .catch((e) => setMsg(String(e)));
                  }}
                >
                  {t('reviewCopyPath')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  title={t('reviewRevealFile')}
                  disabled={!cwd || !selected}
                  onClick={() => {
                    if (!selected || !cwd) return;
                    const abs = selected.startsWith('/')
                      ? selected
                      : `${cwd.replace(/\/+$/, '')}/${selected.replace(/^\.\//, '')}`;
                    void revealInFinder(abs).catch(() =>
                      void revealInFinder(cwd).catch(() => {}),
                    );
                  }}
                >
                  {t('reviewRevealFile')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  title={t('openFolder')}
                  disabled={!cwd}
                  onClick={() => void revealInFinder(cwd).catch(() => {})}
                >
                  {t('openFolder')}
                </button>
              </div>
              <div
                className={`diff-body colored-diff${
                  !loading && diffSrc.trim() ? ' has-diff' : ' is-empty'
                }`}
              >
                {loading ? (
                  <div className="diff-empty-hint">{t('reviewLoading')}</div>
                ) : isWorkspace && selected ? (
                  diffSrc.trim() ? (
                    <pre className="review-file-preview">{diffSrc}</pre>
                  ) : (
                    <div className="diff-empty-hint">
                      <strong>{t('reviewFilePreview')}</strong>
                      <p>{t('reviewFilePreviewEmpty')}</p>
                    </div>
                  )
                ) : !isGit && !isWorkspace ? (
                  <div className="diff-empty-hint">
                    <strong>{t('reviewDiffTitle')}</strong>
                    <p>{t('reviewNotGitHint')}</p>
                  </div>
                ) : !selected && !(snap?.files?.length) ? (
                  <div className="diff-empty-hint">
                    <strong>{t('reviewDiffTitle')}</strong>
                    <p>{t('diffClean')}</p>
                  </div>
                ) : !diffSrc.trim() ? (
                  <div className="diff-empty-hint">
                    <strong>{t('reviewDiffEmpty')}</strong>
                    <p>{t('reviewDiffEmptyHint')}</p>
                  </div>
                ) : (
                  colored
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === 'plan' ? (
        <div className="review-body pad">
          <div className="review-explain">
            <strong>{t('reviewPlanExplainTitle')}</strong>
            <p>{t('reviewPlanExplain')}</p>
          </div>
          {planEntries.length === 0 ? (
            <div className="review-empty">{t('reviewNoPlan')}</div>
          ) : (
            <>
              <div className="review-plan-summary">
                {t('reviewPlanProgress')
                  .replace('{done}', String(doneCount))
                  .replace('{total}', String(planEntries.length))}
              </div>
              <div className="review-plan-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!onToggleAllPlan}
                  onClick={() => onToggleAllPlan?.(true)}
                >
                  {t('planCheckAll')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!onToggleAllPlan}
                  onClick={() => onToggleAllPlan?.(false)}
                >
                  {t('planUncheckAll')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    const text = planEntries
                      .map(
                        (e, i) =>
                          `${e.checked ? '✓' : '○'} ${i + 1}. ${humanPlanText(e.text)}${
                            e.status ? `（${humanPlanStatus(e.status)}）` : ''
                          }`,
                      )
                      .join('\n');
                    void navigator.clipboard.writeText(text).then(() => setMsg(t('copied')));
                  }}
                >
                  {t('copyPlan')}
                </button>
              </div>
              <ol className="plan-list plan-list-review">
                {planEntries.map((e, i) => (
                  <li key={e.id} className={e.checked ? '' : 'off'}>
                    <label className="plan-item-label">
                      <input
                        type="checkbox"
                        checked={Boolean(e.checked)}
                        disabled={!onTogglePlanEntry}
                        onChange={() => onTogglePlanEntry?.(e.id)}
                      />
                      <span className="plan-idx">{i + 1}.</span>
                      <span className="plan-text">{humanPlanText(e.text)}</span>
                      {e.status ? (
                        <span className="plan-st">{humanPlanStatus(e.status)}</span>
                      ) : null}
                    </label>
                  </li>
                ))}
              </ol>
              {onApplyPlan ? (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={planEntries.length === 0}
                    onClick={onApplyPlan}
                    title={t('applyPlanHint')}
                  >
                    {doneCount > 0
                      ? t('applyPlanWithCount').replace('{n}', String(doneCount))
                      : t('applyPlan')}
                  </button>
                  <p className="hint" style={{ margin: 0 }}>
                    {doneCount > 0 ? t('applyPlanHintChecked') : t('applyPlanHintAll')}
                  </p>
                </div>
              ) : (
                <p className="hint" style={{ marginTop: 10 }}>
                  {t('reviewPlanNeedPlanMode')}
                </p>
              )}
            </>
          )}
        </div>
      ) : null}

      {tab === 'tools' ? (
        <div className="review-body pad">
          <div className="review-explain">
            <strong>{t('reviewToolsExplainTitle')}</strong>
            <p>{t('reviewToolsExplain')}</p>
          </div>
          {toolsSorted.length === 0 ? (
            <div className="review-empty">{t('reviewNoTools')}</div>
          ) : (
            <ul className="tool-human-list">
              {toolsSorted.map((tool) => {
                const st = humanToolStatus(tool.status);
                const title = humanToolTitle(tool.label, tool.kind);
                const showRaw =
                  tool.label &&
                  tool.label !== title &&
                  !/^call-/i.test(tool.label) &&
                  tool.label.length > 8;
                return (
                  <li key={tool.id} className={`tool-human-item tone-${st.tone}`}>
                    <div className="tool-human-top">
                      <span className={`tool-human-badge ${st.tone}`}>{st.label}</span>
                      <span className="tool-human-title">{title}</span>
                    </div>
                    {showRaw ? (
                      <details className="tool-human-detail">
                        <summary>{t('reviewToolsRaw')}</summary>
                        <pre>{tool.label}</pre>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 10 }}
            disabled={tools.length === 0}
            onClick={() => {
              const text = toolsSorted
                .map((tool) => {
                  const st = humanToolStatus(tool.status);
                  return `- 【${st.label}】${humanToolTitle(tool.label, tool.kind)}`;
                })
                .join('\n');
              void navigator.clipboard.writeText(text).then(() => setMsg(t('copied')));
            }}
          >
            {t('copyTools')}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
