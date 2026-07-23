/**
 * + menu = categorized common Grok slash / session capabilities.
 * Selecting an item arms the composer (user finishes in chat) or runs a real action.
 */
import type { SkillInfo } from '../lib/extensions';
import { t } from '../lib/i18n';

/** What happens when the user picks a + item */
export type PlusAction =
  | { type: 'attach-files' }
  | { type: 'attach-folders' }
  | { type: 'capture-screen' }
  | { type: 'pick-project' }
  | { type: 'terminal' }
  | { type: 'review' }
  | { type: 'extensions' }
  | { type: 'memory-panel' }
  | { type: 'plan-toggle'; on: boolean }
  | { type: 'fork-session' }
  | { type: 'rewind-session' }
  | { type: 'ask-btw' }
  | { type: 'stage'; cmd: string; label: string }
  | { type: 'send-now'; cmd: string }
  | { type: 'skill'; skill: SkillInfo };

type Row =
  | { kind: 'action'; id: string; title: string; desc: string; action: PlusAction }
  | { kind: 'label'; id: string; title: string };

interface Props {
  open: boolean;
  home?: boolean;
  planModeOn: boolean;
  skills: SkillInfo[];
  hasActiveSession: boolean;
  /** Session slash names without leading `/` — when non-empty, filter engine slash rows */
  availableCommandNames?: string[];
  onClose: () => void;
  onAction: (action: PlusAction) => void;
}

