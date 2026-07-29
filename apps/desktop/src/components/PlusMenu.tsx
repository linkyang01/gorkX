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
  | { type: 'open-web-source' }
  | { type: 'pick-project' }
  | { type: 'terminal' }
  | { type: 'review' }
  | { type: 'extensions' }
  | { type: 'memory-panel' }
  | { type: 'plan-toggle'; on: boolean }
  | { type: 'explore-mode'; on: boolean }
  | { type: 'task-memory'; on: boolean }
  | { type: 'task-subagents'; on: boolean }
  | { type: 'task-planning'; on: boolean }
  | { type: 'search-scope' }
  | { type: 'fork-session' }
  | { type: 'rewind-session' }
  | { type: 'task-info' }
  | { type: 'prompt-history' }
  | { type: 'compact-session' }
  | { type: 'recap-session' }
  | { type: 'share-session' }
  | { type: 'export-session' }
  | { type: 'export-trace' }
  | { type: 'upload-trace' }
  | { type: 'new-task' }
  | { type: 'set-goal' }
  | { type: 'deep-research' }
  | { type: 'send-feedback' }
  | { type: 'start-kernel-loop' }
  | { type: 'generate-media'; media: 'image' | 'video' }
  | { type: 'edit-attached-image' }
  | { type: 'workflow'; name: string }
  | { type: 'engine-action'; name: string; title: string; description?: string }
  | { type: 'skill'; skill: SkillInfo };

export interface WorkflowMenuItem {
  name: string;
  description?: string;
  source?: string;
  workflowSource?: string;
}

type Row =
  | { kind: 'action'; id: string; title: string; desc: string; action: PlusAction }
  | { kind: 'label'; id: string; title: string };

