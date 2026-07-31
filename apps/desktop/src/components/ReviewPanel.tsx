import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { fetchGitSnapshot, type GitSnapshot } from '../lib/git';
import { revealInFinder } from '../lib/host';
import { t } from '../lib/i18n';
import {
  githubCreatePrComment,
  githubListOpenPrs,
  githubListPrChecks,
  githubListPrComments,
  type GithubCheckRun,
  type GithubComment,
  type GithubPullRequest,
} from '../lib/github';
import { githubRepositoryFromUrl, githubWriteConfirmSummary } from '../lib/connectors';
import { appendConnectorAudit } from '../lib/connectorAudit';
import { openUrlSafe } from '../lib/updates';
import type { ToolEvent } from './ToolTimeline';
import type { AcpClient, HunkFileSummary, PlanEntry } from '../lib/acpClient';
import {
  humanFileName,
  humanPlanStatus,
  humanPlanText,
  humanToolStatus,
  humanToolTitle,
} from '../lib/toolHuman';
import { IconClose, IconRefresh } from './UiIcons';

type Tab = 'diff' | 'agent' | 'plan' | 'tools' | 'remote';

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
  /** Set only when the user has explicitly selected this project folder. */
  allowWorkspacePreview?: boolean;
  tools: ToolEvent[];
  planEntries: PlanEntry[];
  client?: AcpClient | null;
  sessionId?: string | null;
  taskBusy?: boolean;
  onClose: () => void;
  onApplyPlan?: () => void;
  onTogglePlanEntry?: (entryId: string) => void;
  onToggleAllPlan?: (checked: boolean) => void;
}

