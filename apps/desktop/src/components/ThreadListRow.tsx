import { t } from '../lib/i18n';
import { formatThreadClock, threadListLabel, type ThreadListEntry } from '../lib/threadList';
import { IconArchive, IconClose, IconRename } from './UiIcons';

export interface SidebarThreadEntry extends ThreadListEntry {
  busy?: boolean;
  worktreePath?: string | null;
}

interface Props<T extends SidebarThreadEntry> {
  thread: T;
  siblings: T[];
  activeId: string | null;
  onSelect: () => void;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

/** One local task row; actions stay owned by App so deletion confirmations are unchanged. */
export function ThreadListRow<T extends SidebarThreadEntry>({
  thread,
  siblings,
  activeId,
  onSelect,
  onRename,
  onArchive,
  onDelete,
}: Props<T>) {
  const label = threadListLabel(thread, siblings, t('newThread'));
  return (
    <div className={thread.id === activeId ? 'thread on project-row' : 'thread project-row'}>
      <button
        type="button"
        className="thread-main"
        title={thread.updatedAt ? `${thread.title}\n${formatThreadClock(thread.updatedAt)}` : thread.title}
        onClick={onSelect}
      >
        <span className="thread-title">
          {thread.busy ? <span className="thread-busy-dot" aria-hidden /> : null}
          {thread.worktreePath ? <span className="wt-badge" title={thread.worktreePath}>WT</span> : null}
          {label}
        </span>
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
