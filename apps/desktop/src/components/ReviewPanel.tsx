import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { fetchGitSnapshot, type GitSnapshot } from '../lib/git';
import { revealInFinder } from '../lib/host';
import { t } from '../lib/i18n';
import type { ToolEvent } from './ToolTimeline';
import type { PlanEntry } from '../lib/acpClient';
import { humanPlanStatus, humanToolStatus, humanToolTitle } from '../lib/toolHuman';

type Tab = 'diff' | 'plan' | 'tools';

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
    if (!cwd) return;
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
    void invoke<string>('git_file_diff', { cwd, path: selected })
      .then(setFileDiff)
      .catch((e) => setFileDiff(String(e)));
  }, [open, cwd, selected, snap?.diff]);

  const diffSrc = selected ? fileDiff : snap?.diff || '';
  const colored = useMemo(() => {
    const src = diffSrc;
    if (!src.trim()) return null;
    return src.split('\n').map((line, i) => {
      let cls = 'diff-line';
      if (line.startsWith('+') && !line.startsWith('+++')) cls += ' add';
      else if (line.startsWith('-') && !line.startsWith('---')) cls += ' del';
      else if (line.startsWith('@@')) cls += ' hunk';
      else if (line.startsWith('###') || line.startsWith('diff ') || line.startsWith('# '))
        cls += ' meta';
      return (
        <div key={i} className={cls}>
          {line || ' '}
        </div>
      );
    });
  }, [diffSrc]);

  if (!open) return null;

  const branchLabel = loading
    ? '…'
    : snap?.ok
      ? `${snap.branch}${snap.dirty ? ' · dirty' : ' · clean'}`
      : snap?.error || (cwd ? cwd.split('/').filter(Boolean).pop() : '—');

  const doneCount = planEntries.filter((e) => e.checked).length;
  const toolsSorted = [...tools].reverse();

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
          <button type="button" className="btn btn-sm" onClick={refresh} disabled={loading} title="Refresh">
            ↻
          </button>
          <button type="button" className="btn btn-sm" onClick={onClose} title={t('reviewClose')}>
            ×
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

      {msg ? <pre className="ext-msg">{msg}</pre> : null}

      {!cwd ? <div className="review-empty">{t('reviewNeedProject')}</div> : null}

      {cwd && tab === 'diff' ? (
        <div className="review-body">
          <div className="diff-files review-files">
            {(snap?.files ?? []).length === 0 ? (
              <div className="review-empty">
                {snap?.ok ? t('diffClean') : snap?.error || t('reviewNeedProject')}
                <div className="hint" style={{ marginTop: 8 }}>
                  {t('reviewDiffHint')}
                </div>
              </div>
            ) : (
              snap!.files.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  className={selected === f.path ? 'diff-file-btn on' : 'diff-file-btn'}
                  onClick={() => setSelected(f.path)}
                >
                  <span className="diff-st">{f.status}</span>
                  <span className="mono">{f.path}</span>
                </button>
              ))
            )}
          </div>
          <div className="review-diff-actions">
            <button
              type="button"
              className="btn btn-sm"
              disabled={!selected || !cwd}
              onClick={() =>
                void invoke('git_stage', { cwd, path: selected })
                  .then(() => {
                    setMsg(`staged ${selected}`);
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
              disabled={!selected || !cwd}
              onClick={() =>
                void invoke('git_unstage', { cwd, path: selected })
                  .then(() => {
                    setMsg(`unstaged ${selected}`);
                    refresh();
                  })
                  .catch((e) => setMsg(String(e)))
              }
            >
              {t('gitUnstage')}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!cwd}
              onClick={() => void revealInFinder(cwd).catch(() => {})}
            >
              {t('openFolder')}
            </button>
          </div>
          <div className="diff-body colored-diff">
            {loading ? (
              <div className="diff-empty-hint">…</div>
            ) : !selected && !(snap?.files?.length) ? (
              <div className="diff-empty-hint">
                <strong>{t('reviewDiffTitle')}</strong>
                <p>{t('reviewDiffHint')}</p>
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
        </div>
      ) : null}

      {cwd && tab === 'plan' ? (
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
                          `${e.checked ? '[x]' : '[ ]'} ${i + 1}. ${e.text}${
                            e.status ? ` (${humanPlanStatus(e.status)})` : ''
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
                      <span className="plan-text">{e.text}</span>
                      {e.status ? (
                        <span className="plan-st">{humanPlanStatus(e.status)}</span>
                      ) : null}
                    </label>
                  </li>
                ))}
              </ol>
              {onApplyPlan ? (
                <button
                  type="button"
                  className="btn primary"
                  style={{ marginTop: 12 }}
                  onClick={onApplyPlan}
                >
                  {t('applyPlan')}
                </button>
              ) : (
                <p className="hint" style={{ marginTop: 10 }}>
                  {t('reviewPlanNeedPlanMode')}
                </p>
              )}
            </>
          )}
        </div>
      ) : null}

      {cwd && tab === 'tools' ? (
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
                const title = humanToolTitle(tool.label);
                return (
                  <li key={tool.id} className={`tool-human-item tone-${st.tone}`}>
                    <div className="tool-human-top">
                      <span className={`tool-human-badge ${st.tone}`}>{st.label}</span>
                      <span className="tool-human-title">{title}</span>
                    </div>
                    {tool.label && tool.label !== title ? (
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
                  return `- [${st.label}] ${humanToolTitle(tool.label)}`;
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