export function ReviewPanel({
  open,
  cwd,
  allowWorkspacePreview = false,
  tools,
  planEntries,
  client = null,
  sessionId = null,
  taskBusy = false,
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
  const [fileQuery, setFileQuery] = useState('');
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remotePrs, setRemotePrs] = useState<GithubPullRequest[]>([]);
  const [remoteChecks, setRemoteChecks] = useState<Record<number, GithubCheckRun[]>>({});
  const [remoteComments, setRemoteComments] = useState<Record<number, GithubComment[]>>({});
  const [remoteLoadedCwd, setRemoteLoadedCwd] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [remoteReceipt, setRemoteReceipt] = useState<string | null>(null);
  const [agentChangesAvailable, setAgentChangesAvailable] = useState<boolean | null>(null);
  const [agentChanges, setAgentChanges] = useState<HunkFileSummary[]>([]);
  const [agentChangesBusy, setAgentChangesBusy] = useState(false);
  const [agentChangesError, setAgentChangesError] = useState<string | null>(null);
  const [gitActionsAvailable, setGitActionsAvailable] = useState(false);
  const [gitActionBusy, setGitActionBusy] = useState(false);
  const [commitDraft, setCommitDraft] = useState('');

  const refreshAgentChanges = () => {
    if (!client || !sessionId) {
      setAgentChangesAvailable(false);
      setAgentChanges([]);
      setTab((current) => (current === 'agent' ? 'diff' : current));
      return;
    }
    setAgentChangesBusy(true);
    setAgentChangesError(null);
    void client.listHunkFiles(sessionId)
      .then((files) => {
        setAgentChangesAvailable(true);
        setAgentChanges(files);
      })
      .catch((error) => {
        const text = error instanceof Error ? error.message : String(error);
        // Older or non-Grok ACP sessions may not advertise this extension;
        // keep the Review surface honest by hiding the tab in that case.
        setAgentChangesAvailable(false);
        setAgentChanges([]);
        setTab((current) => (current === 'agent' ? 'diff' : current));
        if (!/method not found|not supported|session not found/i.test(text)) {
          setAgentChangesError(text);
        }
      })
      .finally(() => setAgentChangesBusy(false));
  };

  const refresh = () => {
    if (!cwd) {
      setSnap(null);
      return;
    }
    setLoading(true);
    void fetchGitSnapshot(cwd, allowWorkspacePreview)
      .then((s) => {
        setSnap(s);
        setSelected((current) =>
          s.files.some((f) => f.path === current) ? current : s.files[0]?.path || null,
        );
      })
      .finally(() => setLoading(false));
  };

  /** Explicit user action only: GitHub reads may use the saved read-only token
   * or the anonymous public API path. No token or remote write is exposed here. */
  const refreshRemote = () => {
    if (!cwd) return;
    setRemoteBusy(true);
    setRemoteError(null);
    void githubListOpenPrs(cwd)
      .then((prs) => {
        setRemotePrs(prs);
        setRemoteLoadedCwd(cwd);
      })
      .catch((error) => {
        setRemotePrs([]);
        setRemoteError(error instanceof Error ? error.message : String(error));
        setRemoteLoadedCwd(cwd);
      })
      .finally(() => setRemoteBusy(false));
  };

  const loadRemoteChecks = (prNumber: number) => {
    if (!cwd) return;
    setRemoteBusy(true);
    setRemoteError(null);
    void githubListPrChecks(cwd, prNumber)
      .then((checks) => setRemoteChecks((current) => ({ ...current, [prNumber]: checks })))
      .catch((error) => setRemoteError(error instanceof Error ? error.message : String(error)))
      .finally(() => setRemoteBusy(false));
  };

  const loadRemoteComments = (prNumber: number) => {
    if (!cwd) return;
    setRemoteBusy(true);
    setRemoteError(null);
    void githubListPrComments(cwd, prNumber)
      .then((comments) =>
        setRemoteComments((current) => ({ ...current, [prNumber]: comments })),
      )
      .catch((error) => setRemoteError(error instanceof Error ? error.message : String(error)))
      .finally(() => setRemoteBusy(false));
  };

  const postRemoteComment = (prNumber: number) => {
    if (!cwd) return;
    const body = (commentDrafts[prNumber] || '').trim();
    if (!body) return;
    const listed = remotePrs.find((pr) => pr.number === prNumber);
    const repository =
      githubRepositoryFromUrl(listed?.url)
      || githubRepositoryFromUrl(remotePrs[0]?.url)
      || (cwd ? cwd.split('/').filter(Boolean).slice(-2).join('/') : undefined);
    const confirmLine = githubWriteConfirmSummary({
      action: 'create_pr_comment',
      titleOrBody: body,
      prNumber,
      repository,
    });
    if (!window.confirm(`${t('githubWriteConfirm')}\n\n${confirmLine}`)) return;
    setRemoteBusy(true);
    setRemoteError(null);
    void githubCreatePrComment(cwd, prNumber, body)
      .then((created) => {
        setRemoteReceipt(created.url);
        setCommentDrafts((current) => ({ ...current, [prNumber]: '' }));
        appendConnectorAudit({
          connector: 'github',
          action: 'write',
          summary: confirmLine,
          receiptUrl: created.url,
        });
        return githubListPrComments(cwd, prNumber);
      })
      .then((comments) => {
        if (comments) setRemoteComments((current) => ({ ...current, [prNumber]: comments }));
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setRemoteError(message);
        appendConnectorAudit({ connector: 'github', action: 'fail', summary: message });
      })
      .finally(() => setRemoteBusy(false));
  };

  useEffect(() => {
    if (open && cwd) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cwd, allowWorkspacePreview]);

  useEffect(() => {
    if (!open) return;
    refreshAgentChanges();
    // The active client/session are the only dependencies that should trigger
    // a new native read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client, sessionId]);

  useEffect(() => {
    if (!open || !client || !sessionId || !cwd || snap?.isGit !== true) {
      setGitActionsAvailable(false);
      return;
    }
    let cancelled = false;
    void client.getGitInfo(sessionId, cwd)
      .then(() => {
        if (!cancelled) setGitActionsAvailable(true);
      })
      .catch(() => {
        if (!cancelled) setGitActionsAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, client, sessionId, cwd, snap?.isGit]);

  // PR data is scoped to the repository's origin. Never show a previous
  // project's anonymous/API error or review data after the user changes cwd.
  useEffect(() => {
    setRemoteError(null);
    setRemotePrs([]);
    setRemoteChecks({});
    setRemoteComments({});
    setRemoteLoadedCwd(null);
  }, [cwd]);

  useEffect(() => {
    if (!open || !cwd || !selected) {
      setFileDiff('');
      return;
    }
    const isWs = Boolean(allowWorkspacePreview && snap?.ok && snap.isGit === false);
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
  }, [open, cwd, selected, snap?.diff, snap?.ok, snap?.isGit, allowWorkspacePreview]);

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
  const isWorkspace = Boolean(allowWorkspacePreview && snap?.ok && snap.isGit === false);
  const visibleFiles = (snap?.files ?? []).filter((f) =>
    f.path.toLocaleLowerCase().includes(fileQuery.trim().toLocaleLowerCase()),
  );
  const agentPath = (path: string) => {
    const prefix = cwd ? `${cwd.replace(/\/+$/, '')}/` : '';
    return prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path;
  };

  const discardSelected = () => {
    if (!client || !sessionId || !cwd || !selected || taskBusy || gitActionBusy) return;
    const displayPath = agentPath(selected);
    if (!window.confirm(t('reviewGitDiscardConfirm').replace('{path}', displayPath))) return;
    setGitActionBusy(true);
    setMsg(null);
    void client.discardGitPaths(sessionId, cwd, [selected], 'both', true)
      .then(() => {
        setMsg(t('reviewGitDiscarded').replace('{path}', displayPath));
        setSelected(null);
        refresh();
      })
      .catch((error) => setMsg(error instanceof Error ? error.message : String(error)))
      .finally(() => setGitActionBusy(false));
  };

  const stashChanges = () => {
    if (!client || !sessionId || !cwd || taskBusy || gitActionBusy) return;
    if (!window.confirm(t('reviewGitStashConfirm'))) return;
    setGitActionBusy(true);
    setMsg(null);
    void client.stashGit(sessionId, cwd, true)
      .then(() => {
        setMsg(t('reviewGitStashed'));
        refresh();
      })
      .catch((error) => setMsg(error instanceof Error ? error.message : String(error)))
      .finally(() => setGitActionBusy(false));
  };

  const commitStaged = () => {
    if (!client || !sessionId || !cwd || taskBusy || gitActionBusy) return;
    const message = commitDraft.trim();
    if (!message) return;
    if (!window.confirm(t('reviewGitCommitConfirm').replace('{message}', message))) return;
    setGitActionBusy(true);
    setMsg(null);
    void client.commitGit(sessionId, cwd, message)
      .then((result) => {
        setMsg(result.hash
          ? t('reviewGitCommitted').replace('{hash}', result.hash.slice(0, 10))
          : t('reviewGitCommittedNoHash'));
        setCommitDraft('');
        refresh();
      })
      .catch((error) => setMsg(error instanceof Error ? error.message : String(error)))
      .finally(() => setGitActionBusy(false));
  };

  const applyAgentFileAction = (file: HunkFileSummary, action: 'accept' | 'reject') => {
    if (!client || !sessionId || taskBusy || agentChangesBusy) return;
    const path = agentPath(file.path);
    const confirmText = action === 'accept'
      ? t('reviewAgentAcceptFileConfirm').replace('{path}', path)
      : t('reviewAgentRejectFileConfirm').replace('{path}', path);
    if (!window.confirm(confirmText)) return;
    setAgentChangesBusy(true);
    setAgentChangesError(null);
    void client.applyHunkFileAction(sessionId, file.path, action)
      .then((result) => {
        const message = action === 'accept' ? t('reviewAgentFileAccepted') : t('reviewAgentFileRejected');
        setMsg(message.replace('{path}', path).replace('{n}', String(result.affectedCount)));
        refreshAgentChanges();
      })
      .catch((error) => setAgentChangesError(error instanceof Error ? error.message : String(error)))
      .finally(() => setAgentChangesBusy(false));
  };

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
            ...(agentChangesAvailable ? [['agent', t('reviewAgentTab'), agentChanges.length] as const] : []),
            ['plan', t('reviewPlanTab'), planEntries.length],
            ['tools', t('reviewToolsTab'), tools.length],
            ['remote', t('reviewRemoteTab'), remotePrs.length],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'ext-tab on' : 'ext-tab'}
            onClick={() => {
              setTab(id);
              if (id === 'remote' && cwd && !remoteBusy && remoteLoadedCwd !== cwd) {
                refreshRemote();
              }
              if (id === 'agent') refreshAgentChanges();
            }}
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
                {snap?.files.length ? (
                  <label className="review-file-filter">
                    <span className="sr-only">{t('reviewFilterFiles')}</span>
                    <input
                      value={fileQuery}
                      onChange={(e) => setFileQuery(e.target.value)}
                      placeholder={t('reviewFilterFiles')}
                      spellCheck={false}
                    />
                  </label>
                ) : null}
                {isWorkspace ? (
                  <>
                    <div className="review-empty" style={{ paddingBottom: 8 }}>
                      <strong>{t('reviewNotGit')}</strong>
                      <p className="hint" style={{ marginTop: 6 }}>
                        {t('reviewWorkspaceHint')}
                      </p>
                    </div>
                    {visibleFiles.length === 0 ? (
                      <div className="review-empty">{t('diffClean')}</div>
                    ) : (
                      visibleFiles.map((f) => {
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
                ) : visibleFiles.length === 0 ? (
                  <div className="review-empty">
                    {t('diffClean')}
                    <div className="hint" style={{ marginTop: 8 }}>
                      {t('reviewDiffHint')}
                    </div>
                  </div>
                ) : (
                  visibleFiles.map((f) => {
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
                {isGit && gitActionsAvailable ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm"
                      title={t('reviewGitDiscard')}
                      disabled={!selected || taskBusy || gitActionBusy}
                      onClick={discardSelected}
                    >
                      {t('reviewGitDiscard')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      title={t('reviewGitStash')}
                      disabled={taskBusy || gitActionBusy || !snap?.dirty}
                      onClick={stashChanges}
                    >
                      {t('reviewGitStash')}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="btn btn-sm"
                  title={isWorkspace ? t('reviewCopyPreview') : t('reviewCopyDiff')}
                  disabled={!diffSrc.trim()}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(diffSrc)
                      .then(() => setMsg(t('copied')))
                      .catch((e) => setMsg(String(e)));
                  }}
                >
                  {isWorkspace ? t('reviewCopyPreview') : t('reviewCopyDiff')}
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
              {isGit && gitActionsAvailable ? (
                <div className="field-row" style={{ margin: '8px 10px 0' }}>
                  <input
                    value={commitDraft}
                    onChange={(event) => setCommitDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitStaged();
                    }}
                    placeholder={t('reviewGitCommitPlaceholder')}
                    aria-label={t('reviewGitCommitPlaceholder')}
                    disabled={taskBusy || gitActionBusy}
                  />
                  <button
                    type="button"
                    className="btn btn-sm primary-sm"
                    title={t('reviewGitCommit')}
                    disabled={!commitDraft.trim() || taskBusy || gitActionBusy}
                    onClick={commitStaged}
                  >
                    {t('reviewGitCommit')}
                  </button>
                </div>
              ) : null}
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

      {tab === 'agent' ? (
        <div className="review-body pad">
          <div className="review-explain">
            <strong>{t('reviewAgentTitle')}</strong>
            <p>{t('reviewAgentExplain')}</p>
          </div>
          <div className="review-plan-actions">
            <button
              type="button"
              className="btn btn-sm"
              disabled={agentChangesBusy || !client || !sessionId}
              onClick={refreshAgentChanges}
            >
              {agentChangesBusy ? t('reviewAgentLoading') : t('reviewAgentRefresh')}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={agentChangesBusy || taskBusy || agentChanges.length === 0 || !client || !sessionId}
              onClick={() => {
                if (!client || !sessionId) return;
                if (!window.confirm(t('reviewAgentAcceptConfirm'))) return;
                setAgentChangesBusy(true);
                setAgentChangesError(null);
                void client.applyAllHunkAction(sessionId, 'accept')
                  .then((result) => {
                    setMsg(t('reviewAgentAccepted').replace('{n}', String(result.affectedCount)));
                    refreshAgentChanges();
                  })
                  .catch((error) => setAgentChangesError(error instanceof Error ? error.message : String(error)))
                  .finally(() => setAgentChangesBusy(false));
              }}
            >
              {t('reviewAgentAcceptAll')}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={agentChangesBusy || taskBusy || agentChanges.length === 0 || !client || !sessionId}
              onClick={() => {
                if (!client || !sessionId) return;
                if (!window.confirm(t('reviewAgentRejectConfirm'))) return;
                setAgentChangesBusy(true);
                setAgentChangesError(null);
                void client.applyAllHunkAction(sessionId, 'reject')
                  .then((result) => {
                    setMsg(t('reviewAgentRejected').replace('{n}', String(result.affectedCount)));
                    refreshAgentChanges();
                  })
                  .catch((error) => setAgentChangesError(error instanceof Error ? error.message : String(error)))
                  .finally(() => setAgentChangesBusy(false));
              }}
            >
              {t('reviewAgentRejectAll')}
            </button>
          </div>
          {agentChangesError ? (
            <div className="review-empty" style={{ textAlign: 'left' }}>
              <strong>{t('reviewAgentUnavailable')}</strong>
              <p className="hint">{agentChangesError}</p>
            </div>
          ) : null}
          {!agentChangesBusy && !agentChangesError && agentChanges.length === 0 ? (
            <div className="review-empty">{t('reviewAgentEmpty')}</div>
          ) : null}
          {agentChanges.length ? (
            <ul className="tool-human-list">
              {agentChanges.map((file) => (
                <li key={file.path} className="tool-human-item tone-idle">
                  <div className="tool-human-top">
                    <span className="tool-human-title" title={file.path}>{agentPath(file.path)}</span>
                    <span className="tool-human-badge idle">
                      {t('reviewAgentHunks').replace('{n}', String(file.hunkCount))}
                    </span>
                  </div>
                  <div className="hint">
                    {t('reviewAgentChangesCount')
                      .replace('{add}', String(file.additions))
                      .replace('{del}', String(file.deletions))}
                    {file.staged ? ` · ${t('reviewAgentStaged')}` : ''}
                  </div>
                  <div className="review-plan-actions" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={agentChangesBusy || taskBusy}
                      onClick={() => applyAgentFileAction(file, 'accept')}
                    >
                      {t('reviewAgentAcceptFile')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={agentChangesBusy || taskBusy}
                      onClick={() => applyAgentFileAction(file, 'reject')}
                    >
                      {t('reviewAgentRejectFile')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
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

      {tab === 'remote' ? (
        <div className="review-body pad">
          <div className="review-explain">
            <strong>{t('reviewRemoteTitle')}</strong>
            <p>{t('reviewRemoteHint')}</p>
          </div>
          <div className="review-plan-actions">
            <button
              type="button"
              className="btn btn-sm"
              disabled={!cwd || remoteBusy}
              onClick={refreshRemote}
            >
              {remoteBusy ? t('reviewRemoteLoading') : t('reviewRemoteRefresh')}
            </button>
          </div>
          {!cwd ? <div className="review-empty">{t('reviewNeedProject')}</div> : null}
          {remoteError ? (
            <div className="review-empty" style={{ textAlign: 'left' }}>
              <strong>{t('reviewRemoteUnavailable')}</strong>
              <p className="hint">{remoteError}</p>
            </div>
          ) : null}
          {!remoteBusy && cwd && !remoteError && remoteLoadedCwd === cwd && remotePrs.length === 0 ? (
            <div className="review-empty">{t('reviewRemoteEmpty')}</div>
          ) : null}
          {remotePrs.length ? (
            <ul className="tool-human-list">
              {remotePrs.map((pr) => (
                <li key={pr.number} className="tool-human-item tone-idle">
                  <div className="tool-human-top">
                    <button
                      type="button"
                      className="link-btn tool-human-title"
                      onClick={() => void openUrlSafe(pr.url)}
                    >
                      #{pr.number} {pr.title}
                    </button>
                    <span className="tool-human-badge idle">
                      {pr.draft ? t('githubDraft') : t('reviewRemoteOpen')}
                    </span>
                  </div>
                  <div className="hint">{pr.author} · {pr.updatedAt || '—'}</div>
                  <div className="review-plan-actions" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={remoteBusy}
                      onClick={() => loadRemoteChecks(pr.number)}
                    >
                      {t('githubLoadChecks')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={remoteBusy}
                      onClick={() => loadRemoteComments(pr.number)}
                    >
                      {t('githubLoadComments')}
                    </button>
                  </div>
                  {remoteChecks[pr.number] ? (
                    <ul className="settings-list" style={{ marginTop: 8 }}>
                      {remoteChecks[pr.number].map((check) => (
                        <li key={`${check.name}-${check.url}`}>
                          {check.url || check.detailsUrl ? (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => void openUrlSafe(check.detailsUrl || check.url)}
                            >
                              {check.name}
                            </button>
                          ) : check.name}
                          <span className="muted"> · {check.conclusion || check.status}</span>
                        </li>
                      ))}
                      {!remoteChecks[pr.number].length ? (
                        <li className="muted">{t('githubChecksEmpty')}</li>
                      ) : null}
                    </ul>
                  ) : null}
                  {remoteComments[pr.number] ? (
                    <ul className="settings-list" style={{ marginTop: 8 }}>
                      {remoteComments[pr.number].map((comment, index) => (
                        <li key={`${comment.url}-${index}`}>
                          {comment.url ? (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => void openUrlSafe(comment.url)}
                            >
                              {comment.author}
                            </button>
                          ) : comment.author}
                          <span className="muted">
                            {' '}
                            · {comment.kind}
                            {comment.path
                              ? ` · ${comment.path}${comment.line ? `:${comment.line}` : ''}`
                              : ''}
                            {comment.body ? ` · ${comment.body.slice(0, 320)}` : ''}
                          </span>
                        </li>
                      ))}
                      {!remoteComments[pr.number].length ? (
                        <li className="muted">{t('githubCommentsEmpty')}</li>
                      ) : null}
                    </ul>
                  ) : null}
                  <div className="field-row" style={{ marginTop: 8 }}>
                    <input
                      value={commentDrafts[pr.number] || ''}
                      onChange={(e) =>
                        setCommentDrafts((current) => ({
                          ...current,
                          [pr.number]: e.target.value,
                        }))
                      }
                      placeholder={t('githubCommentBodyPlaceholder')}
                      aria-label={t('githubCommentBodyPlaceholder')}
                      disabled={remoteBusy}
                    />
                    <button
                      type="button"
                      className="btn btn-sm primary-sm"
                      disabled={remoteBusy || !(commentDrafts[pr.number] || '').trim()}
                      onClick={() => postRemoteComment(pr.number)}
                    >
                      {t('githubCreateComment')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {remoteReceipt ? (
            <div className="hint" style={{ marginTop: 10 }}>
              {t('connectorReceipt')}:{' '}
              <button type="button" className="link-btn" onClick={() => void openUrlSafe(remoteReceipt)}>
                {remoteReceipt}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
