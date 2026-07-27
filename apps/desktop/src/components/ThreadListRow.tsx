import { t } from '../lib/i18n';
import { formatThreadClock, threadListLabel, type ThreadListEntry } from '../lib/threadList';
import type { TaskRunPhase } from '../lib/taskRunStatus';
import { IconArchive, IconClose, IconRename } from './UiIcons';

export interface SidebarThreadEntry extends ThreadListEntry {
  busy?: boolean;
  worktreePath?: string | null;
  runPhase?: TaskRunPhase;
  runStep?: string | null;
  runStalled?: boolean;
}

interface Props {
  thread: SidebarThreadEntry;
  siblings: ThreadListEntry[];
  activeId: string | null;
  onSelect: () => void;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function phaseDotClass(phase: TaskRunPhase | undefined, busy?: boolean): string {
  if (phase === 'awaiting_decision') return 'thread-status-dot await';
  if (phase === 'failed') return 'thread-status-dot fail';
  if (phase === 'running' || busy) return 'thread-status-dot run';
  return '';
}

/** One local task row; actions stay owned by App so deletion confirmations are unchanged. */
export function ThreadListRow({
  thread,
  siblings,
  activeId,
  onSelect,
  onRename,
  onArchive,
  onDelete,
}: Props) {
  const label = threadListLabel(thread, siblings, t('newThread'));
  const phase = thread.runPhase;
  const showDot = phase === 'running' || phase === 'awaiting_decision' || phase === 'failed' || thread.busy;
  const step = thread.runStep?.trim() || '';
  const titleBits = [thread.title];
  if (step) titleBits.push(step);
  if (thread.updatedAt) titleBits.push(formatThreadClock(thread.updatedAt));
  return (
    <div className={thread.id === activeId ? 'thread on project-row' : 'thread project-row'}>
      <button
        type="button"
        className="thread-main"
        title={titleBits.filter(Boolean).join('\n')}
        onClick={onSelect}
      >
        <span className="thread-title">
          {showDot ? (
            <span
              className={phaseDotClass(phase, thread.busy) || 'thread-busy-dot'}
              aria-hidden
            />
          ) : null}
          {thread.worktreePath ? <span className="wt-badge" title={thread.worktreePath}>WT</span> : null}
          {label}
          {thread.runStalled ? (
            <span className="thread-stall-tag" title={t('runStalledBadge')}>
              {t('runStalledShort')}
            </span>
          ) : null}
        </span>
        {step && (phase === 'running' || phase === 'awaiting_decision') ? (
          <span className="thread-step">{step}</span>
        ) : null}
      </button>
      <button type="button" className="thread-x" title={t('renameThread')} onClick={(e) => { e.stopPropagation(); onRename(); }}>
        <IconRename size={14} />
      </button>
      <button type="button" className="thread-x" title={t('archiveThread')} onClick={(e) => { e.stopPropagation(); onArchive(); }}>
        <IconArchive size={14} />
      </button>
      <button type="button" className="thread-x" title={t('deleteThread')} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
        <IconClose size={14} />
      </button>
    </div>
  );
}