function slashAllowed(cmd: string, available?: string[]): boolean {
  const n = cmd.replace(/^\//, '').toLowerCase();
  // These are intercepted by gorkX itself and therefore never depend on an
  // engine-advertised slash command. Every other slash entry is only shown
  // after the live session explicitly advertises it: no optimistic dead rows.
  if (['clear', 'new', 'worktree'].includes(n)) {
    return true;
  }
  return Boolean(available?.some((a) => a.toLowerCase() === n));
}

export function PlusMenu({
  open,
  home,
  planModeOn,
  skills,
  hasActiveSession,
  availableCommandNames,
  onClose,
  onAction,
}: Props) {
  if (!open) return null;

  const invocable = skills.filter((s) => s.userInvocable).slice(0, 10);

  const rawRows: Row[] = [
    { kind: 'label', id: 'l-add', title: t('plusCatAdd') },
    {
      kind: 'action',
      id: 'files',
      title: t('attachFilesFolders'),
      desc: t('plusAttachHint'),
      action: { type: 'attach-files' },
    },
    {
      kind: 'action',
      id: 'folder',
      title: t('plusAttachFolder'),
      desc: t('plusAttachFolderHint'),
      action: { type: 'attach-folders' },
    },
    {
      kind: 'action',
      id: 'screen',
      title: t('plusCaptureScreen'),
      desc: t('plusCaptureScreenHint'),
      action: { type: 'capture-screen' },
    },
    {
      kind: 'action',
      id: 'project',
      title: t('plusProject'),
      desc: t('plusProjectHint'),
      action: { type: 'pick-project' },
    },
    {
      kind: 'action',
      id: 'terminal',
      title: t('plusTerminal'),
      desc: t('plusTerminalHint'),
      action: { type: 'terminal' },
    },
    {
      kind: 'action',
      id: 'review',
      title: t('reviewTitle'),
      desc: t('slashDescReview'),
      action: { type: 'review' },
    },

    { kind: 'label', id: 'l-mode', title: t('plusCatMode') },
    {
      kind: 'action',
      id: 'plan',
      title: planModeOn ? t('plusPlanOff') : t('plusPlanOn'),
      desc: t('plusPlanHint'),
      action: { type: 'plan-toggle', on: !planModeOn },
    },
    {
      kind: 'action',
      id: 'goal',
      title: t('plusGoal'),
      desc: t('plusGoalHint'),
      action: { type: 'stage', cmd: '/goal', label: t('plusGoal') },
    },
    {
      kind: 'action',
      id: 'compact',
      title: t('plusCompact'),
      desc: t('slashDescCompact'),
      action: hasActiveSession
        ? { type: 'send-now', cmd: '/compact' }
        : { type: 'stage', cmd: '/compact', label: t('plusCompact') },
    },
    {
      kind: 'action',
      id: 'context',
      title: t('plusContext'),
      desc: t('slashDescContext'),
      action: hasActiveSession
        ? { type: 'send-now', cmd: '/context' }
        : { type: 'stage', cmd: '/context', label: t('plusContext') },
    },
    {
      kind: 'action',
      id: 'model',
      title: t('plusModel'),
      desc: t('slashDescModel'),
      action: { type: 'stage', cmd: '/model', label: t('plusModel') },
    },
    {
      kind: 'action',
      id: 'effort',
      title: t('plusEffort'),
      desc: t('slashDescEffort'),
      action: { type: 'stage', cmd: '/effort', label: t('plusEffort') },
    },

    { kind: 'label', id: 'l-gen', title: t('plusCatGenerate') },
    {
      kind: 'action',
      id: 'imagine',
      title: t('plusImagine'),
      desc: t('plusImagineHint'),
      action: { type: 'stage', cmd: '/imagine', label: t('plusImagine') },
    },
    {
      kind: 'action',
      id: 'imagine-video',
      title: t('plusImagineVideo'),
      desc: t('plusImagineVideoHint'),
      action: { type: 'stage', cmd: '/imagine-video', label: t('plusImagineVideo') },
    },

    { kind: 'label', id: 'l-mem', title: t('plusCatMemory') },
    {
      kind: 'action',
      id: 'mem-panel',
      title: t('memoryTitle'),
      desc: t('plusMemoryHint'),
      action: { type: 'memory-panel' },
    },
    {
      kind: 'action',
      id: 'remember',
      title: t('memoryRemember'),
      desc: t('slashDescRemember'),
      action: { type: 'stage', cmd: '/remember', label: t('memoryRemember') },
    },
    {
      kind: 'action',
      id: 'flush',
      title: t('memoryFlush'),
      desc: t('slashDescFlush'),
      action: hasActiveSession
        ? { type: 'send-now', cmd: '/flush' }
        : { type: 'stage', cmd: '/flush', label: t('memoryFlush') },
    },
    {
      kind: 'action',
      id: 'dream',
      title: t('memoryDream'),
      desc: t('slashDescDream'),
      action: hasActiveSession
        ? { type: 'send-now', cmd: '/dream' }
        : { type: 'stage', cmd: '/dream', label: t('memoryDream') },
    },

    { kind: 'label', id: 'l-session', title: t('plusCatSession') },
    {
      kind: 'action',
      id: 'fork',
      title: t('plusFork'),
      desc: t('slashDescFork'),
      action: { type: 'fork-session' },
    },
    {
      kind: 'action',
      id: 'rewind',
      title: t('plusRewind'),
      desc: t('slashDescRewind'),
      action: { type: 'rewind-session' },
    },
    {
      kind: 'action',
      id: 'btw',
      title: t('btwTitle'),
      desc: t('btwHint'),
      action: { type: 'ask-btw' },
    },
    {
      kind: 'action',
      id: 'export',
      title: t('plusExport'),
      desc: t('slashDescExport'),
      action: { type: 'stage', cmd: '/export', label: t('plusExport') },
    },
    {
      kind: 'action',
      id: 'new',
      title: t('plusNewTask'),
      desc: t('slashDescNew'),
      action: { type: 'send-now', cmd: '/new' },
    },

    ...(invocable.length
      ? ([
          { kind: 'label' as const, id: 'l-skills', title: t('plusCatSkills') },
          ...invocable.map(
            (s): Row => ({
              kind: 'action',
              id: `skill-${s.name}`,
              title: s.name,
              desc: s.description || s.whenToUse || t('plusSkillHint'),
              action: { type: 'skill', skill: s },
            }),
          ),
        ] as Row[])
      : []),

    { kind: 'label', id: 'l-ext', title: t('plusCatExt') },
    {
      kind: 'action',
      id: 'ext',
      title: t('openPlugins'),
      desc: t('plusExtHint'),
      action: { type: 'extensions' },
    },
    {
      kind: 'action',
      id: 'mcps',
      title: t('plusMcps'),
      desc: t('plusMcpsHint'),
      action: { type: 'stage', cmd: '/mcps', label: t('plusMcps') },
    },
  ];

  // Drop engine slash rows the current session does not advertise
  const rows: Row[] = rawRows.filter((row) => {
    if (row.kind !== 'action') return true;
    const a = row.action;
    if (a.type === 'stage' || a.type === 'send-now') {
      return slashAllowed(a.cmd, availableCommandNames);
    }
    if (a.type === 'ask-btw') return slashAllowed('/btw', availableCommandNames);
    return true;
  });

  const go = (action: PlusAction) => {
    onAction(action);
    onClose();
  };

  // Group into sections so category headers read clearly
  const sections: { id: string; title: string; items: Extract<Row, { kind: 'action' }>[] }[] =
    [];
  let cur: (typeof sections)[0] | null = null;
  for (const row of rows) {
    if (row.kind === 'label') {
      cur = { id: row.id, title: row.title, items: [] };
      sections.push(cur);
    } else if (cur) {
      cur.items.push(row);
    } else {
      cur = { id: 'misc', title: '', items: [row] };
      sections.push(cur);
    }
  }
  // Drop empty categories after filtering
  const sectionsVisible = sections.filter((s) => s.items.length > 0);

  return (
    <div
      className={`pop-menu plus-pop-menu${home ? ' home-plus' : ''}`}
      role="menu"
      aria-label={t('plusMenu')}
    >
      {sectionsVisible.map((sec, si) => (
        <section key={sec.id} className={`plus-section${si === 0 ? ' first' : ''}`}>
          {sec.title ? (
            <header className="plus-section-head">
              <span className="plus-section-title">{sec.title}</span>
            </header>
          ) : null}
          <div className="plus-section-body">
            {sec.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="pop-menu-item plus-action"
                role="menuitem"
                onClick={() => go(item.action)}
              >
                <span className="plus-item-title">{item.title}</span>
                <span className="plus-item-desc">{item.desc}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