interface Props {
  open: boolean;
  home?: boolean;
  planModeOn: boolean;
  /** `explore` is a new-task-only, kernel-owned read-only profile. */
  exploreModeOn?: boolean;
  /** New task only: the kernel's supported --no-memory process option. */
  taskMemoryEnabled?: boolean;
  /** New task only: disable kernel delegation with --no-subagents. */
  taskSubagentsEnabled?: boolean;
  /** New task only: disable kernel plan mode with --no-plan. */
  taskPlanningEnabled?: boolean;
  /** Current kernel explicitly supports ACP search tool overrides. */
  searchScopeAvailable?: boolean;
  skills: SkillInfo[];
  hasActiveSession: boolean;
  /** Show image edit only after the user has actually staged an image. */
  hasImageAttachment?: boolean;
  /** Session slash names without leading `/` — when non-empty, filter engine slash rows */
  availableCommandNames?: string[];
  /** Saved workflows announced by this exact live ACP session. */
  workflows?: WorkflowMenuItem[];
  /** Other live commands, retained only as guided desktop actions. */
  engineActions?: WorkflowMenuItem[];
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
  exploreModeOn = false,
  taskMemoryEnabled = true,
  taskSubagentsEnabled = true,
  taskPlanningEnabled = true,
  searchScopeAvailable = false,
  skills,
  hasActiveSession,
  hasImageAttachment = false,
  availableCommandNames,
  workflows = [],
  engineActions = [],
  onClose,
  onAction,
}: Props) {
  if (!open) return null;

  // Rich replies are rendered by the app. Do not surface retired internal
  // presentation helpers as a workflow for ordinary users.
  const invocable = skills
    .filter((s) => s.userInvocable && s.name.toLowerCase() !== 'answer-mode')
    .slice(0, 10);
  const workflowRows = workflows
    .filter((workflow) => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(workflow.name))
    .slice(0, 12)
    .map(
      (workflow): Row => ({
        kind: 'action',
        id: `workflow-${workflow.name}`,
        title: workflow.name,
        desc: (workflow.description || t('plusWorkflowHint')).replace(/^Workflow:\s*/i, ''),
        action: { type: 'workflow', name: workflow.name },
      }),
    );
  // Known commands already have focused desktop controls above. The remaining
  // live catalogue is still useful after kernel upgrades, but must never be
  // shown as a raw slash-command list to ordinary users.
  const handled = new Set([
    'btw', 'compact', 'clear', 'new', 'worktree', 'fork', 'rewind', 'recap',
    'share', 'feedback', 'loop', 'deep-research', 'imagine', 'imagine-video',
    'goal', 'plan', 'memory', 'flush', 'dream', 'export', 'model', 'effort',
    'context', 'review', 'diff', 'skills', 'mcp', 'plugins', 'sessions', 'resume',
  ]);
  const engineRows = engineActions
    .filter((command) => {
      const name = command.name.replace(/^\//, '').toLowerCase();
      return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)
        && !handled.has(name)
        && !command.workflowSource;
    })
    .slice(0, 12)
    .map((command): Row => ({
      kind: 'action',
      id: `engine-${command.name}`,
      title: command.description?.trim() || command.name.replace(/^\//, ''),
      desc: command.description?.trim() || t('plusWorkflowHint'),
      action: {
        type: 'engine-action',
        name: command.name.replace(/^\//, ''),
        title: command.description?.trim() || command.name.replace(/^\//, ''),
        description: command.description,
      },
    }));

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
      id: 'web-source',
      title: t('plusWebSource'),
      desc: t('plusWebSourceHint'),
      action: { type: 'open-web-source' },
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
    ...(home ? ([{
      kind: 'action' as const,
      id: 'explore-mode',
      title: exploreModeOn ? t('plusExploreOff') : t('plusExploreOn'),
      desc: t('plusExploreHint'),
      action: { type: 'explore-mode', on: !exploreModeOn } as PlusAction,
    }] as Row[]) : []),
    ...(home ? ([{
      kind: 'action' as const,
      id: 'task-planning',
      title: taskPlanningEnabled ? t('plusTaskPlanningOff') : t('plusTaskPlanningOn'),
      desc: taskPlanningEnabled ? t('plusTaskPlanningOffHint') : t('plusTaskPlanningOnHint'),
      action: { type: 'task-planning', on: !taskPlanningEnabled } as PlusAction,
    }] as Row[]) : []),
    ...(home ? ([{
      kind: 'action' as const,
      id: 'task-subagents',
      title: taskSubagentsEnabled ? t('plusTaskSubagentsOff') : t('plusTaskSubagentsOn'),
      desc: taskSubagentsEnabled ? t('plusTaskSubagentsOffHint') : t('plusTaskSubagentsOnHint'),
      action: { type: 'task-subagents', on: !taskSubagentsEnabled } as PlusAction,
    }] as Row[]) : []),
    ...(home ? ([{
      kind: 'action' as const,
      id: 'task-memory',
      title: taskMemoryEnabled ? t('plusTaskMemoryOff') : t('plusTaskMemoryOn'),
      desc: taskMemoryEnabled ? t('plusTaskMemoryOffHint') : t('plusTaskMemoryOnHint'),
      action: { type: 'task-memory', on: !taskMemoryEnabled } as PlusAction,
    }] as Row[]) : []),
    {
      kind: 'action',
      id: 'goal',
      title: t('plusGoal'),
      desc: t('plusGoalHint'),
      action: { type: 'set-goal' },
    },
    ...(hasActiveSession && slashAllowed('/deep-research', availableCommandNames) ? ([{
      kind: 'action' as const,
      id: 'deep-research',
      title: t('plusDeepResearch'),
      desc: t('plusDeepResearchHint'),
      action: { type: 'deep-research' } as PlusAction,
    }] as Row[]) : []),
    ...(hasActiveSession && searchScopeAvailable ? ([{
      kind: 'action' as const,
      id: 'search-scope',
      title: t('plusSearchScope'),
      desc: t('plusSearchScopeHint'),
      action: { type: 'search-scope' } as PlusAction,
    }] as Row[]) : []),
    ...(hasActiveSession && slashAllowed('/loop', availableCommandNames) ? ([{
      kind: 'action' as const,
      id: 'kernel-loop',
      title: t('plusKernelLoop'),
      desc: t('plusKernelLoopHint'),
      action: { type: 'start-kernel-loop' } as PlusAction,
    }] as Row[]) : []),
    ...(hasActiveSession ? ([{
      kind: 'action' as const,
      id: 'compact',
      title: t('plusCompact'),
      desc: t('plusCompactHint'),
      action: { type: 'compact-session' } as PlusAction,
    }] as Row[]) : []),
    ...(hasActiveSession && slashAllowed('/recap', availableCommandNames) ? ([{
      kind: 'action' as const,
      id: 'recap',
      title: t('plusRecap'),
      desc: t('plusRecapHint'),
      action: { type: 'recap-session' } as PlusAction,
    }] as Row[]) : []),

    ...(workflowRows.length
      ? ([
          { kind: 'label' as const, id: 'l-workflows', title: t('plusCatWorkflows') },
          ...workflowRows,
        ] as Row[])
      : []),
    ...(engineRows.length
      ? ([
          { kind: 'label' as const, id: 'l-engine', title: t('plusCatEngine') },
          ...engineRows,
        ] as Row[])
      : []),

    { kind: 'label', id: 'l-gen', title: t('plusCatGenerate') },
    {
      kind: 'action',
      id: 'imagine',
      title: t('plusImagine'),
      desc: t('plusImagineHint'),
      action: { type: 'generate-media', media: 'image' },
    },
    {
      kind: 'action',
      id: 'imagine-video',
      title: t('plusImagineVideo'),
      desc: t('plusImagineVideoHint'),
      action: { type: 'generate-media', media: 'video' },
    },
    ...(hasImageAttachment ? ([{
      kind: 'action' as const,
      id: 'edit-attached-image',
      title: t('plusEditImage'),
      desc: t('plusEditImageHint'),
      action: { type: 'edit-attached-image' } as PlusAction,
    }] as Row[]) : []),

    { kind: 'label', id: 'l-mem', title: t('plusCatMemory') },
    {
      kind: 'action',
      id: 'mem-panel',
      title: t('memoryTitle'),
      desc: t('plusMemoryHint'),
      action: { type: 'memory-panel' },
    },

    { kind: 'label', id: 'l-session', title: t('plusCatSession') },
    ...(hasActiveSession ? ([{
      kind: 'action' as const,
      id: 'task-info',
      title: t('taskInfoTitle'),
      desc: t('taskInfoMenuHint'),
      action: { type: 'task-info' } as PlusAction,
    }] as Row[]) : []),
    ...(hasActiveSession ? ([{
      kind: 'action' as const,
      id: 'prompt-history',
      title: t('plusPromptHistory'),
      desc: t('plusPromptHistoryHint'),
      action: { type: 'prompt-history' } as PlusAction,
    }] as Row[]) : []),
    ...(hasActiveSession && slashAllowed('/fork', availableCommandNames) ? ([{
      kind: 'action' as const,
      id: 'fork',
      title: t('plusFork'),
      desc: t('slashDescFork'),
      action: { type: 'fork-session' } as PlusAction,
    }] as Row[]) : []),
    ...(hasActiveSession && slashAllowed('/rewind', availableCommandNames) ? ([{
      kind: 'action' as const,
      id: 'rewind',
      title: t('plusRewind'),
      desc: t('slashDescRewind'),
      action: { type: 'rewind-session' } as PlusAction,
    }] as Row[]) : []),
    ...(hasActiveSession && slashAllowed('/feedback', availableCommandNames) ? ([{
      kind: 'action' as const,
      id: 'feedback',
      title: t('plusSendFeedback'),
      desc: t('plusSendFeedbackHint'),
      action: { type: 'send-feedback' } as PlusAction,
    }] as Row[]) : []),
    ...(hasActiveSession ? ([{
      kind: 'action' as const,
      id: 'export',
      title: t('plusExport'),
      desc: t('plusExportHint'),
      action: { type: 'export-session' } as PlusAction,
    }] as Row[]) : []),
    ...(hasActiveSession && slashAllowed('/share', availableCommandNames) ? ([{
      kind: 'action' as const,
      id: 'share',
      title: t('plusShareSession'),
      desc: t('plusShareSessionHint'),
      action: { type: 'share-session' } as PlusAction,
    }] as Row[]) : []),
    ...(hasActiveSession ? ([{
      kind: 'action' as const,
      id: 'export-trace',
      title: t('plusExportTrace'),
      desc: t('plusExportTraceHint'),
      action: { type: 'export-trace' } as PlusAction,
    }] as Row[]) : []),
    ...(hasActiveSession ? ([{
      kind: 'action' as const,
      id: 'upload-trace',
      title: t('plusUploadTrace'),
      desc: t('plusUploadTraceHint'),
      action: { type: 'upload-trace' } as PlusAction,
    }] as Row[]) : []),
    {
      kind: 'action',
      id: 'new',
      title: t('plusNewTask'),
      desc: t('slashDescNew'),
      action: { type: 'new-task' },
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
  ];

  // Drop engine slash rows the current session does not advertise
  const rows: Row[] = rawRows.filter((row) => {
    if (row.kind !== 'action') return true;
    const a = row.action;
    if (a.type === 'generate-media') return hasActiveSession && slashAllowed(a.media === 'image' ? '/imagine' : '/imagine-video', availableCommandNames);
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
