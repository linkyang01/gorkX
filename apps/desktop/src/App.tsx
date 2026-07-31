import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  Suspense,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import {
  AcpClient,
  extractUpdateText,
  extractUpdateImages,
  extractUpdateResourceLinks,
  fetchGrokStatus,
  stopAllAgents,
  parsePlanUpdate,
  parseSubagentUpdate,
  parseWorkflowUpdate,
  parseSessionRecapUpdate,
  parseKernelScheduledTaskDeletion,
  parseKernelScheduledTaskUpdate,
  isToolCallIdLike,
  parseToolUpdate,
  permissionResult,
  folderTrustResult,
  planApprovalResult,
  pickPermissionOption,
  userQuestionAcceptedResult,
  userQuestionCancelledResult,
  userQuestionPlanResult,
  type GrokStatus,
  type ModelInfo,
  type PermissionMode,
  type PermissionRequest,
  type FolderTrustRequest,
  type PlanApprovalRequest,
  type ReasoningEffort,
  type SearchToolOverrides,
  type RewindMode,
  type RewindPoint,
  type RewindResult,
  type HooksSnapshot,
  type AvailableCommandInfo,
  type AgentProfile,
  type WorkflowRunUpdate,
  type KernelScheduledTaskUpdate,
  type SessionUpdate,
  type UserQuestionAnswers,
  type UserQuestionAnnotations,
  type UserQuestionRequest,
  type KernelSessionSearchHit,
} from './lib/acpClient';
import type { ArchivedTaskRow, HookManagementAction, SettingsSection } from './components/SettingsPanel';
import { ToolTimeline, type ToolEvent } from './components/ToolTimeline';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { TaskSearchDialog } from './components/TaskSearchDialog';
import { MessageList, type ChatLine } from './components/MessageList';
import { AttachmentStrip } from './components/AttachmentStrip';
import { AttachmentPreview } from './components/AttachmentPreview';
import {
  TextPromptModal,
  type TextPromptRequest,
} from './components/TextPromptModal';
import {
  ActionPromptModal,
  type ActionPromptRequest,
} from './components/ActionPromptModal';
import {
  OnboardingModal,
  dismissOnboarding,
  isOnboardingDismissed,
} from './components/OnboardingModal';

import { ProcessPanel } from './components/ProcessPanel';
import { PlusMenu, type PlusAction } from './components/PlusMenu';
import { ProjectPicker, type ProjectPickerAction } from './components/ProjectPicker';
import {
  type ScheduledJob,
  computeNextRun,
  nextRunAfterOutcome,
  loadPersistentJobs,
  savePersistentJobs,
} from './lib/scheduled';
import { fetchMemoryInjection, recordSessionMemory } from './lib/memory';
import { listCustomModels } from './lib/modelsConfig';
import {
  parseTaskToolLimitsForm,
  sanitizeTaskToolLimits,
  TASK_TOOL_LIMIT_OPTIONS,
  withSessionToolConstraints,
  type TaskToolLimitId,
} from './lib/taskToolLimits';
import {
  decodePermissionRules,
  parsePermissionRulesForm,
  permissionRulesToForm,
  sanitizePermissionRules,
  splitPermissionRules,
  type PermissionRule,
} from './lib/taskPermissionRules';
import {
  formatTaskModelDisplay,
  resolveProviderForModelId,
} from './lib/modelVerify';
import {
  applyGoalPatch,
  goalFromMetaFields,
  goalStatusLabel,
  goalToMetaFields,
  isGoalToolName,
  makeGoal,
  parseGoalCommand,
  parseUpdateGoalPayload,
  recoverGoalFromLines,
  type SessionGoal,
} from './lib/sessionGoal';
import {
  IconExport,
  IconFork,
  IconForward,
  IconProcess,
  IconReview,
  IconSidebar,
  IconTerminal,
  IconBack,
} from './components/ChromeIcons';
import {
  IconPlus,
  IconFolder,
  IconFolderPinned,
  IconMore,
  IconRename,
  IconArchive,
  IconClose,
  IconSearch,
  IconPin,
  IconWorktree,
  IconRemoteSession,
  IconOpenFolder,
} from './components/UiIcons';
import {
  exportSessionClipboard,
  exportSessionMarkdown,
  exportSessionTrace,
  uploadSessionTrace,
} from './lib/grokAdmin';
import {
  attachmentsPromptBlock,
  attachmentResourceLinks,
  buildAttachment,
  buildWorkspaceResourceAttachment,
  resourceLinkFilePath,
  saveAgentImage,
  createNamedProject,
  projectsRoot,
  revokeAttachment,
  newAttachId,
  type ComposerAttachment,
} from './lib/attachments';
import { captureScreenRegion } from './lib/host';
import { withConversationPresentation } from './lib/conversationPresentation';
import { isInjectedUserPromptEcho } from './lib/chatFormat';
import {
  loadPinnedProjects,
  loadProjectAliases,
  loadRecentProjects,
  orderedProjects,
  projectDisplayName,
  pushRecentProject,
  removeRecentProject,
  togglePinProject,
} from './lib/projects';
import {
  clearProjectStore,
  homeDir,
  loadChatSnapshot,
  loadThreadMetas,
  NO_PROJECT_KEY,
  projectScopeKey,
  removeThreadMeta,
  saveChatSnapshot,
  upsertThreadMeta,
  type ThreadMeta,
  type ThreadSearchHit,
} from './lib/threads';
import { ContextRing } from './components/ContextRing';
import { PermShieldIcon } from './components/ComposerIcons';
import { SidebarNav } from './components/SidebarNav';
import { ThreadListRow } from './components/ThreadListRow';
import { AccountAvatar } from './components/AccountAvatar';
import { PermissionPrompt } from './components/PermissionPrompt';
import { UserQuestionPrompt } from './components/UserQuestionPrompt';
import { PlanApprovalPrompt } from './components/PlanApprovalPrompt';
import { FolderTrustPrompt } from './components/FolderTrustPrompt';
import { DeliverablesPanel } from './components/DeliverablesPanel';
import {
  ApprovalInboxPanel,
  type ApprovalInboxRow,
} from './components/ApprovalInboxPanel';
import { RewindDialog } from './components/RewindDialog';
import { AppBanners } from './components/AppBanners';
import { SlashMenu } from './components/SlashMenu';
import {
  fetchAccountSummary,
  fetchModelContext,
  fetchSubscriptionModels,
  loadDisplayNameOverride,
  saveDisplayNameOverride,
  uiDisplayName,
  startLoginFlow,
  logoutAccount,
  requiresAccountReauthentication,
} from './lib/account';
import type { AccountSummary } from './lib/account';
import {
  checkAppUpdate,
  installAppUpdate,
  openUrlSafe,
  openWebPreview,
  type AppUpdateInfo,
} from './lib/updates';
import {
  canAutoTitle,
  estimateContextUsed,
  formatContextBar,
  formatUsage,
  isPlaceholderTitle,
  titleFromUserText,
  usageFromUnknown,
  type ModelContextInfo,
  type UsageSnapshot,
} from './lib/usage';
import { notifyPermission, revealInFinder } from './lib/host';
import { recordDailyTokenUsage } from './lib/dailyTokenUsage';
import {
  fetchExtensionsSnapshot,
  listWorkspaceFiles,
  type ExtensionsSnapshot,
  type FileHit,
  type SkillInfo,
} from './lib/extensions';
import { t } from './lib/i18n';
import { effortShortLabel, formatPeriodEnd, modelShortLabel } from './lib/threadLabels';
import { formatThreadClock, threadListLabel } from './lib/threadList';
import { snapToLines } from './lib/threadSnapshots';
import {
  loadOptInPanelOpen,
  OPT_IN_PANEL_KEYS,
  pickHomeRecentTasks,
} from './lib/panelLayout';
import {
  canAnswerApproval,
  DEFAULT_STALL_MS,
  deriveCurrentStep,
  deriveTaskRunPhase,
  isTaskStalled,
  resolveBusyFollowUpMode,
  shouldShowInRunCenter,
  type TaskRunPhase,
} from './lib/taskRunStatus';
import { RunCenterPanel, type RunCenterRow } from './components/RunCenterPanel';
import './App.css';

// Panels below are opened deliberately, not needed to render a task or the
// first-run screen. Keep their real implementations intact but load them only
// when the user asks for the corresponding Codex-style workspace surface.
const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then(({ SettingsPanel }) => ({ default: SettingsPanel })),
);
const ExtensionsPanel = lazy(() =>
  import('./components/ExtensionsPanel').then(({ ExtensionsPanel }) => ({ default: ExtensionsPanel })),
);
const ReviewPanel = lazy(() =>
  import('./components/ReviewPanel').then(({ ReviewPanel }) => ({ default: ReviewPanel })),
);
const TerminalDock = lazy(() =>
  import('./components/TerminalDock').then(({ TerminalDock }) => ({ default: TerminalDock })),
);
const MemoryPanel = lazy(() =>
  import('./components/MemoryPanel').then(({ MemoryPanel }) => ({ default: MemoryPanel })),
);
const WorktreePanel = lazy(() =>
  import('./components/WorktreePanel').then(({ WorktreePanel }) => ({ default: WorktreePanel })),
);
const ScheduledPanel = lazy(() =>
  import('./components/ScheduledPanel').then(({ ScheduledPanel }) => ({ default: ScheduledPanel })),
);
const ProjectInspectPanel = lazy(() =>
  import('./components/ProjectInspectPanel').then(({ ProjectInspectPanel }) => ({ default: ProjectInspectPanel })),
);
const TaskInfoPanel = lazy(() =>
  import('./components/TaskInfoPanel').then(({ TaskInfoPanel }) => ({ default: TaskInfoPanel })),
);

function DeferredPanelFallback() {
  return <div className="app-panel-loading" role="status">{t('reviewLoading')}</div>;
}

export type ChatMode = 'agent' | 'plan';
type NewTaskProfile = string;

/**
 * Plan is already a first-class desktop control.  Supplying the matching
 * portable Grok Build profile at session creation makes its role explicit to
 * the kernel before the first user turn; `session/set_mode(plan)` below still
 * owns the engine's actual plan-mode control plane.
 */
function projectRoleNameForCwd(profile: NewTaskProfile, cwd: string): string | null {
  const match = /^project:([^|]+)\|(.+)$/.exec(profile);
  if (!match) return null;
  try { return decodeURIComponent(match[1]) === cwd ? match[2] : null; } catch { return null; }
}

function agentProfileForNewTask(
  mode: ChatMode,
  profile: NewTaskProfile,
  cwd: string,
  maxTurns?: number | null,
  disallowedTools?: string[],
): AgentProfile | undefined {
  let base: AgentProfile | undefined;
  if (mode === 'plan') {
    base = {
      name: 'gorkx-plan',
      description: 'A plan-first assistant for a gorkX desktop task.',
      promptMode: 'extend',
      permissionMode: 'default',
      promptBody:
        'Work plan-first. Understand the request and relevant project context, then present a clear, actionable plan before proposing changes. Keep the user in control of consequential actions.',
    };
  } else if (profile.startsWith('project:')) {
    // `explore` and project roles are kernel-owned names; the desktop only
    // selects them for a new task and does not recreate their toolsets.
    base = projectRoleNameForCwd(profile, cwd) ?? undefined;
  } else {
    base = profile !== 'default' ? profile : undefined;
  }
  return withSessionToolConstraints(base, { maxTurns, disallowedTools }) as AgentProfile | undefined;
}

/**
 * The kernel's history-repair extension is only offered for the corruption
 * signature it can actually fix. Keep the action out of ordinary tool errors
 * so a repair button never suggests rewriting a healthy session.
 */
function isRepairableSessionError(raw: string): boolean {
  return /(tool_use_id|tool_call_id|tool_result|unexpected .*tool|orphan(?:ed)? .*result|corrupt(?:ed)? .*history|history .*corrupt)/i.test(raw);
}

interface Thread {
  id: string;
  title: string;
  sessionId: string | null;
  modelId: string | null;
  client: AcpClient | null;
  lines: ChatLine[];
  busy: boolean;
  error: string | null;
  chatMode: ChatMode;
  worktreePath?: string | null;
  cwd: string;
  /** Project folder, or NO_PROJECT_KEY for inbox chats */
  projectKey: string;
  archived?: boolean;
  /** Effort used when this agent process was spawned */
  effort: ReasoningEffort;
  usage?: UsageSnapshot | null;
  commands?: AvailableCommandInfo[];
  /** Last activity — sidebar sort / same-title disambiguation */
  updatedAt?: number;
  /** Hermes: inject once on first real user prompt */
  memoryInject?: string | null;
  memoryInjected?: boolean;
  /** user turns completed — for auto-learn */
  userTurnCount?: number;
  /** Active /goal for this task (banner + persist; agent owns execution) */
  sessionGoal?: SessionGoal | null;
  /** This task was started with Grok Build cross-task memory disabled. */
  memoryEnabled?: boolean;
  /** This task was started with Grok Build subagent delegation disabled. */
  subagentsEnabled?: boolean;
  /** This task was started with Grok Build planning disabled. */
  planningEnabled?: boolean;
  /** Built-in tool ids denied for this task at process start. */
  disallowedTools?: string[];
  /** Grok `--allow` / `--deny` rules applied at process start. */
  permissionRules?: PermissionRule[];
  /** This exact ACP process advertised native search tool overrides. */
  searchScopeAvailable?: boolean;
  /** Applied to the next prompt; the engine then retains it for the session. */
  pendingSearchScope?: SearchToolOverrides | null;
  /** Last real ACP stream / tool / approval heartbeat (Stage B stall detection). */
  lastEventAt?: number;
}

type PendingApproval =
  | { key: string; kind: 'permission'; threadId: string; createdAt: number; request: PermissionRequest }
  | { key: string; kind: 'question'; threadId: string; createdAt: number; request: UserQuestionRequest }
  | { key: string; kind: 'plan'; threadId: string; createdAt: number; request: PlanApprovalRequest }
  | { key: string; kind: 'trust'; threadId: string; createdAt: number; request: FolderTrustRequest };

/** Text entered in the desktop search-scope form becomes the kernel's native
 * ACP metadata, not an instruction hidden in the prompt. */
function parseSearchScopeForm(value: string): SearchToolOverrides | null {
  const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  let fromDate: string | undefined;
  let toDate: string | undefined;
  const dateMatch = lines[0]?.match(/^(\d{4}-\d{2}-\d{2})?\s*\.\.\s*(\d{4}-\d{2}-\d{2})?$/);
  if (dateMatch) {
    fromDate = dateMatch[1] || undefined;
    toDate = dateMatch[2] || undefined;
    lines.shift();
  }
  const domains = lines.flatMap((line) => line.split(/[\s,]+/)).filter(Boolean).map((domain) => domain.toLowerCase());
  if (!fromDate && !toDate && !domains.length) throw new Error('请填写日期范围或至少一个网站域名。');
  for (const date of [fromDate, toDate]) {
    if (date && Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error('日期请使用 YYYY-MM-DD 格式。');
  }
  if (fromDate && toDate && fromDate > toDate) throw new Error('开始日期不能晚于结束日期。');
  if (domains.length > 64 || domains.some((domain) => !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))) throw new Error('网站请只填写域名，例如 example.com；最多 64 个。');
  return { ...(fromDate ? { fromDate } : {}), ...(toDate ? { toDate } : {}), ...(domains.length ? { allowedDomains: [...new Set(domains)] } : {}) };
}

/** Bounded, server-provided follow-up chips for one task's latest response. */
type FollowUpState = {
  responseId: string;
  suggestions: string[];
};

function readFollowUps(raw: unknown): FollowUpState | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const responseId = typeof value.response_id === 'string' ? value.response_id.trim() : '';
  if (!responseId || responseId.length > 128 || !Array.isArray(value.suggestions)) return null;
  const seen = new Set<string>();
  const suggestions = value.suggestions.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const rawLabel = (item as Record<string, unknown>).label;
    const label = typeof rawLabel === 'string' ? rawLabel : '';
    // ACP extension payloads are untrusted. Keep visible text printable and
    // bounded before it becomes a clickable send action.
    const clean = label
      .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 256);
    if (!clean || seen.has(clean)) return [];
    seen.add(clean);
    return [clean];
  }).slice(0, 6);
  return suggestions.length ? { responseId, suggestions } : null;
}

interface RecentSession {
  sessionId: string;
  title?: string | null;
  cwd?: string;
  modelId?: string;
  lastChangeUnixMs?: number;
}


let lineSeq = 1;
/** Chat line ids (in-memory only). */
const nid = () => `n${lineSeq++}`;
/** Stable unique thread ids — never reuse across reloads (avoids same-name collapse). */
const tid = () => {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `t_${crypto.randomUUID()}`;
    }
  } catch {
    /* */
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

function cleanStoredTitle(raw: string, fallback: string): string {
  const stripped = titleFromUserText(raw);
  if (stripped) return stripped;
  const s = (raw || '').replace(/\s*\[Attached[\s\S]*$/i, '').trim();
  return s || fallback;
}

/** Sidebar rows for one scope (project path or NO_PROJECT_KEY). Newest first. */
function threadsForScope(list: Thread[], scope: string): Thread[] {
  const key = projectScopeKey(scope);
  return list
    .filter((th) => !th.archived && projectScopeKey(th.projectKey) === key)
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * Pick a title that doesn't collide with other threads in the same project.
 * "foo" → "foo" → "foo · 14:32" → "foo · 14:32 · 2"
 */
function uniquifyThreadTitle(
  base: string,
  siblings: Thread[],
  excludeId?: string,
): string {
  const root = (base || '').trim() || t('newThread');
  const taken = new Set(
    siblings
      .filter((th) => th.id !== excludeId && !th.archived)
      .map((th) => (th.title || '').trim().toLowerCase()),
  );
  if (!taken.has(root.toLowerCase())) return root;
  const withTime = `${root} · ${formatThreadClock(Date.now()) || Date.now().toString(36).slice(-4)}`;
  if (!taken.has(withTime.toLowerCase())) return withTime;
  for (let n = 2; n < 99; n++) {
    const cand = `${root} · ${n}`;
    if (!taken.has(cand.toLowerCase())) return cand;
  }
  return `${root} · ${tid().slice(-6)}`;
}

function metaToStub(m: ThreadMeta, lines?: ChatLine[]): Thread {
  const chatLines =
    lines && lines.length > 0
      ? lines
      : [
          {
            id: nid(),
            role: 'system' as const,
            text: t('restoredHint'),
          },
        ];
  const fromMeta = goalFromMetaFields(
    m.sessionGoalText,
    m.sessionGoalStatus,
    m.sessionGoalMessage,
  );
  const fromLines = !fromMeta ? recoverGoalFromLines(chatLines) : null;
  return {
    id: m.id,
    title: cleanStoredTitle(m.title || '', m.sessionId?.slice(0, 8) || 'session'),
    sessionId: m.sessionId,
    modelId: m.modelId,
    client: null,
    lines: chatLines,
    busy: false,
    error: null,
    chatMode: m.chatMode === 'plan' ? 'plan' : 'agent',
    worktreePath: m.worktreePath,
    cwd: m.cwd,
    projectKey: projectScopeKey(m.project),
    archived: Boolean(m.archived),
    effort: m.effort || 'high',
    memoryEnabled: m.memoryEnabled !== false,
    subagentsEnabled: m.subagentsEnabled !== false,
    planningEnabled: m.planningEnabled !== false,
    disallowedTools: sanitizeTaskToolLimits(m.disallowedTools),
    permissionRules: sanitizePermissionRules(m.permissionRules),
    updatedAt: m.updatedAt || Date.now(),
    sessionGoal: fromMeta || fromLines,
  };
}

function App() {
  const [project, setProject] = useState(() => localStorage.getItem('gorkx.project') ?? '');
  const [recentProjects, setRecentProjects] = useState<string[]>(() => loadRecentProjects());
  const [pinnedProjects, setPinnedProjects] = useState<string[]>(() => loadPinnedProjects());
  const [projectAliases, setProjectAliases] = useState(() => loadProjectAliases());
  const [projectMenuPath, setProjectMenuPath] = useState<string | null>(null);
  const [projectInspectPath, setProjectInspectPath] = useState<string | null>(null);
  const [taskInfoOpen, setTaskInfoOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection | undefined>();
  const [addProjectMenuOpen, setAddProjectMenuOpen] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [composerAtts, setComposerAtts] = useState<ComposerAttachment[]>([]);
  const [previewAtt, setPreviewAtt] = useState<ComposerAttachment | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  /** Highlight index in / command menu (keyboard + hover). */
  const [slashIndex, setSlashIndex] = useState(0);
  /** Highlight index in @ file menu. */
  const [atIndex, setAtIndex] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [taskSearchOpen, setTaskSearchOpen] = useState(false);
  const [perm, setPerm] = useState<PermissionMode>(() => {
    const v = localStorage.getItem('gorkx.perm');
    return v === 'auto' || v === 'full' ? v : 'default';
  });
  const [chatMode, setChatMode] = useState<ChatMode>(() => {
    return localStorage.getItem('gorkx.chatMode') === 'plan' ? 'plan' : 'agent';
  });
  const [newTaskProfile, setNewTaskProfile] = useState<NewTaskProfile>(() => localStorage.getItem('gorkx.newTaskProfile') || 'default');
  /** A per-task choice; false maps to Grok Build's real `--no-memory` flag. */
  const [newTaskMemoryEnabled, setNewTaskMemoryEnabled] = useState(() => {
    try {
      return localStorage.getItem('gorkx.newTaskMemoryEnabled') !== '0';
    } catch {
      return true;
    }
  });
  const [newTaskSubagentsEnabled, setNewTaskSubagentsEnabled] = useState(() => {
    try {
      return localStorage.getItem('gorkx.newTaskSubagentsEnabled') !== '0';
    } catch {
      return true;
    }
  });
  const [newTaskPlanningEnabled, setNewTaskPlanningEnabled] = useState(() => {
    try {
      return localStorage.getItem('gorkx.newTaskPlanningEnabled') !== '0';
    } catch {
      return true;
    }
  });
  /** New-task denylist of built-in Grok tools (`--disallowed-tools`). */
  const [newTaskDisallowedTools, setNewTaskDisallowedTools] = useState<TaskToolLimitId[]>(() => {
    try {
      return sanitizeTaskToolLimits(JSON.parse(localStorage.getItem('gorkx.newTaskDisallowedTools') || '[]'));
    } catch {
      return [];
    }
  });
  /** New-task Grok `--allow` / `--deny` permission rules. */
  const [newTaskPermissionRules, setNewTaskPermissionRules] = useState<PermissionRule[]>(() => {
    try {
      return decodePermissionRules(localStorage.getItem('gorkx.newTaskPermissionRules'));
    } catch {
      return [];
    }
  });
  const [effort, setEffort] = useState<ReasoningEffort>(() => {
    const v = localStorage.getItem('gorkx.effort');
    return v === 'low' || v === 'medium' || v === 'high' ? v : 'high';
  });
  const [modelId, setModelId] = useState(() => localStorage.getItem('gorkx.modelId') ?? '');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  /** Custom API rows for provider labels on the task chrome (no secrets). */
  const [customModelRows, setCustomModelRows] = useState<
    Array<{ model: string; id: string; providerLabel?: string; baseUrl?: string }>
  >([]);
  const [taskFilter, setTaskFilter] = useState('');
  /** When user opens a worktree path as project, remember the original repo. */
  const [worktreeMainProject, setWorktreeMainProject] = useState<string | null>(() => {
    try {
      return localStorage.getItem('gorkx.worktreeMainProject');
    } catch {
      return null;
    }
  });
  const [grokCmd, setGrokCmd] = useState(() => localStorage.getItem('gorkx.grokCmd') ?? '');
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => {
    try {
      return localStorage.getItem('gorkx.webSearchEnabled') !== '0';
    } catch {
      return true;
    }
  });
  /** Optional Grok Build `--max-turns` cap for newly started agent processes. */
  const [maxAgentTurns, setMaxAgentTurns] = useState<number | null>(() => {
    try {
      const value = Number.parseInt(localStorage.getItem('gorkx.maxAgentTurns') || '', 10);
      return Number.isInteger(value) && value >= 1 && value <= 200 ? value : null;
    } catch {
      return null;
    }
  });
  const [voiceShortcutEnabled, setVoiceShortcutEnabled] = useState(() => {
    try {
      return localStorage.getItem('gorkx.voiceShortcutEnabled') !== '0';
    } catch {
      return true;
    }
  });
  const [kernelOpen, setKernelOpen] = useState(false);
  // Opt-in panels: empty Review/Terminal never occupy the main stage by default.
  const [reviewOpen, setReviewOpen] = useState(() =>
    loadOptInPanelOpen(OPT_IN_PANEL_KEYS.review),
  );
  const [terminalOpen, setTerminalOpen] = useState(() =>
    loadOptInPanelOpen(OPT_IN_PANEL_KEYS.terminal),
  );

  const [extOpen, setExtOpen] = useState(false);
  const [extSnap, setExtSnap] = useState<ExtensionsSnapshot | null>(null);
  const [atOpen, setAtOpen] = useState(false);
  const [atQuery, setAtQuery] = useState('');
  const [atHits, setAtHits] = useState<FileHit[]>([]);
  const [status, setStatus] = useState<GrokStatus | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [modelCtx, setModelCtx] = useState<ModelContextInfo | null>(null);
  /** Always auto-compact near context limit — no user-facing toggle. */
  const compactingRef = useRef(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [followUps, setFollowUps] = useState<Record<string, FollowUpState>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  /** Session currently holding Grok Build's native microphone pipeline. */
  const [voiceListeningSessionId, setVoiceListeningSessionId] = useState<string | null>(null);
  /** Streaming text is intentionally preview-only until Grok Build finalizes it. */
  const [voiceInterim, setVoiceInterim] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  /** Local display preference equivalent to Grok Build TUI's timestamps. */
  const [showMessageTimestamps, setShowMessageTimestamps] = useState(() => {
    try {
      return localStorage.getItem('gorkx.showMessageTimestamps') === '1';
    } catch {
      return false;
    }
  });
  /** Capability armed in composer (user completes request in chat). */
  const [capabilityArm, setCapabilityArm] = useState<{
    prefix: string;
    label: string;
  } | null>(null);
  // A composer draft and staged files belong to the project the user was
  // working in. Never carry them into a different project/home workspace:
  // that is confusing at best and can send the wrong material at worst.
  const composerProjectRef = useRef(project);
  useEffect(() => {
    if (composerProjectRef.current === project) return;
    composerProjectRef.current = project;
    setDraft('');
    setCapabilityArm(null);
    setComposerAtts((items) => {
      items.forEach(revokeAttachment);
      return [];
    });
    setPreviewAtt(null);
    setPlusMenuOpen(false);
    setSlashOpen(false);
    setAtOpen(false);
    setAtQuery('');
  }, [project]);
  /** Outstanding, live ACP decisions across every connected task. */
  const [approvalQueue, setApprovalQueue] = useState<PendingApproval[]>([]);
  const [activeApprovalKey, setActiveApprovalKey] = useState<string | null>(null);
  const [approvalInboxOpen, setApprovalInboxOpen] = useState(false);
  /** Per-task follow-up text queued until busy ends. */
  const [queuedFollowUps, setQueuedFollowUps] = useState<Record<string, string>>({});
  /** A side question is independent of the main task's busy state. */
  const [asideBusyThreadId, setAsideBusyThreadId] = useState<string | null>(null);
  /** User chose "keep waiting" — suppress stall banner until the next heartbeat gap. */
  const [stallSnoozeUntil, setStallSnoozeUntil] = useState<Record<string, number>>({});
  const [stallClock, setStallClock] = useState(() => Date.now());
  const [deliverablesOpen, setDeliverablesOpen] = useState(false);
  /** An engine failure must remain inspectable; a red badge alone is not useful. */
  const [taskErrorOpen, setTaskErrorOpen] = useState(false);
  const [taskReauthBusy, setTaskReauthBusy] = useState(false);
  const [sessionRepairBusyId, setSessionRepairBusyId] = useState<string | null>(null);
  /** Local projection of Grok Build's current-session prompt history. */
  const [promptHistoryOpen, setPromptHistoryOpen] = useState(false);
  const [promptHistoryIndex, setPromptHistoryIndex] = useState(-1);
  const [kernelPromptHistory, setKernelPromptHistory] = useState<string[]>([]);
  const [kernelPromptHistoryLoading, setKernelPromptHistoryLoading] = useState(false);
  const [kernelPromptHistoryError, setKernelPromptHistoryError] = useState<string | null>(null);
  const [promptSuggestion, setPromptSuggestion] = useState<{ threadId: string; text: string } | null>(null);
  const [promptSuggestionBusy, setPromptSuggestionBusy] = useState(false);
  const [promptSuggestionError, setPromptSuggestionError] = useState<string | null>(null);
  const [rewindDialog, setRewindDialog] = useState<{
    threadId: string;
    points: RewindPoint[];
    error?: string | null;
    busy?: boolean;
    preview?: RewindResult | null;
  } | null>(null);
  /** Optional Grok kernel sessions listed under a project (opt-in history). */
  const [projectSessions, setProjectSessions] = useState<Record<string, RecentSession[]>>({});
  const [dismissedSessions, setDismissedSessions] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('gorkx.dismissedSessions');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [ctxPopOpen, setCtxPopOpen] = useState(false);
  /** Composer compact menus: model+effort · permission (Codex-style). */
  const [modelPopOpen, setModelPopOpen] = useState(false);
  const [permPopOpen, setPermPopOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  /** Local-only nickname for the sidebar chip (API name stays unchanged). */
  const [nameOverride, setNameOverride] = useState(() => loadDisplayNameOverride());
  const [nameEditOpen, setNameEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [appUpdateBanner, setAppUpdateBanner] = useState<AppUpdateInfo | null>(null);
  /** Opt-in: show Grok kernel history under selected project (not auto-loaded). */
  const [showGrokHistory, setShowGrokHistory] = useState(false);
  const [_grokHistoryLoading, _setGrokHistoryLoading] = useState(false);
  void _grokHistoryLoading;
  void _setGrokHistoryLoading;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('gorkx.sidebarCollapsed') === '1';
  });
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);

  const [worktreePanelOpen, setWorktreePanelOpen] = useState(false);
  /** Process stream (thinking/tools) — closed by default like a detachable pane */
  const [processOpen, setProcessOpen] = useState(() => {
    return localStorage.getItem('gorkx.processOpen') === '1';
  });
  /** Replaces window.prompt (broken/silent in Tauri WKWebView). */
  const [textPrompt, setTextPrompt] = useState<
    (TextPromptRequest & { resolve: (v: string | null) => void }) | null
  >(null);
  const [actionPrompt, setActionPrompt] = useState<
    (ActionPromptRequest & { resolve: (v: string | null) => void }) | null
  >(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const permModeRef = useRef(perm);
  permModeRef.current = perm;
  /** Session navigation history (Codex-like back/forward between tasks). */
  const navStackRef = useRef<Array<string | null>>([]);
  const navIdxRef = useRef(-1);
  const navFromHistoryRef = useRef(false);
  const [navTick, setNavTick] = useState(0); // re-render for disabled state

  const selectThread = useCallback((id: string | null) => {
    if (navFromHistoryRef.current) {
      navFromHistoryRef.current = false;
      setActiveId(id);
      return;
    }
    const cur = navStackRef.current[navIdxRef.current];
    if (cur === id && navIdxRef.current >= 0) {
      setActiveId(id);
      return;
    }
    // drop forward entries
    if (navIdxRef.current < navStackRef.current.length - 1) {
      navStackRef.current = navStackRef.current.slice(0, navIdxRef.current + 1);
    }
    navStackRef.current.push(id);
    if (navStackRef.current.length > 64) {
      navStackRef.current = navStackRef.current.slice(-64);
    }
    navIdxRef.current = navStackRef.current.length - 1;
    setActiveId(id);
    setNavTick((n) => n + 1);
    // Auto-connect when opening a saved task (no manual reconnect)
    if (id) {
      const th = threadsRef.current.find((x) => x.id === id);
      if (th?.sessionId && !th.client && !th.busy) {
        void reconnectRef.current?.(id)?.catch(() => {});
      }
    }
  }, []);

  /** Open a local search result without treating the kernel session store as a
   * second task list. The result always comes from gorkX's own SQLite index. */
  const openTaskSearchHit = useCallback(async (hit: ThreadSearchHit) => {
    // Opening an archived result is an intentional restore action; otherwise
    // the normal workspace filter would immediately hide the selected task.
    const opened = hit.archived ? { ...hit, archived: false, updatedAt: Date.now() } : hit;
    if (hit.archived) await upsertThreadMeta(hit.project, opened);
    const snaps = await loadChatSnapshot(opened.project, opened.id);
    const restored = metaToStub(opened, snapToLines(snaps));
    setThreads((previous) => {
      const current = previous.find((thread) => thread.id === opened.id && thread.projectKey === opened.project);
      if (current?.client) return previous;
      return [...previous.filter((thread) => !(thread.id === opened.id && thread.projectKey === opened.project)), restored];
    });
    const nextProject = opened.project === NO_PROJECT_KEY ? '' : opened.project;
    setProject(nextProject);
    if (nextProject) setRecentProjects(pushRecentProject(nextProject));
    setTaskSearchOpen(false);
    // Wait for the project scope and restored row to reach state before using
    // the normal task-opening path (including its usual session reconnect).
    window.setTimeout(() => selectThread(opened.id), 0);
  }, [selectThread]);

  /** Open a native Grok Build history hit by indexing it into gorkX's task list. */
  const openKernelSearchHit = useCallback(async (hit: KernelSessionSearchHit) => {
    const sessionId = hit.sessionId.trim();
    const cwd = hit.cwd.trim();
    if (!sessionId || !cwd) return;
    const existing = threadsRef.current.find((thread) => thread.sessionId === sessionId);
    if (existing) {
      setProject(existing.projectKey === NO_PROJECT_KEY ? '' : existing.projectKey);
      setTaskSearchOpen(false);
      window.setTimeout(() => selectThread(existing.id), 0);
      return;
    }
    const id = `kernel_${sessionId}`;
    const parsedUpdatedAt = Date.parse(hit.updatedAt);
    const meta: ThreadMeta = {
      id,
      title: hit.summary || t('newThread'),
      sessionId,
      modelId: null,
      cwd,
      effort: 'high',
      chatMode: 'agent',
      memoryEnabled: true,
      subagentsEnabled: true,
      planningEnabled: true,
      updatedAt: Number.isFinite(parsedUpdatedAt) ? parsedUpdatedAt : Date.now(),
      project: cwd,
      archived: false,
    };
    await upsertThreadMeta(cwd, meta);
    const stub = metaToStub(meta);
    setThreads((previous) => [
      ...previous.filter((thread) => thread.sessionId !== sessionId && thread.id !== id),
      stub,
    ]);
    setProject(cwd);
    setRecentProjects(pushRecentProject(cwd));
    setTaskSearchOpen(false);
    // Let the project scope and restored row commit before the normal reconnect path.
    window.setTimeout(() => selectThread(id), 0);
  }, [selectThread]);

  const canNavBack = navIdxRef.current > 0;
  const canNavForward =
    navIdxRef.current >= 0 && navIdxRef.current < navStackRef.current.length - 1;

  const navBack = useCallback(() => {
    if (navIdxRef.current <= 0) return;
    navIdxRef.current -= 1;
    navFromHistoryRef.current = true;
    const id = navStackRef.current[navIdxRef.current] ?? null;
    setActiveId(id);
    setNavTick((n) => n + 1);
    // restore project scope for that thread if needed
    if (id) {
      const th = threadsRef.current.find((x) => x.id === id);
      if (th && th.projectKey && th.projectKey !== NO_PROJECT_KEY) {
        setProject(th.projectKey);
        localStorage.setItem('gorkx.project', th.projectKey);
      }
    }
  }, []);

  const navForward = useCallback(() => {
    if (navIdxRef.current >= navStackRef.current.length - 1) return;
    navIdxRef.current += 1;
    navFromHistoryRef.current = true;
    const id = navStackRef.current[navIdxRef.current] ?? null;
    setActiveId(id);
    setNavTick((n) => n + 1);
    if (id) {
      const th = threadsRef.current.find((x) => x.id === id);
      if (th && th.projectKey && th.projectKey !== NO_PROJECT_KEY) {
        setProject(th.projectKey);
        localStorage.setItem('gorkx.project', th.projectKey);
      }
    }
  }, []);
  void navTick; // used for chrome disabled re-render
  const createThreadRef = useRef<
    | ((opts?: {
        worktree?: boolean;
        initialPrompt?: string;
        initialDisplay?: string;
        initialAttachments?: ComposerAttachment[];
        profileOverride?: NewTaskProfile;
      }) => Promise<{ ok: boolean; error?: string }>)
    | null
  >(null);
  const reconnectRef = useRef<((id: string) => Promise<AcpClient | null>) | null>(null);
  const threadsRef = useRef<Thread[]>([]);
  const activeIdRef = useRef<string | null>(activeId);
  /** Prevent reconnect storm if agent keeps dying */
  const autoReconnectTried = useRef<Set<string>>(new Set());

  const active = useMemo(() => {
    const th = threads.find((x) => x.id === activeId) ?? null;
    if (!th) return null;
    // Only show threads for current project scope
    if (th.projectKey !== projectScopeKey(project) || th.archived) return null;
    return th;
  }, [threads, activeId, project]);
  /** The selected decision remains live in the original ACP session. */
  const activeApproval = useMemo(
    () => approvalQueue.find((entry) => entry.key === activeApprovalKey) ?? approvalQueue[0] ?? null,
    [activeApprovalKey, approvalQueue],
  );
  const approvalInboxRows = useMemo<ApprovalInboxRow[]>(() => approvalQueue.map((entry) => {
    const thread = threads.find((item) => item.id === entry.threadId);
    const projectLabel = thread?.cwd
      ? projectDisplayName(thread.cwd, projectAliases)
      : undefined;
    const trimPreview = (text: string | undefined, fallback: string) => {
      const clean = (text ?? '').replace(/\s+/g, ' ').trim();
      return (clean || fallback).slice(0, 180);
    };
    switch (entry.kind) {
      case 'permission':
        return {
          key: entry.key, kind: entry.kind, threadId: entry.threadId, createdAt: entry.createdAt,
          threadTitle: thread?.title ?? t('approvalInboxUnknownTask'), projectLabel,
          title: t('approvalInboxPermissionTitle'), detail: t('approvalInboxPermissionHint'),
        };
      case 'question':
        return {
          key: entry.key, kind: entry.kind, threadId: entry.threadId, createdAt: entry.createdAt,
          threadTitle: thread?.title ?? t('approvalInboxUnknownTask'), projectLabel,
          title: trimPreview(entry.request.questions[0]?.question, t('approvalInboxQuestionTitle')),
          detail: entry.request.questions.length > 1
            ? t('approvalInboxQuestionCount').replace('{count}', String(entry.request.questions.length))
            : t('approvalInboxQuestionHint'),
        };
      case 'plan':
        return {
          key: entry.key, kind: entry.kind, threadId: entry.threadId, createdAt: entry.createdAt,
          threadTitle: thread?.title ?? t('approvalInboxUnknownTask'), projectLabel,
          title: t('approvalInboxPlanTitle'), detail: trimPreview(entry.request.planContent, t('approvalInboxPlanHint')),
        };
      case 'trust':
        return {
          key: entry.key, kind: entry.kind, threadId: entry.threadId, createdAt: entry.createdAt,
          threadTitle: thread?.title ?? t('approvalInboxUnknownTask'), projectLabel,
          title: t('approvalInboxTrustTitle'), detail: trimPreview(entry.request.workspace, t('approvalInboxTrustHint')),
        };
    }
  }), [approvalQueue, projectAliases, threads]);
  const activeDeliverables = useMemo(() => {
    if (!active) return [];
    const seen = new Set<string>();
    return active.lines.flatMap((line) => line.role === 'assistant' ? (line.attachments ?? []) : [])
      .filter((item) => {
        // ACP-surfaced only; path may be empty for pure link attachments.
        const key = item.href && !item.path
          ? `href:${item.href}`
          : `${item.path}\u0000${item.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [active]);
  const activeDeliverableLinks = useMemo(() => {
    if (!active) return [];
    const out: { id: string; href: string; name?: string }[] = [];
    const seen = new Set<string>();
    for (const line of active.lines) {
      for (const att of line.attachments ?? []) {
        if (att.href && /^https?:\/\//i.test(att.href) && !seen.has(att.href)) {
          seen.add(att.href);
          out.push({ id: att.id, href: att.href, name: att.name });
        }
      }
    }
    return out;
  }, [active]);
  const enqueueApproval = useCallback((entry: PendingApproval) => {
    setApprovalQueue((previous) => previous.some((item) => item.key === entry.key) ? previous : [...previous, entry]);
    setActiveApprovalKey((previous) => previous ?? entry.key);
    // Approval is a real ACP pause — count as heartbeat for the origin task.
    setThreads((prev) =>
      prev.map((th) =>
        th.id === entry.threadId
          ? { ...th, lastEventAt: entry.createdAt || Date.now(), updatedAt: Date.now() }
          : th,
      ),
    );
  }, []);
  const removeApproval = useCallback((key: string) => {
    setApprovalQueue((previous) => previous.filter((item) => item.key !== key));
    setActiveApprovalKey((previous) => previous === key ? null : previous);
  }, []);
  const activeFollowUpMode = resolveBusyFollowUpMode({ busy: Boolean(active?.busy) });

  /** Per-thread run phase + step from live busy/error/approvals/tools only. */
  const threadRunInfo = useCallback(
    (th: Thread, now = stallClock) => {
      const pending = approvalQueue.filter((a) => a.threadId === th.id);
      const phase = deriveTaskRunPhase({
        busy: th.busy,
        error: th.error,
        pendingDecisionCount: pending.length,
        lastEventAt: th.lastEventAt,
        now,
      });
      const tools = th.lines
        .filter((l) => l.role === 'tool')
        .map((l) => ({ label: l.text, toolStatus: l.toolStatus }));
      const planLines = th.lines.filter((l) => l.role === 'plan' && l.planEntries?.length);
      const planEntries = planLines[planLines.length - 1]?.planEntries ?? [];
      const decisionLabel =
        pending.length > 0
          ? pending[0].kind === 'permission'
            ? t('approvalInboxPermissionTitle')
            : pending[0].kind === 'plan'
              ? t('approvalInboxPlanTitle')
              : pending[0].kind === 'trust'
                ? t('approvalInboxTrustTitle')
                : t('approvalInboxQuestionTitle')
          : null;
      const step = deriveCurrentStep({
        tools,
        planEntries,
        pendingDecisionLabel: decisionLabel,
      });
      const stalled = isTaskStalled({
        busy: th.busy,
        lastEventAt: th.lastEventAt,
        now,
        pendingDecisionCount: pending.length,
        stallMs: DEFAULT_STALL_MS,
      });
      return { phase, step, stalled, pendingCount: pending.length };
    },
    [approvalQueue, stallClock],
  );

  const runCenterRows = useMemo<RunCenterRow[]>(() => {
    const rows: RunCenterRow[] = [];
    for (const th of threads) {
      if (th.archived) continue;
      const info = threadRunInfo(th);
      if (!shouldShowInRunCenter(info.phase)) continue;
      rows.push({
        threadId: th.id,
        title: th.title || t('newThread'),
        projectLabel:
          th.projectKey && th.projectKey !== NO_PROJECT_KEY
            ? projectDisplayName(th.cwd || th.projectKey, projectAliases)
            : t('tasksSection'),
        phase: info.phase,
        stepLabel: info.step,
        stalled: info.stalled,
      });
    }
    // Awaiting decisions first, then running, then failed
    const rank: Record<TaskRunPhase, number> = {
      awaiting_decision: 0,
      running: 1,
      failed: 2,
      idle: 3,
    };
    rows.sort((a, b) => rank[a.phase] - rank[b.phase]);
    return rows;
  }, [threads, threadRunInfo, projectAliases]);

  const focusThreadFromRunCenter = useCallback(
    (threadId: string) => {
      const th = threadsRef.current.find((item) => item.id === threadId);
      if (!th) return;
      if (th.projectKey === NO_PROJECT_KEY) {
        setProject('');
      } else if (th.cwd || th.projectKey) {
        setProject(th.cwd || th.projectKey);
      }
      selectThread(threadId);
    },
    [selectThread],
  );

  // Tick stall clock while any task is busy (real heartbeat comparison only).
  useEffect(() => {
    const anyBusy = threads.some((th) => th.busy && !th.archived);
    if (!anyBusy) return;
    const id = window.setInterval(() => setStallClock(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, [threads]);

  const sendRef = useRef<(text?: string) => Promise<void>>(async () => {});
  const toggleNativeVoiceRef = useRef<() => void>(() => {});

  // Flush queued next-turn text when a task leaves busy.
  useEffect(() => {
    for (const th of threads) {
      if (th.busy || th.archived) continue;
      const queued = queuedFollowUps[th.id];
      if (!queued?.trim()) continue;
      if (activeIdRef.current !== th.id) continue;
      if (!th.client || !th.sessionId) continue;
      setQueuedFollowUps((prev) => {
        if (!(th.id in prev)) return prev;
        const { [th.id]: _drop, ...rest } = prev;
        return rest;
      });
      window.setTimeout(() => {
        void sendRef.current(queued);
      }, 0);
    }
  }, [threads, queuedFollowUps]);
  const workflowManagementAvailable = Boolean(
    active?.commands?.some((command) => command.name.replace(/^\//, '').toLowerCase() === 'workflow'),
  );
  const activeSavedWorkflows = useMemo(
    () => (active?.commands ?? []).flatMap((command) => {
      const name = command.name.replace(/^\//, '');
      // Grok Build marks saved workflows in the ACP command catalogue.  Do
      // not infer a workflow from a command name or description alone.
      if (!command.workflowSource || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)) return [];
      return [{ name, description: command.description, source: command.workflowSource }];
    }),
    [active?.commands],
  );
  threadsRef.current = threads;
  activeIdRef.current = activeId;

  const requireLiveHooksTask = useCallback(() => {
    const live = threadsRef.current.find((thread) => thread.id === activeIdRef.current);
    if (!live?.client || !live.sessionId) throw new Error(t('settingsHooksNeedTask'));
    return live;
  }, []);

  const refreshLiveHooks = useCallback(async (): Promise<HooksSnapshot> => {
    const live = requireLiveHooksTask();
    return live.client!.listHooks(live.sessionId!);
  }, [requireLiveHooksTask]);

  const manageLiveHooks = useCallback(async (action: HookManagementAction): Promise<HooksSnapshot> => {
    const live = requireLiveHooksTask();
    return live.client!.manageHooks(live.sessionId!, action);
  }, [requireLiveHooksTask]);

  const manageWorkflow = useCallback(async (workflow: WorkflowRunUpdate, action: 'pause' | 'resume') => {
    const live = threadsRef.current.find((thread) => thread.id === activeIdRef.current);
    const available = live?.commands?.some((command) => command.name.replace(/^\//, '').toLowerCase() === 'workflow');
    if (!live?.client || !live.sessionId || !available) throw new Error(t('workflowManagementUnavailable'));
    // The name comes from the bounded ACP workflow event; reject anything that
    // cannot be represented as the documented workflow handle argument.
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(workflow.name)) {
      throw new Error(t('workflowManagementUnavailable'));
    }
    const result = await live.client.manageWorkflow(live.sessionId, workflow.runId, action);
    appendLine(live.id, { id: nid(), role: 'system', text: result.message });
  }, [t]);

  const deleteKernelScheduledTask = useCallback(async (task: KernelScheduledTaskUpdate) => {
    const live = threadsRef.current.find((thread) => thread.id === activeIdRef.current);
    if (!live?.client || !live.sessionId) return;
    const deleted = await live.client.deleteScheduledTask(live.sessionId, task.taskId);
    if (deleted) {
      setThreads((previous) => previous.map((thread) => thread.id === live.id
        ? { ...thread, lines: thread.lines.filter((line) => line.toolKey !== `scheduled:${task.taskId}`) }
        : thread));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('gorkx.project', project);
    if (project) setRecentProjects(pushRecentProject(project));
  }, [project]);
  useEffect(() => {
    localStorage.setItem('gorkx.perm', perm);
  }, [perm]);
  useEffect(() => {
    localStorage.setItem('gorkx.chatMode', chatMode);
  }, [chatMode]);
  useEffect(() => {
    localStorage.setItem('gorkx.newTaskProfile', newTaskProfile);
  }, [newTaskProfile]);
  useEffect(() => {
    if (newTaskProfile.startsWith('project:') && !projectRoleNameForCwd(newTaskProfile, project)) {
      setNewTaskProfile('default');
    }
  }, [project, newTaskProfile]);
  useEffect(() => {
    localStorage.setItem('gorkx.effort', effort);
  }, [effort]);
  useEffect(() => {
    if (modelId) localStorage.setItem('gorkx.modelId', modelId);
  }, [modelId]);
  useEffect(() => {
    localStorage.setItem('gorkx.grokCmd', grokCmd);
  }, [grokCmd]);
  useEffect(() => {
    localStorage.setItem(OPT_IN_PANEL_KEYS.review, reviewOpen ? '1' : '0');
  }, [reviewOpen]);
  useEffect(() => {
    localStorage.setItem(OPT_IN_PANEL_KEYS.terminal, terminalOpen ? '1' : '0');
  }, [terminalOpen]);

  const scopeKey = projectScopeKey(project);

  /**
   * Load thread metas for: 任务 (NO_PROJECT) + all recent projects + current project.
   * Never drop other scopes when switching project — that made 「任务」 vanish.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const scopes = Array.from(
        new Set(
          [NO_PROJECT_KEY, projectScopeKey(project), ...recentProjects.map((p) => projectScopeKey(p))]
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      );
      const loaded: Thread[] = [];
      for (const scope of scopes) {
        const metas = await loadThreadMetas(scope);
        if (cancelled) return;
        for (const m of metas) {
          if (m.archived) continue;
          const snaps = await loadChatSnapshot(scope, m.id);
          if (cancelled) return;
          loaded.push(metaToStub({ ...m, project: scope }, snapToLines(snaps)));
        }
      }
      if (cancelled) return;
      setThreads((prev) => {
        const byId = new Map<string, Thread>();
        // Prefer live agents already running
        for (const th of prev) {
          if (th.client && !th.archived) byId.set(th.id, th);
        }
        // Merge loaded stubs without overwriting live clients
        for (const s of loaded) {
          const cur = byId.get(s.id);
          if (cur?.client) {
            // Keep live agent; refresh meta timestamps/title if better
            byId.set(cur.id, {
              ...cur,
              updatedAt: Math.max(cur.updatedAt || 0, s.updatedAt || 0) || cur.updatedAt,
              title:
                !isPlaceholderTitle(cur.title) || isPlaceholderTitle(s.title)
                  ? cur.title
                  : s.title,
            });
            continue;
          }
          // Keep live title if stub would re-pollute
          if (cur && !isPlaceholderTitle(cur.title) && isPlaceholderTitle(s.title)) {
            byId.set(s.id, {
              ...s,
              title: cur.title,
              lines: cur.lines.length ? cur.lines : s.lines,
              updatedAt: Math.max(cur.updatedAt || 0, s.updatedAt || 0) || s.updatedAt,
            });
            continue;
          }
          byId.set(s.id, {
            ...s,
            updatedAt: s.updatedAt || cur?.updatedAt || Date.now(),
            lines: cur?.lines?.length && cur.lines.length > (s.lines?.length || 0) ? cur.lines : s.lines,
          });
        }
        // Keep any other live/prev threads not in loaded (e.g. brand-new not yet flushed)
        for (const th of prev) {
          if (!byId.has(th.id) && !th.archived) byId.set(th.id, th);
        }
        // Dedupe only true kernel-session duplicates (same sessionId).
        // NEVER collapse distinct threads that merely share a title.
        const bySession = new Map<string, Thread>();
        const noSession: Thread[] = [];
        for (const th of byId.values()) {
          if (!th.sessionId) {
            noSession.push(th);
            continue;
          }
          const cur = bySession.get(th.sessionId);
          if (!cur) {
            bySession.set(th.sessionId, th);
            continue;
          }
          // Same kernel session opened twice → keep one row, merge best fields
          const preferTh =
            (th.client && !cur.client) ||
            (Boolean(th.client) === Boolean(cur.client) && th.lines.length > cur.lines.length) ||
            (Boolean(th.client) === Boolean(cur.client) &&
              th.lines.length === cur.lines.length &&
              (th.updatedAt || 0) > (cur.updatedAt || 0));
          const winner = preferTh ? th : cur;
          const loser = preferTh ? cur : th;
          bySession.set(th.sessionId, {
            ...winner,
            title:
              !isPlaceholderTitle(winner.title)
                ? winner.title
                : !isPlaceholderTitle(loser.title)
                  ? loser.title
                  : winner.title,
            lines: winner.lines.length >= loser.lines.length ? winner.lines : loser.lines,
            client: winner.client || loser.client,
            updatedAt: Math.max(winner.updatedAt || 0, loser.updatedAt || 0) || undefined,
          });
        }
        const merged = [...bySession.values(), ...noSession];
        return merged.sort((a, b) => {
          if (a.client && !b.client) return -1;
          if (!a.client && b.client) return 1;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [project, recentProjects]);

  // Debounced chat snapshot for active thread
  useEffect(() => {
    if (!active?.sessionId || active.lines.length === 0) return;
    const handle = window.setTimeout(() => {
      void saveChatSnapshot(
        active.projectKey || scopeKey,
        active.id,
        active.lines.map((l) => ({
          id: l.id,
          role: l.role,
          text: l.text,
          toolKey: l.toolKey,
          parentSubagentId: l.parentSubagentId,
          toolStatus: l.toolStatus,
          toolKind: l.toolKind,
          at: l.at ?? null,
          attachmentsJson: l.attachments?.length
            ? JSON.stringify(l.attachments.map(({ id, path, name, kind, size }) => ({ id, path, name, kind, size })))
            : null,
        })),
      );
    }, 900);
    return () => window.clearTimeout(handle);
  }, [scopeKey, active?.id, active?.sessionId, active?.lines, active?.projectKey]);

  const focusComposer = useCallback(() => {
    window.setTimeout(() => {
      const el = document.querySelector(
        '.composer textarea',
      ) as HTMLTextAreaElement | null;
      el?.focus();
    }, 0);
  }, []);

  /** Cycle tasks in the current project scope (sidebar order: newest first). */
  const cycleThread = useCallback(
    (dir: 1 | -1) => {
      const scope = project ? projectScopeKey(project) : NO_PROJECT_KEY;
      const list = threadsForScope(threadsRef.current, scope);
      if (list.length === 0) return;
      const cur = activeId;
      let idx = list.findIndex((th) => th.id === cur);
      if (idx < 0) {
        // No active task → open first (newest) or last depending on direction
        idx = dir > 0 ? -1 : 0;
      }
      const next = list[(idx + dir + list.length) % list.length];
      if (next) selectThread(next.id);
    },
    [activeId, project, selectThread],
  );

  // Global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        void createThreadRef.current?.();
        return;
      }
      if (meta && (e.key === 'd' || e.key === 'D') && !e.shiftKey) {
        e.preventDefault();
        setReviewOpen((v) => !v);
        return;
      }
      if (meta && (e.key === 'j' || e.key === 'J') && e.shiftKey) {
        e.preventDefault();
        setTerminalOpen((v) => !v);
        return;
      }
      if (meta && (e.key === 'k' || e.key === 'K') && !e.shiftKey) {
        e.preventDefault();
        setKernelOpen(true);
        return;
      }
      if (meta && (e.key === 'f' || e.key === 'F') && e.shiftKey) {
        e.preventDefault();
        setTaskSearchOpen(true);
        return;
      }
      if (meta && (e.key === 'e' || e.key === 'E') && e.shiftKey) {
        e.preventDefault();
        setExtOpen(true);
        return;
      }
      if (meta && e.key === '/') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      // Mirrors the engine's native-voice shortcut while keeping it scoped to
      // this desktop window. The visible microphone button always remains.
      if (
        voiceShortcutEnabled
        && !e.altKey
        && !e.metaKey
        && (e.key === 'F8' || (e.ctrlKey && e.code === 'Space'))
      ) {
        e.preventDefault();
        toggleNativeVoiceRef.current();
        return;
      }
      // Focus composer (⌘L) — works from anywhere
      if (meta && (e.key === 'l' || e.key === 'L') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        focusComposer();
        return;
      }
      // Previous / next task in current project (⌥⌘↑ / ⌥⌘↓)
      if (meta && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        cycleThread(e.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      // Also: ⌥⌘[ / ⌥⌘]
      if (meta && e.altKey && (e.key === '[' || e.key === ']')) {
        e.preventDefault();
        cycleThread(e.key === '[' ? -1 : 1);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project, cycleThread, focusComposer, voiceShortcutEnabled]);

  const activeTools: ToolEvent[] = useMemo(() => {
    if (!active) return [];
    const map = new Map<string, ToolEvent>();
    for (const line of active.lines) {
      if (line.role !== 'tool') continue;
      const id = line.toolKey || line.id;
      // Prefer stored human text; strip trailing " · completed" protocol tails if any
      let label = line.text || '';
      label = label.replace(/\s*·\s*(completed|failed|pending|in_progress|running)\s*$/i, '').trim();
      if (isToolCallIdLike(label)) label = '';
      map.set(id, {
        id,
        label: label || line.toolKind || '工具调用',
        status: line.toolStatus,
        kind: line.toolKind,
      });
    }
    return [...map.values()].slice(-24);
  }, [active]);

  // Auto-open Review when agent starts producing tools/plans (first signal only)
  const reviewAutoKey = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const hasWork =
      active.lines.some((l) => l.role === 'tool' || l.role === 'plan') ||
      active.chatMode === 'plan';
    if (!hasWork) return;
    const key = active.id;
    if (reviewAutoKey.current === key) return;
    reviewAutoKey.current = key;
    setReviewOpen(true);
  }, [active?.id, active?.lines.length, active?.chatMode]);

  const refreshStatus = useCallback(() => {
    void fetchGrokStatus(grokCmd || undefined)
      .then(setStatus)
      .catch((e) =>
        setStatus({
          installed: false,
          version: '',
          authenticated: false,
          authPath: '',
          grokPath: grokCmd,
          detail: String(e),
          channel: 'missing',
          sourceRepoHint: '',
          upgradeOfficial: 'grok update',
          upgradeSource: 'git pull && cargo build -p xai-grok-pager-bin --release',
          docsUrl: 'https://docs.x.ai/build/overview',
          sourceUrl: 'https://github.com/xai-org/grok-build',
        }),
      );
  }, [grokCmd]);

  const refreshAccount = useCallback(async () => {
    try {
      const a = await fetchAccountSummary();
      setAccount(a);
      if (!a) {
        setAccountError(t('quotaLoadFailed'));
      } else if (a.creditUsagePercent == null && a.quotaNote) {
        setAccountError(a.quotaNote);
      } else {
        setAccountError(null);
      }
    } catch (e) {
      setAccount(null);
      setAccountError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    void refreshAccount();
    const iv = window.setInterval(() => {
      void refreshAccount();
    }, 90_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshAccount();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refreshStatus, refreshAccount]);

  // First-run onboarding when engine/login/project incomplete
  useEffect(() => {
    if (isOnboardingDismissed()) return;
    // `status.authenticated` only means Grok credential material was found on
    // disk. The account summary verifies that a usable bearer token exists, so
    // only it may unlock the signed-in product UI.
    if (!status || !account) return;
    const kernelOk = Boolean(status.installed);
    const authOk = account.authenticated === true;
    const projectOk = Boolean(project && project.trim());
    if (!kernelOk || !authOk || !projectOk) {
      setOnboardOpen(true);
    } else {
      dismissOnboarding();
      setOnboardOpen(false);
    }
  }, [status, account, project]);

  // Quiet app-update check on launch (installed users)
  useEffect(() => {
    let cancelled = false;
    void checkAppUpdate().then((info) => {
      if (cancelled || info.error) return;
      if (info.updateAvailable) setAppUpdateBanner(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Native prompt is unreliable in Tauri — always use in-app modal. */
  const askText = useCallback((req: TextPromptRequest): Promise<string | null> => {
    return new Promise((resolve) => {
      setTextPrompt({ ...req, resolve });
    });
  }, []);

  /** Multiline, button-launched desktop form. Never exposes slash syntax. */
  const askAction = useCallback((req: ActionPromptRequest): Promise<string | null> => {
    return new Promise((resolve) => {
      setActionPrompt({ ...req, resolve });
    });
  }, []);

  /** Merge custom [model.*] rows into the composer picker. */
  const loadCustomModels = useCallback(async () => {
    const snap = await listCustomModels();
    if (!snap?.customModels?.length && !snap?.defaultModel) return;
    setCustomModelRows(
      (snap.customModels ?? []).map((m) => ({
        model: m.model || m.id,
        id: m.id,
        providerLabel: m.providerLabel,
        baseUrl: m.baseUrl,
      })),
    );
    const custom: ModelInfo[] = (snap.customModels ?? []).map((m) => ({
      modelId: m.model || m.id,
      name: m.providerLabel
        ? `${m.name || m.model || m.id} · ${m.providerLabel}`
        : m.name
          ? `${m.name} · custom`
          : `${m.model || m.id} · custom`,
      _meta: m.contextWindow ? { totalContextTokens: m.contextWindow } : undefined,
    }));
    if (custom.length) {
      setAvailableModels((prev) => {
        const byId = new Map(prev.map((m) => [m.modelId, m]));
        for (const c of custom) {
          const existing = byId.get(c.modelId);
          byId.set(c.modelId, existing ? { ...existing, name: c.name, _meta: c._meta ?? existing._meta } : c);
        }
        return Array.from(byId.values());
      });
    }
    // Seed default only when user has never chosen a model
    try {
      if (snap.defaultModel && !localStorage.getItem('gorkx.modelId')) {
        setModelId(snap.defaultModel);
        localStorage.setItem('gorkx.modelId', snap.defaultModel);
      }
    } catch {
      /* */
    }
  }, []);

  /** Models from Grok subscription cache / cli-chat-proxy (not hardcoded). */
  const loadSubscriptionModels = useCallback(async (refresh = false) => {
    const rows = await fetchSubscriptionModels(refresh);
    if (!rows.length) {
      void loadCustomModels();
      return;
    }
    const mapped: ModelInfo[] = rows.map((r) => ({
      modelId: r.modelId,
      name: r.name || r.modelId,
      _meta: r.contextWindow
        ? { totalContextTokens: r.contextWindow }
        : undefined,
    }));
    setAvailableModels((prev) => {
      const ids = new Set(mapped.map((m) => m.modelId));
      const extra = prev.filter((m) => !ids.has(m.modelId));
      return [...mapped, ...extra];
    });
    setModelId((cur) => {
      if (cur && mapped.some((m) => m.modelId === cur)) return cur;
      if (cur) return cur; // keep custom default even if not in subscription list
      return mapped[0]?.modelId || cur;
    });
    void loadCustomModels();
  }, [loadCustomModels]);

  /** Keep every already-running kernel in sync after Settings writes `[model.*]`. */
  const reloadLiveModelCatalogs = useCallback(async () => {
    const clients = Array.from(
      new Set(threadsRef.current.map((thread) => thread.client).filter((client): client is AcpClient => Boolean(client))),
    );
    await Promise.allSettled(clients.map((client) => client.reloadModels()));
    await loadCustomModels();
  }, [loadCustomModels]);

  useEffect(() => {
    void loadCustomModels();
  }, [loadCustomModels]);

  useEffect(() => {
    if (account?.authenticated !== true) return;
    void loadSubscriptionModels(false);
    void loadSubscriptionModels(true);
  }, [account?.authenticated, loadSubscriptionModels]);

  useEffect(() => {
    const mid = active?.modelId || modelId || undefined;
    void fetchModelContext(mid).then(setModelCtx);
  }, [active?.modelId, modelId]);

  const refreshExtensions = useCallback(() => {
    void fetchExtensionsSnapshot(project || undefined, grokCmd || undefined)
      .then(setExtSnap)
      .catch(() => setExtSnap(null));
  }, [project, grokCmd]);

  useEffect(() => {
    refreshExtensions();
  }, [refreshExtensions]);

  /** Desktop launcher; the slash form remains only a keyboard compatibility path. */
  const runSkill = (skill: SkillInfo) => {
    void openSkillAction(skill);
  };

  const diskSkillCommands = useMemo(() => {
    return (extSnap?.skills ?? [])
      .filter((s) => s.userInvocable)
      .map((s) => ({
        name: s.name,
        description: s.description || s.whenToUse || s.scope,
        source: 'skill' as const,
      }));
  }, [extSnap]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.lines, active?.busy]);

  // Opening any task with a saved sessionId auto-connects (no reconnect button).
  useEffect(() => {
    if (!activeId) return;
    const th = threadsRef.current.find((x) => x.id === activeId);
    if (th?.sessionId && !th.client && !th.busy) {
      void reconnectRef.current?.(activeId)?.catch(() => {});
    }
  }, [activeId]);

  /** Fire due scheduled jobs while the app is open (Codex「已安排」). */
  useEffect(() => {
    let ticking = false;
    const tick = () => {
      if (ticking) return;
      ticking = true;
      void (async () => {
        try {
          const jobs = await loadPersistentJobs();
          const now = Date.now();
          let changed = false;
          const due: ScheduledJob[] = [];
          const nextJobs = jobs.map((j) => {
            if (!j.enabled || j.nextRunAt > now) return j;
            // Persist the next slot before starting an agent so an App reload
            // cannot duplicate the same scheduled prompt.
            changed = true;
            due.push(j);
            return {
              ...j,
              lastRunAt: now,
              // Do not clear failures until a successful dispatch finishes.
              nextRunAt: computeNextRun(j, now),
            };
          });
          if (changed) await savePersistentJobs(nextJobs);
          for (const job of due) {
            try {
              if (job.projectPath) {
                setProject(job.projectPath);
                setRecentProjects(pushRecentProject(job.projectPath));
                localStorage.setItem('gorkx.project', job.projectPath);
              } else {
                setProject('');
                localStorage.removeItem('gorkx.project');
              }
              await new Promise((r) => setTimeout(r, 200));
              // Foreground scheduler: attended ACP session — external writes
              // still pause in Decisions; never full auto without user policy.
              const result = await createThreadRef.current?.({ initialPrompt: job.prompt });
              if (result?.ok) {
                const current = await loadPersistentJobs();
                await savePersistentJobs(
                  current.map((item) =>
                    item.id === job.id
                      ? { ...item, failureCount: 0, lastError: null }
                      : item,
                  ),
                );
                continue;
              }
              // Re-read so a user edit or a different due job cannot be
              // overwritten by this failure record.
              const current = await loadPersistentJobs();
              const failureCount = (current.find((item) => item.id === job.id)?.failureCount ?? 0) + 1;
              const error = (result?.error || '调度执行器未就绪').slice(0, 500);
              const outcome = nextRunAfterOutcome(job, false, failureCount, Date.now());
              await savePersistentJobs(
                current.map((item) =>
                  item.id === job.id
                    ? {
                        ...item,
                        failureCount,
                        lastError: outcome.pauseAuto
                          ? `${error} · auto-retry paused (manual re-run required)`
                          : error,
                        nextRunAt: outcome.nextRunAt,
                        enabled: outcome.pauseAuto ? false : item.enabled,
                      }
                    : item,
                ),
              );
            } catch {
              const current = await loadPersistentJobs();
              const failureCount = (current.find((item) => item.id === job.id)?.failureCount ?? 0) + 1;
              const outcome = nextRunAfterOutcome(job, false, failureCount, Date.now());
              await savePersistentJobs(
                current.map((item) =>
                  item.id === job.id
                    ? {
                        ...item,
                        failureCount,
                        lastError: outcome.pauseAuto
                          ? '调度过程发生未预期错误 · auto-retry paused'
                          : '调度过程发生未预期错误',
                        nextRunAt: outcome.nextRunAt,
                        enabled: outcome.pauseAuto ? false : item.enabled,
                      }
                    : item,
                ),
              );
            }
          }
        } finally {
          ticking = false;
        }
      })();
    };
    const id = window.setInterval(tick, 30_000);
    // also check once shortly after launch
    const once = window.setTimeout(tick, 3_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(once);
    };
  }, []);

  const runScheduledJob = async (job: ScheduledJob) => {
    if (job.projectPath) {
      setProject(job.projectPath);
      setRecentProjects(pushRecentProject(job.projectPath));
      localStorage.setItem('gorkx.project', job.projectPath);
    } else {
      setProject('');
      localStorage.removeItem('gorkx.project');
    }
    await new Promise((r) => setTimeout(r, 150));
    return (await createThreadRef.current?.({ initialPrompt: job.prompt })) ?? {
      ok: false,
      error: '调度执行器未就绪',
    };
  };

  /**
   * Background jobs deliberately do not retain an interactive ACP session.
   * A user may explicitly move their local result into a fresh normal task,
   * where all usual permissions and approval cards apply again.
   */
  const continueBackgroundScheduledRun = (job: ScheduledJob, output: string) => {
    if (job.projectPath) {
      setProject(job.projectPath);
      setRecentProjects(pushRecentProject(job.projectPath));
      localStorage.setItem('gorkx.project', job.projectPath);
    } else {
      setProject('');
      localStorage.removeItem('gorkx.project');
    }
    const boundedOutput = output.slice(0, 8_000);
    const initialPrompt = `${job.prompt}\n\n[Background plan result — review it, then continue only with actions that need your confirmation]\n${boundedOutput}`;
    window.setTimeout(() => {
      void createThreadRef.current?.({ initialPrompt });
    }, 150);
  };

  useEffect(() => {
    const shutdown = () => {
      void stopAllAgents();
    };
    window.addEventListener('beforeunload', shutdown);
    return () => {
      window.removeEventListener('beforeunload', shutdown);
      void stopAllAgents();
      for (const th of threads) {
        void th.client?.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistThread = useCallback((th: Thread) => {
    if (!th.sessionId) return;
    const g = goalToMetaFields(th.sessionGoal);
    const meta: ThreadMeta = {
      id: th.id,
      title: th.title,
      sessionId: th.sessionId,
      modelId: th.modelId,
      cwd: th.cwd,
      worktreePath: th.worktreePath,
      effort: th.effort,
      chatMode: th.chatMode,
      memoryEnabled: th.memoryEnabled !== false,
      subagentsEnabled: th.subagentsEnabled !== false,
      planningEnabled: th.planningEnabled !== false,
      disallowedTools: sanitizeTaskToolLimits(th.disallowedTools),
      permissionRules: sanitizePermissionRules(th.permissionRules),
      updatedAt: Date.now(),
      archived: Boolean(th.archived),
      project: th.projectKey,
      sessionGoalText: g.sessionGoalText,
      sessionGoalStatus: g.sessionGoalStatus,
      sessionGoalMessage: g.sessionGoalMessage,
    };
    void upsertThreadMeta(th.projectKey || NO_PROJECT_KEY, meta);
  }, []);

  const patchThread = useCallback(
    (id: string, patch: Partial<Thread>) => {
      setThreads((prev) => {
        const next = prev.map((th) =>
          th.id === id
            ? {
                ...th,
                ...patch,
                // Bump activity time unless caller set updatedAt explicitly
                updatedAt:
                  patch.updatedAt !== undefined ? patch.updatedAt : Date.now(),
              }
            : th,
        );
        const updated = next.find((t) => t.id === id);
        if (updated) persistThread(updated);
        return next;
      });
    },
    [persistThread],
  );

  const appendLine = useCallback((threadId: string, line: ChatLine) => {
    const at = Date.now();
    setThreads((prev) =>
      prev.map((th) =>
        th.id === threadId ? { ...th, lines: [...th.lines, { ...line, at: line.at ?? at }], lastEventAt: at, updatedAt: at } : th,
      ),
    );
  }, []);

  const activePromptHistory = useMemo(() => {
    const seen = new Set<string>();
    return (active?.lines ?? [])
      .filter((line) => line.role === 'user' && line.text.trim())
      .map((line) => line.text.trim())
      .reverse()
      .filter((text) => {
        if (seen.has(text)) return false;
        seen.add(text);
        return true;
      })
      .slice(0, 30);
  }, [active?.lines]);

  /**
   * Keep the technical error available on demand, while always leaving a
   * human-readable trace in the task. This avoids an empty conversation when
   * session startup or the first prompt fails before any assistant content.
   */
  const markTaskFailed = useCallback((threadId: string, error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    patchThread(threadId, { busy: false, error: detail });
    appendLine(threadId, { id: nid(), role: 'system', text: t('taskFailedVisible') });
    // Account information can otherwise remain a stale cached success while
    // the engine has just proved that its OAuth session cannot be refreshed.
    // Refresh through the same authenticated account path so the sidebar tells
    // the truth (and never fabricate quota or a logged-in state).
    if (requiresAccountReauthentication(detail)) {
      void refreshAccount();
    }
  }, [appendLine, patchThread, refreshAccount]);

  const appendOrMerge = useCallback(
    (
      threadId: string,
      role: ChatLine['role'],
      chunk: string,
      toolKey?: string,
      meta?: { toolStatus?: string; toolKind?: string; parentSubagentId?: string },
    ) => {
      if (!chunk && !toolKey) return;
      const at = Date.now();
      setThreads((prev) =>
        prev.map((th) => {
          if (th.id !== threadId) return th;
          const lines = [...th.lines];
          if (toolKey) {
            const idx = lines.findIndex((l) => l.toolKey === toolKey);
            if (idx >= 0) {
              const prev = lines[idx];
              // Never let a call-id status tick wipe a human label
              let nextText = chunk || prev.text;
              if (isToolCallIdLike(chunk) && !isToolCallIdLike(prev.text)) {
                nextText = prev.text;
              } else if (!chunk.trim() && prev.text) {
                nextText = prev.text;
              } else if (
                chunk &&
                !isToolCallIdLike(chunk) &&
                isToolCallIdLike(prev.text)
              ) {
                nextText = chunk;
              } else if (
                chunk &&
                !isToolCallIdLike(chunk) &&
                prev.text &&
                chunk.length >= prev.text.length
              ) {
                nextText = chunk;
              }
              lines[idx] = {
                ...prev,
                text: nextText,
                toolStatus: meta?.toolStatus ?? prev.toolStatus,
                toolKind: meta?.toolKind ?? prev.toolKind,
                parentSubagentId: meta?.parentSubagentId ?? prev.parentSubagentId,
              };
              return { ...th, lines, lastEventAt: at, updatedAt: at };
            }
            lines.push({
              id: nid(),
              role,
              text: chunk || meta?.toolKind || '工具调用',
              toolKey,
              parentSubagentId: meta?.parentSubagentId,
              toolStatus: meta?.toolStatus,
              toolKind: meta?.toolKind,
              at,
            });
            return { ...th, lines, lastEventAt: at, updatedAt: at };
          }
          const last = lines[lines.length - 1];
          if (last && last.role === role && !last.toolKey) {
            lines[lines.length - 1] = { ...last, text: last.text + chunk };
          } else {
            lines.push({ id: nid(), role, text: chunk, at });
          }
          return { ...th, lines, lastEventAt: at, updatedAt: at };
        }),
      );
    },
    [],
  );

  const wireClient = useCallback(
    (threadId: string, client: AcpClient) => {
      client.onSessionUpdate = (update: SessionUpdate) => {
        const imageBlocks = extractUpdateImages(update);
        const resourceLinks = extractUpdateResourceLinks(update);
        const appendDeliveredAttachment = (attachment: ComposerAttachment) => {
          setThreads((previous) => previous.map((thread) => {
            if (thread.id !== threadId) return thread;
            if (thread.lines.some((line) => line.attachments?.some((item) => item.path === attachment.path))) return thread;
            return {
              ...thread,
              lines: [...thread.lines, { id: nid(), role: 'assistant', text: '', at: Date.now(), attachments: [attachment] }],
            };
          }));
        };
        const persistImages = () => {
          if (
            update.sessionUpdate !== 'agent_message_chunk' &&
            update.sessionUpdate !== 'tool_call' &&
            update.sessionUpdate !== 'tool_call_update'
          ) return;
          for (const image of imageBlocks) {
            void saveAgentImage(threadId, image.data, image.mimeType)
              .then(appendDeliveredAttachment)
              .catch(() => {
                // The media command deliberately rejects malformed, oversized,
                // or unsupported content without leaking bytes into the chat.
              });
          }
          const cwd = threadsRef.current.find((thread) => thread.id === threadId)?.cwd;
          for (const resource of resourceLinks) {
            const path = resourceLinkFilePath(resource.uri);
            if (path) {
              if (!cwd) continue;
              void buildWorkspaceResourceAttachment(cwd, path)
                .then(appendDeliveredAttachment)
                .catch(() => {
                  // Ignore untrusted, missing, remote, oversized or outside-workspace
                  // resource links. They are never made visible as local files.
                });
              continue;
            }
            // Non-file ACP links (http/https) are listed as link deliverables only.
            const uri = (resource.uri || '').trim();
            if (/^https?:\/\//i.test(uri) && uri.length <= 4_096) {
              appendDeliveredAttachment({
                id: newAttachId(),
                path: '',
                name: resource.name || uri,
                kind: 'file',
                href: uri,
              });
            }
          }
        };
        const subagent = parseSubagentUpdate(update);
        if (subagent) {
          appendOrMerge(threadId, 'tool', subagent.label, `subagent:${subagent.subagentId}`, {
            toolStatus: subagent.status,
            toolKind: subagent.kind,
            parentSubagentId: subagent.parentSubagentId,
          });
          persistImages();
          return;
        }

        const workflow = parseWorkflowUpdate(update);
        if (workflow) {
          setThreads((previous) => previous.map((thread) => {
            if (thread.id !== threadId) return thread;
            const key = `workflow:${workflow.runId}`;
            if (workflow.status === 'cleared') {
              return { ...thread, lines: thread.lines.filter((line) => line.toolKey !== key) };
            }
            const summary = `${workflow.name} · ${workflow.status}${workflow.currentPhase ? ` · ${workflow.currentPhase}` : ''}`;
            const existing = thread.lines.findIndex((line) => line.toolKey === key);
            const next: ChatLine = {
              id: existing >= 0 ? thread.lines[existing].id : nid(),
              role: 'workflow',
              text: summary,
              toolKey: key,
              toolStatus: workflow.status,
              workflow,
            };
            const lines = [...thread.lines];
            if (existing >= 0) lines[existing] = next;
            else lines.push(next);
            return { ...thread, lines };
          }));
          return;
        }

        const recap = parseSessionRecapUpdate(update);
        if (recap) {
          setThreads((previous) => previous.map((thread) => {
            if (thread.id !== threadId) return thread;
            const text = recap.summary ? `${t('recapLabel')}: ${recap.summary}` : t('recapUnavailable');
            return {
              ...thread,
              lines: [...thread.lines, { id: nid(), role: 'system', text, at: Date.now() }],
              lastEventAt: Date.now(),
              updatedAt: Date.now(),
            };
          }));
          return;
        }

        const plan = parsePlanUpdate(update);
        if (plan) {
          setThreads((prev) =>
            prev.map((th) => {
              if (th.id !== threadId) return th;
              const lines = [...th.lines];
              const last = lines[lines.length - 1];
              // Preserve user checkmarks when plan text updates if same ids
              let entries = plan.entries;
              if (last?.role === 'plan' && last.planEntries?.length) {
                const prevMap = new Map(last.planEntries.map((e) => [e.id, e.checked]));
                entries = plan.entries.map((e) =>
                  prevMap.has(e.id) ? { ...e, checked: prevMap.get(e.id)! } : e,
                );
              }
              const card: ChatLine = {
                id: last?.role === 'plan' ? last.id : nid(),
                role: 'plan',
                text: plan.text,
                planEntries: entries,
              };
              if (last?.role === 'plan') lines[lines.length - 1] = card;
              else lines.push(card);
              return { ...th, lines };
            }),
          );
          return;
        }

        const { kind, text } = extractUpdateText(update);
        // Some older kernels replay their internal first-turn envelope as an
        // assistant text update during session restore. It contains memory
        // and presentation guidance, not a model answer, so never add it to
        // the visible conversation.
        if (kind === 'text' && !isInjectedUserPromptEcho(text)) appendOrMerge(threadId, 'assistant', text);
        else if (kind === 'thought') appendOrMerge(threadId, 'thought', text);
        else if (kind === 'user' && text && !isInjectedUserPromptEcho(text)) {
          // session/load history or rare echoes — skip if same as last user line
          setThreads((prev) => {
            const th = prev.find((x) => x.id === threadId);
            if (!th) return prev;
            const lastUser = [...th.lines].reverse().find((l) => l.role === 'user');
            if (
              lastUser &&
              (lastUser.text === text ||
                text.startsWith(lastUser.text) ||
                lastUser.text.startsWith(text.slice(0, 48)))
            ) {
              return prev;
            }
            return prev.map((x) =>
              x.id === threadId
                ? { ...x, lines: [...x.lines, { id: nid(), role: 'user' as const, text }] }
                : x,
            );
          });
        } else {
          const tool = parseToolUpdate(update);
          if (tool) {
            const key = tool.toolCallId || tool.label || nid();
            // Pass human label (may be empty on status-only ticks — merge keeps prior)
            appendOrMerge(threadId, 'tool', tool.label, key, {
              toolStatus: tool.status,
              toolKind: tool.kind,
            });
            // Shell-side goal progress from update_goal tool (no ACP goal event)
            const anyU = update as Record<string, unknown>;
            const meta =
              anyU._meta && typeof anyU._meta === 'object'
                ? (anyU._meta as Record<string, unknown>)
                : {};
            const xai =
              meta['x.ai/tool'] && typeof meta['x.ai/tool'] === 'object'
                ? (meta['x.ai/tool'] as Record<string, unknown>)
                : {};
            const toolName = String(xai.name ?? anyU.toolName ?? tool.label ?? '');
            if (isGoalToolName(toolName) || isGoalToolName(tool.label)) {
              const patch =
                parseUpdateGoalPayload(anyU.rawInput) ||
                parseUpdateGoalPayload(xai.input) ||
                parseUpdateGoalPayload(anyU.content);
              if (patch) {
                setThreads((prev) =>
                  prev.map((th) => {
                    if (th.id !== threadId) return th;
                    const next = applyGoalPatch(th.sessionGoal, patch);
                    return next ? { ...th, sessionGoal: next } : th;
                  }),
                );
              }
            }
          }
        }
        persistImages();
      };

      client.onWorktreeStatus = (st) => {
        const msg = st.message || st.status || 'worktree';
        appendLine(threadId, {
          id: nid(),
          role: 'system',
          text: `worktree: ${msg}${st.worktreePath ? ` → ${st.worktreePath}` : ''}`,
        });
      };

      client.onPermissionRequest = (req) => {
        const mode = permModeRef.current;
        if (mode === 'auto' || mode === 'full') {
          const optionId = pickPermissionOption(req.options, 'allow');
          void client.respond(req.jsonrpcId, permissionResult(optionId));
          appendLine(threadId, {
            id: nid(),
            role: 'system',
            text: `auto-approved: ${optionId}`,
          });
          return;
        }
        enqueueApproval({
          key: `permission:${threadId}:${String(req.jsonrpcId)}`,
          kind: 'permission', threadId, createdAt: Date.now(), request: req,
        });
        void notifyPermission(
          'gorkX',
          'Permission required — open the app to approve or reject.',
        );
      };

      client.onUserQuestionRequest = (req) => {
        enqueueApproval({
          key: `question:${threadId}:${String(req.jsonrpcId)}`,
          kind: 'question', threadId, createdAt: Date.now(), request: req,
        });
        void notifyPermission(
          'gorkX',
          req.mode === 'plan' ? 'Plan needs your decisions — open gorkX to continue.' : 'Grok needs your decision — open gorkX to continue.',
        );
      };

      client.onPlanApprovalRequest = (req) => {
        enqueueApproval({
          key: `plan:${threadId}:${String(req.jsonrpcId)}`,
          kind: 'plan', threadId, createdAt: Date.now(), request: req,
        });
        void notifyPermission(
          'gorkX',
          'Plan is ready for your review — open gorkX to approve or request changes.',
        );
      };

      client.onFolderTrustRequest = (req) => {
        enqueueApproval({
          key: `trust:${threadId}:${String(req.jsonrpcId)}`,
          kind: 'trust', threadId, createdAt: Date.now(), request: req,
        });
        void notifyPermission('gorkX', 'Project configuration needs your trust decision — open gorkX to continue.');
      };

      client.onTerminalCreated = (terminalId) => {
        // Agent ACP terminals still run in backend; user shell is the embedded xterm dock.
        appendLine(threadId, {
          id: nid(),
          role: 'system',
          text: `agent terminal: ${terminalId}`,
        });
      };

      client.onAvailableCommands = (commands) => {
        patchThread(threadId, { commands });
      };

      client.onUsageMeta = (meta, source, eventKey) => {
        const u = usageFromUnknown(meta);
        if (u) {
          patchThread(threadId, { usage: u });
          // Only an accepted PromptResponse represents one completed turn.
          // Session snapshots can be cumulative/context occupancy, so using
          // them for daily accumulation would over- or under-count tokens.
          if (source !== 'prompt-result' || !eventKey) return;
          void recordDailyTokenUsage(eventKey, u).catch(() => {
            // A usage display must never interrupt an active agent task.
          });
        }
      };

      client.onNotification = (method, rawParams) => {
        if (method === 'x.ai/scheduled_task_created' || method === '_x.ai/scheduled_task_created' || method === 'x.ai/scheduled_task_fired' || method === '_x.ai/scheduled_task_fired') {
          const task = parseKernelScheduledTaskUpdate(rawParams);
          if (!task) return;
          setThreads((previous) => previous.map((thread) => {
            if (thread.id !== threadId) return thread;
            const key = `scheduled:${task.taskId}`;
            const summary = `${task.humanSchedule} · ${task.prompt}`;
            const existing = thread.lines.findIndex((line) => line.toolKey === key);
            const next: ChatLine = {
              id: existing >= 0 ? thread.lines[existing].id : nid(),
              role: 'scheduled',
              text: summary,
              toolKey: key,
              toolStatus: task.status,
              scheduledTask: task,
            };
            const lines = [...thread.lines];
            if (existing >= 0) lines[existing] = next;
            else lines.push(next);
            return { ...thread, lines };
          }));
          return;
        }
        if (method === 'x.ai/scheduled_task_deleted' || method === '_x.ai/scheduled_task_deleted') {
          const taskId = parseKernelScheduledTaskDeletion(rawParams);
          if (!taskId) return;
          setThreads((previous) => previous.map((thread) => thread.id === threadId
            ? { ...thread, lines: thread.lines.filter((line) => line.toolKey !== `scheduled:${taskId}`) }
            : thread));
          return;
        }
        if (method === 'x.ai/follow_ups' || method === '_x.ai/follow_ups') {
          const next = readFollowUps(rawParams);
          if (next) {
            setFollowUps((previous) => ({ ...previous, [threadId]: next }));
          }
          return;
        }
        if (method === 'x.ai/session/interjection' || method === '_x.ai/session/interjection') {
          const params = rawParams && typeof rawParams === 'object'
            ? rawParams as { sessionId?: unknown; text?: unknown }
            : null;
          const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : '';
          const text = typeof params?.text === 'string' ? params.text.trim() : '';
          const live = threadsRef.current.find((thread) => thread.id === threadId);
          if (!text || !sessionId || sessionId !== live?.sessionId) return;
          appendLine(threadId, { id: nid(), role: 'user', text, at: Date.now() });
          return;
        }
        if (method !== 'x.ai/voice/transcript' && method !== '_x.ai/voice/transcript') return;
        const params = rawParams && typeof rawParams === 'object'
          ? rawParams as { sessionId?: unknown; kind?: unknown; text?: unknown; message?: unknown; hint?: unknown }
          : null;
        const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : '';
        const live = threadsRef.current.find((thread) => thread.id === threadId);
        // The ACP channel is shared by one agent process. Never place a
        // transcript from a background task in the currently visible draft.
        if (!sessionId || sessionId !== live?.sessionId || activeIdRef.current !== threadId) return;
        const kind = typeof params?.kind === 'string' ? params.kind : '';
        if (kind === 'interim' && typeof params?.text === 'string') {
          setVoiceInterim(params.text);
          setVoiceError(null);
          return;
        }
        if (kind === 'final' && typeof params?.text === 'string') {
          const transcript = params.text.trim();
          if (transcript) {
            setDraft((previous) => previous.trim() ? `${previous.trim()} ${transcript}` : transcript);
          }
          setVoiceInterim('');
          setVoiceError(null);
          return;
        }
        if (kind === 'error') {
          const message = typeof params?.message === 'string' ? params.message : t('voiceErrorGeneric');
          const hint = typeof params?.hint === 'string' && params.hint.trim() ? ` ${params.hint.trim()}` : '';
          setVoiceError(`${message}${hint}`);
          setVoiceInterim('');
          setVoiceListeningSessionId(null);
        }
      };

      client.onStderr = (line) => {
        if (/error|Error|panic|failed/i.test(line)) {
          appendLine(threadId, { id: nid(), role: 'system', text: line });
        }
      };

      client.onExit = () => {
        const live = threadsRef.current.find((thread) => thread.id === threadId);
        // Native dictation belongs to this ACP process. Once it exits there
        // is no microphone stream to stop or transcript to receive, so never
        // leave the composer claiming it is still listening.
        setVoiceListeningSessionId((current) => current === live?.sessionId ? null : current);
        setVoiceInterim('');
        if (live?.sessionId && activeIdRef.current === threadId) {
          setVoiceError(t('voiceErrorSessionClosed'));
        }
        // The request cannot be answered once its ACP process is gone. Do not
        // leave a stale approval that looks actionable in another task.
        setApprovalQueue((previous) => previous.filter((item) => item.threadId !== threadId));
        setActiveApprovalKey(null);
        patchThread(threadId, {
          busy: false,
          client: null,
          // If the prompt/session request already gave us a useful reason,
          // do not replace it with the generic process-exit symptom.
          error: live?.error?.trim() || 'Agent process exited',
        });
        appendLine(threadId, {
          id: nid(),
          role: 'system',
          text: 'Agent process exited',
        });
        // One-shot auto reconnect per thread id
        if (!autoReconnectTried.current.has(threadId)) {
          autoReconnectTried.current.add(threadId);
          appendLine(threadId, {
            id: nid(),
            role: 'system',
            text: t('autoReconnect'),
          });
          window.setTimeout(() => {
            void reconnectRef.current?.(threadId)?.catch(() => {
              appendLine(threadId, {
                id: nid(),
                role: 'system',
                text: t('autoReconnectFail'),
              });
            });
          }, 600);
        }
      };
    },
    [appendLine, appendOrMerge, enqueueApproval, patchThread],
  );

  /**
   * Toggle the engine-owned macOS voice pipeline. A finalized transcript only
   * edits the draft: sending remains an explicit user action.
   */
  const toggleNativeVoice = useCallback(async () => {
    const current = threadsRef.current.find((thread) => thread.id === activeIdRef.current);
    if (!current?.client || !current.sessionId) return;
    const sessionId = current.sessionId;
    setVoiceError(null);
    try {
      if (voiceListeningSessionId === sessionId) {
        await current.client.stopVoice(sessionId);
        setVoiceListeningSessionId(null);
        setVoiceInterim('');
        return;
      }
      // A task switch must not leave a hidden microphone capture active.
      if (voiceListeningSessionId) {
        const previous = threadsRef.current.find((thread) => thread.sessionId === voiceListeningSessionId);
        if (previous?.client) {
          await previous.client.shutdownVoice(voiceListeningSessionId).catch(() => undefined);
        }
      }
      await current.client.startVoice(sessionId);
      setVoiceListeningSessionId(sessionId);
      setVoiceInterim('');
    } catch (error) {
      setVoiceListeningSessionId(null);
      setVoiceInterim('');
      setVoiceError(error instanceof Error ? error.message : t('voiceErrorGeneric'));
    }
  }, [voiceListeningSessionId]);

  useEffect(() => {
    toggleNativeVoiceRef.current = () => { void toggleNativeVoice(); };
  }, [toggleNativeVoice]);

  /**
   * Rehydrate only the engine's currently-running child tasks after a session
   * load. Finished tasks come from the persisted session replay; this query is
   * solely for work that survived while the desktop process was absent.
   */
  const reconcileRunningSubagents = useCallback(
    async (threadId: string, client: AcpClient, sessionId: string) => {
      const markPersistedRunningAsUnverified = () => {
        setThreads((prev) =>
          prev.map((thread) => {
            if (thread.id !== threadId) return thread;
            const lines = thread.lines.map((line) =>
              line.toolKind === 'subagent' && /^(running|initializing|cancelling)\b/i.test(line.toolStatus || '')
                ? { ...line, toolStatus: 'unverified after reconnect' }
                : line,
            );
            return { ...thread, lines };
          }),
        );
      };
      try {
        const snapshots = await client.listRunningSubagents(sessionId);
        const rows = snapshots.flatMap((snapshot) => {
          if (!snapshot || typeof snapshot !== 'object') return [];
          const raw = snapshot as Record<string, unknown>;
          const subagentId = String(raw.subagentId ?? raw.subagent_id ?? '');
          if (!subagentId) return [];
          const type = String(raw.subagentType ?? raw.subagent_type ?? 'general-purpose');
          const description = String(raw.description ?? '').trim();
          const turns = Number(raw.turnCount ?? raw.turn_count ?? 0);
          const tools = Number(raw.toolCallCount ?? raw.tool_call_count ?? 0);
          const usage = Number(raw.contextUsagePct ?? raw.context_usage_pct ?? 0);
          const detail = [
            turns > 0 ? `${turns} turns` : '',
            tools > 0 ? `${tools} tools` : '',
            usage > 0 ? `${usage}% context` : '',
          ].filter(Boolean);
          return [{
            key: `subagent:${subagentId}`,
            text: `子任务 · ${type}${description ? ` · ${description}` : ''}`,
            status: detail.length ? `running · ${detail.join(' · ')}` : 'running',
          }];
        });
        if (!rows.length) {
          // An authoritative empty response means none of the persisted rows
          // is still live. Do not leave yesterday's lifecycle event looking
          // like an active process.
          markPersistedRunningAsUnverified();
          return;
        }
        setThreads((prev) =>
          prev.map((thread) => {
            if (thread.id !== threadId) return thread;
            const liveKeys = new Set(rows.map((row) => row.key));
            const lines = thread.lines.map((line) =>
              line.toolKind === 'subagent' &&
              /^(running|initializing|cancelling)\b/i.test(line.toolStatus || '') &&
              !liveKeys.has(line.toolKey || '')
                ? { ...line, toolStatus: 'unverified after reconnect' }
                : line,
            );
            for (const row of rows) {
              const index = lines.findIndex((line) => line.toolKey === row.key);
              if (index >= 0) {
                lines[index] = { ...lines[index], toolStatus: row.status, toolKind: 'subagent' };
              } else {
                lines.push({
                  id: nid(),
                  role: 'tool',
                  text: row.text,
                  toolKey: row.key,
                  toolStatus: row.status,
                  toolKind: 'subagent',
                });
              }
            }
            return { ...thread, lines };
          }),
        );
      } catch {
        // This extension is absent from the current locked kernel. Session
        // replay stays readable, but its historical "running" status is not
        // evidence that a child survived the desktop restart.
        markPersistedRunningAsUnverified();
      }
    },
    [],
  );

  const bootstrapClient = useCallback(async (
    workingDirectory?: string,
    memoryEnabled = true,
    subagentsEnabled = true,
    planningEnabled = true,
    disallowedTools: string[] = [],
    permissionRules: PermissionRule[] = [],
  ) => {
    const { allow, deny } = splitPermissionRules(permissionRules);
    const client = await AcpClient.start(
      perm,
      grokCmd || undefined,
      effort,
      workingDirectory || project || undefined,
      webSearchEnabled,
      maxAgentTurns,
      memoryEnabled,
      subagentsEnabled,
      planningEnabled,
      disallowedTools,
      allow,
      deny,
    );
    await client.initialize();
    await client.authenticate('cached_token');
    return client;
  }, [perm, grokCmd, effort, project, webSearchEnabled, maxAgentTurns]);

  /**
   * Cloud environments are authenticated ACP resources, not a local config
   * file. Reuse the active agent when possible; otherwise create a short-lived
   * authenticated ACP control client so the Settings page also works before a
   * task has been opened. No session or model turn is created here.
   */
  const withCloudClient = useCallback(
    async function withClient<T>(action: (client: AcpClient) => Promise<T>): Promise<T> {
      if (active?.client) return action(active.client);
      const client = await bootstrapClient(undefined, false, false, false);
      try {
        return await action(client);
      } finally {
        await client.stop().catch(() => {});
      }
    },
    [active?.client, bootstrapClient],
  );

  const loadKernelPromptHistory = useCallback(async () => {
    const cwd = active?.cwd || project;
    if (!cwd) {
      setKernelPromptHistory([]);
      setKernelPromptHistoryError(null);
      return;
    }
    setKernelPromptHistoryLoading(true);
    setKernelPromptHistoryError(null);
    let client: AcpClient | null = active?.client ?? null;
    let owned = false;
    try {
      if (!client) {
        client = await bootstrapClient(cwd, false, false, false);
        owned = true;
      }
      setKernelPromptHistory(await client.promptHistory(cwd));
    } catch (error) {
      setKernelPromptHistory([]);
      setKernelPromptHistoryError(error instanceof Error ? error.message : String(error));
    } finally {
      if (owned && client) await client.stop().catch(() => {});
      setKernelPromptHistoryLoading(false);
    }
  }, [active?.client, active?.cwd, bootstrapClient, project]);

  useEffect(() => {
    if (!promptHistoryOpen) return;
    void loadKernelPromptHistory();
  }, [loadKernelPromptHistory, promptHistoryOpen]);

  const visiblePromptHistory = useMemo(() => {
    const seen = new Set<string>();
    return [...activePromptHistory, ...kernelPromptHistory].filter((text) => {
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    });
  }, [activePromptHistory, kernelPromptHistory]);

  useEffect(() => {
    setPromptSuggestion(null);
    setPromptSuggestionError(null);
  }, [activeId]);

  const requestPromptSuggestion = useCallback(async () => {
    const thread = active;
    if (!thread?.client || !thread.sessionId || thread.busy) return;
    setPromptSuggestionBusy(true);
    setPromptSuggestionError(null);
    setPromptSuggestion(null);
    try {
      const reply = await thread.client.suggestNextPrompt(thread.sessionId, Date.now());
      if (reply.suggestion) setPromptSuggestion({ threadId: thread.id, text: reply.suggestion });
    } catch (error) {
      setPromptSuggestionError(error instanceof Error ? error.message : String(error));
    } finally {
      setPromptSuggestionBusy(false);
    }
  }, [active]);

  const searchKernelSessions = useCallback(
    async (query: string): Promise<KernelSessionSearchHit[]> => {
      // Native history search is useful only when the App has an authenticated
      // Grok home; local gorkX SQLite search remains available offline.
      if (!status?.authenticated && !active?.client) return [];
      return withCloudClient((client) => client.searchSessions(query, project || undefined, 20));
    },
    [status?.authenticated, active?.client, withCloudClient, project],
  );

  const rememberModels = useCallback(
    (session: { models?: { currentModelId?: string; availableModels?: ModelInfo[] } }) => {
      const models = session.models?.availableModels ?? [];
      if (models.length) setAvailableModels(models);
      const cur = session.models?.currentModelId;
      if (cur) setModelId(cur);
    },
    [],
  );

  /** Hide from gorkX lists only (no Grok kernel delete). */
  const dismissSession = useCallback((sessionId: string) => {
    setDismissedSessions((prev) => {
      const next = [sessionId, ...prev.filter((x) => x !== sessionId)].slice(0, 200);
      try {
        localStorage.setItem('gorkx.dismissedSessions', JSON.stringify(next));
      } catch {
        /* */
      }
      return next;
    });
    setProjectSessions((m) => {
      const out: Record<string, RecentSession[]> = {};
      for (const [k, list] of Object.entries(m)) {
        out[k] = list.filter((s) => s.sessionId !== sessionId);
      }
      return out;
    });
  }, []);

  /**
   * Real delete: `_x.ai/session/delete` on Grok kernel session store,
   * plus remove gorkX local index / UI.
   */
  const hardDeleteGrokSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId) return;
      const target = threadsRef.current.find((thread) => thread.sessionId === sessionId);
      let client: AcpClient | null = null;
      try {
        client = await bootstrapClient(target?.cwd || project || undefined);
        await client.deleteSession(sessionId);
      } catch {
        // Never turn a failed kernel delete into a misleading local hide.
        // Archive is the explicit local-only alternative.
        alert(t('deleteThreadFailed'));
        return;
      } finally {
        await client?.stop();
      }
      dismissSession(sessionId);
      setThreads((p) => {
        const hit = p.find((t) => t.sessionId === sessionId);
        if (hit) void removeThreadMeta(hit.projectKey || scopeKey, hit.id);
        return p.filter((t) => t.sessionId !== sessionId);
      });
      if (threadsRef.current.find((t) => t.sessionId === sessionId)?.id === activeId) {
        selectThread(null);
      }
    },
    [bootstrapClient, dismissSession, scopeKey, activeId, selectThread],
  );

  /** Opt-in: load Grok kernel history for one project cwd (settings migration only; not sidebar primary). */
  const _loadSessionsForProject = useCallback(
    async (cwd: string) => {
      if (!cwd || !status?.installed) return;
      let client: AcpClient | null = null;
      try {
        client = await bootstrapClient(cwd);
        const list = await client.listSessions(cwd);
        const filtered = list
          .filter((s) => s.sessionId)
          .filter((s) => !s.cwd || s.cwd === cwd)
          .filter((s) => !dismissedSessions.includes(s.sessionId))
          .sort((a, b) => (b.lastChangeUnixMs ?? 0) - (a.lastChangeUnixMs ?? 0))
          .slice(0, 12);
        setProjectSessions((m) => ({ ...m, [cwd]: filtered }));
      } catch {
        /* keep previous */
      } finally {
        await client?.stop();
      }
    },
    [status?.installed, bootstrapClient, dismissedSessions],
  );
  void _loadSessionsForProject;

  useEffect(() => {
    setShowGrokHistory(false);
  }, [project]);

  const addAttachmentPaths = useCallback(async (paths: string[]) => {
    if (!paths.length) return;
    const built = await Promise.all(paths.map((p) => buildAttachment(p)));
    setComposerAtts((prev) => {
      const seen = new Set(prev.map((a) => a.path));
      const next = [...prev];
      for (const a of built) {
        if (seen.has(a.path)) {
          revokeAttachment(a);
          continue;
        }
        seen.add(a.path);
        next.push(a);
      }
      return next.slice(0, 24);
    });
  }, []);

  // Finder → app: Tauri native drag-drop (HTML5 File.path is often empty on macOS)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const win = getCurrentWebviewWindow();
        unlisten = await win.onDragDropEvent((event) => {
          if (cancelled) return;
          const payload = event.payload as {
            type: string;
            paths?: string[];
          };
          if (payload.type === 'over' || payload.type === 'enter') {
            setDragOver(true);
          } else if (payload.type === 'leave' || payload.type === 'cancel') {
            setDragOver(false);
          } else if (payload.type === 'drop') {
            setDragOver(false);
            const paths = payload.paths || [];
            if (paths.length) void addAttachmentPaths(paths);
          }
        });
      } catch {
        /* browser preview */
      }
    })();
    return () => {
      cancelled = true;
      try {
        unlisten?.();
      } catch {
        /* */
      }
    };
  }, [addAttachmentPaths]);


  const removeComposerAtt = (id: string) => {
    setComposerAtts((prev) => {
      const hit = prev.find((a) => a.id === id);
      if (hit) revokeAttachment(hit);
      return prev.filter((a) => a.id !== id);
    });
  };

  const attachFiles = async (opts?: { images?: boolean; folders?: boolean; all?: boolean }) => {
    let defaultPath: string | undefined;
    if (opts?.folders) {
      try {
        defaultPath = await projectsRoot();
      } catch {
        /* */
      }
    } else if (project) {
      defaultPath = project;
    }
    const selected = await open({
      multiple: true,
      directory: Boolean(opts?.folders),
      ...(defaultPath ? { defaultPath } : {}),
      filters: opts?.images
        ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'bmp'] }]
        : opts?.all
          ? undefined
          : undefined,
    });
    const paths = Array.isArray(selected)
      ? selected
      : typeof selected === 'string'
        ? [selected]
        : [];
    if (!paths.length) return;
    await addAttachmentPaths(paths);
    setPlusMenuOpen(false);
  };

  const createProjectByName = async () => {
    let rootHint = '~/.gorkx/projects';
    try {
      rootHint = await projectsRoot();
    } catch {
      /* */
    }
    setAddProjectMenuOpen(false);
    const name = await askText({
      title: t('createProjectTitle'),
      message: t('createProjectPrompt').replace('{root}', rootHint),
      placeholder: t('createProjectPlaceholder'),
      okLabel: t('confirm'),
    });
    if (name == null || !name.trim()) return;
    try {
      const path = await createNamedProject(name.trim());
      setProject(path);
      setRecentProjects(pushRecentProject(path));
      localStorage.setItem('gorkx.project', path);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const archiveProjectTasks = async (path: string) => {
    const key = projectScopeKey(path);
    const ids = threads.filter((th) => th.projectKey === key && !th.archived).map((th) => th.id);
    for (const id of ids) await archiveThread(id);
  };

  const insertSlash = (name: string) => {
    setDraft((d) => {
      const rest = d.replace(/^\/\S*$/, '').trimEnd();
      return rest ? `${rest} /${name} ` : `/${name} `;
    });
    setSlashOpen(false);
    setSlashIndex(0);
  };

  const applySlashPick = (name: string) => {
    if (name === 'plan') {
      void changeChatMode('plan');
      setDraft('');
      setSlashOpen(false);
      setSlashIndex(0);
      return;
    }
    if (name === 'fork') {
      void forkActiveSession();
      setDraft('');
      setSlashOpen(false);
      setSlashIndex(0);
      return;
    }
    if (name === 'rewind') {
      void openRewindDialog();
      setDraft('');
      setSlashOpen(false);
      setSlashIndex(0);
      return;
    }
    insertSlash(name);
  };

  /**
   * Plan mode is an ACP session state, not a composer command. New tasks inherit
   * the selected default and live tasks switch through `session/set_mode`.
   */
  const changeChatMode = async (next: ChatMode) => {
    if (next === 'plan' && active?.planningEnabled === false) {
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text: t('plusTaskPlanningLocked'),
      });
      return;
    }
    if (next === 'plan') {
      setNewTaskPlanningEnabled(true);
      try {
        localStorage.setItem('gorkx.newTaskPlanningEnabled', '1');
      } catch {
        /* local preference is optional */
      }
    }
    setChatMode(next);
    const modeId = next === 'plan' ? 'plan' : 'default';
    let setModeOk = false;
    let setModeErr: string | null = null;

    if (active?.client && active.sessionId) {
      try {
        await active.client.setMode(active.sessionId, modeId);
        setModeOk = true;
        patchThread(active.id, { chatMode: next });
      } catch (e) {
        // Try alternate ids some builds accept
        if (next === 'plan') {
          for (const alt of ['Plan', 'planning']) {
            try {
              await active.client.setMode(active.sessionId, alt);
              setModeOk = true;
              patchThread(active.id, { chatMode: next });
              break;
            } catch {
              /* try next */
            }
          }
        }
        if (!setModeOk) {
          setModeErr = e instanceof Error ? e.message : String(e);
        }
      }
    }

    if (next === 'plan') {
      if (active) {
        if (!setModeOk) {
          setChatMode(active.chatMode === 'plan' ? 'plan' : 'agent');
        }
        appendLine(active.id, {
          id: nid(),
          role: 'system',
          text: setModeOk
            ? t('planModeOnHint')
            : setModeErr
              ? `${t('planModeFail')}: ${setModeErr}`
              : t('planModeFail'),
        });
      }
      return;
    }

    // Leave plan mode
    setCapabilityArm(null);
    if (active) {
      if (!setModeOk) {
        setChatMode(active.chatMode === 'plan' ? 'plan' : 'agent');
      }
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text: setModeOk
          ? t('planModeOffHint')
          : setModeErr
            ? `${t('planModeFail')}: ${setModeErr}`
            : t('planModeOffHint'),
      });
    }
  };

  /** Run a structured ACP desktop action without routing through prompt text. */
  const runNativeDesktopAction = async (
    visibleText: string,
    action: (agent: Thread) => Promise<string | void>,
    fallbackPrompt?: string,
  ) => {
    const agent = threadsRef.current.find((thread) => thread.id === (active?.id || activeId));
    if (!agent?.client || !agent.sessionId) {
      if (fallbackPrompt) {
        await createThreadRef.current?.({ initialPrompt: fallbackPrompt, initialDisplay: visibleText });
      }
      return;
    }
    if (agent.busy) return;
    appendLine(agent.id, { id: nid(), role: 'user', text: visibleText });
    patchThread(agent.id, { busy: true, error: null });
    try {
      const result = await action(agent);
      if (typeof result === 'string' && result.trim()) {
        appendLine(agent.id, { id: nid(), role: 'system', text: result });
      }
    } catch (error) {
      markTaskFailed(agent.id, error);
    } finally {
      patchThread(agent.id, { busy: false });
    }
  };

  const openGoalAction = async () => {
    const objective = await askAction({
      title: t('goalDialogTitle'),
      message: t('goalDialogHint'),
      placeholder: t('goalDialogPlaceholder'),
      submitLabel: t('goalDialogSubmit'),
    });
    if (!objective) return;
    await runNativeDesktopAction(`${t('goalDialogVisible')}: ${objective}`, async (agent) => {
      patchThread(agent.id, { sessionGoal: makeGoal(objective) });
      await agent.client!.startGoal(agent.sessionId!, objective);
    }, `/goal ${objective}`);
  };

  const openMediaAction = async (media: 'image' | 'video') => {
    const image = media === 'image';
    const prompt = await askAction({
      title: image ? t('imageDialogTitle') : t('videoDialogTitle'),
      message: image ? t('imageDialogHint') : t('videoDialogHint'),
      placeholder: image ? t('imageDialogPlaceholder') : t('videoDialogPlaceholder'),
      submitLabel: image ? t('imageDialogSubmit') : t('videoDialogSubmit'),
    });
    if (!prompt) return;
    const command = image ? `/imagine ${prompt}` : `/imagine-video ${prompt}`;
    const visible = `${image ? t('imageDialogVisible') : t('videoDialogVisible')}: ${prompt}`;
    await runNativeDesktopAction(visible, (agent) =>
      agent.client!.runDesktopCommand(agent.sessionId!, image ? 'imagine' : 'imagine-video', prompt),
      command,
    );
  };

  /**
   * Grok Build exposes image editing as an engine tool, not a stable ACP slash
   * command. Keep the staged image attached and make the edit intent explicit;
   * the kernel then selects its available image-edit tool for this prompt.
   */
  const openImageEditAction = async () => {
    if (!composerAtts.some((attachment) => attachment.kind === 'image')) return;
    const prompt = await askAction({
      title: t('imageEditDialogTitle'),
      message: t('imageEditDialogHint'),
      placeholder: t('imageEditDialogPlaceholder'),
      submitLabel: t('imageEditDialogSubmit'),
    });
    if (!prompt) return;
    setDraft(`${t('imageEditPromptPrefix')}: ${prompt}`);
    setSlashOpen(false);
  };

  /** Launch the kernel-owned evidence workflow only when ACP advertises it. */
  const openDeepResearchAction = async () => {
    const agent = threadsRef.current.find((thread) => thread.id === (active?.id || activeId));
    const available = agent?.commands?.some(
      (command) => command.name.replace(/^\//, '').toLowerCase() === 'deep-research',
    );
    if (!agent?.client || !agent.sessionId || agent.busy || !available) return;
    const query = await askAction({
      title: t('deepResearchDialogTitle'),
      message: t('deepResearchDialogHint'),
      placeholder: t('deepResearchDialogPlaceholder'),
      submitLabel: t('deepResearchDialogSubmit'),
    });
    if (!query) return;
    await runNativeDesktopAction(`${t('deepResearchStarted')}: ${query}`, (current) =>
      current.client!.launchWorkflow(current.sessionId!, 'deep-research', query).then((result) => result.message),
      `/deep-research ${query}`,
    );
  };

  /** Send feedback through the kernel route, never through an invented endpoint. */
  const openFeedbackAction = async () => {
    const agent = threadsRef.current.find((thread) => thread.id === (active?.id || activeId));
    const available = agent?.commands?.some(
      (command) => command.name.replace(/^\//, '').toLowerCase() === 'feedback',
    );
    if (!agent?.client || !agent.sessionId || agent.busy || !available) return;
    const feedback = await askAction({
      title: t('feedbackDialogTitle'),
      message: t('feedbackDialogHint'),
      placeholder: t('feedbackDialogPlaceholder'),
      submitLabel: t('feedbackDialogSubmit'),
    });
    if (!feedback) return;
    try {
      await agent.client.sendFeedback(agent.sessionId, feedback);
      appendLine(agent.id, { id: nid(), role: 'system', text: `${t('feedbackSent')}: ${feedback}` });
    } catch (error) {
      markTaskFailed(agent.id, error);
    }
  };

  /**
   * Grok Build owns this recurring task, including its cadence parsing and
   * seven-day expiry. Keep it distinct from gorkX's durable scheduled jobs.
   */
  const openKernelLoopAction = async () => {
    const agent = threadsRef.current.find((thread) => thread.id === (active?.id || activeId));
    const available = agent?.commands?.some(
      (command) => command.name.replace(/^\//, '').toLowerCase() === 'loop',
    );
    if (!agent?.client || !agent.sessionId || agent.busy || !available) return;
    const request = await askAction({
      title: t('kernelLoopDialogTitle'),
      message: t('kernelLoopDialogHint'),
      placeholder: t('kernelLoopDialogPlaceholder'),
      submitLabel: t('kernelLoopDialogSubmit'),
    });
    if (!request) return;
    await runNativeDesktopAction(`${t('kernelLoopStarted')}: ${request}`,
      (current) => current.client!.runDesktopCommand(current.sessionId!, 'loop', request),
      `/loop ${request}`,
    );
  };

  const openWebSourceAction = async () => {
    const url = await askAction({
      title: t('plusWebSource'),
      message: t('plusWebSourceDialogHint'),
      placeholder: t('plusWebSourcePlaceholder'),
      submitLabel: t('plusWebSourceOpen'),
    });
    if (!url) return;
    try {
      await openWebPreview(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const openSkillAction = async (skill: SkillInfo) => {
    const request = await askAction({
      title: t('skillDialogTitle').replace('{name}', skill.name),
      message: skill.description || skill.whenToUse || t('skillDialogHint'),
      placeholder: t('skillDialogPlaceholder'),
      submitLabel: t('skillDialogSubmit'),
    });
    if (!request) return;
    await runNativeDesktopAction(
      `${t('skillDialogVisible').replace('{name}', skill.name)}: ${request}`,
      (current) => current.client!.runDesktopCommand(current.sessionId!, skill.name, request),
      `/${skill.name} ${request}`,
    );
  };

  /** Start only a saved workflow advertised by the active kernel session. */
  const openWorkflowAction = async (name: string) => {
    const safeName = name.replace(/^\//, '');
    const agent = threadsRef.current.find((thread) => thread.id === (active?.id || activeId));
    const advertised = agent?.commands?.some(
      (command) => command.workflowSource && command.name.replace(/^\//, '') === safeName,
    );
    if (!agent?.client || !agent.sessionId || agent.busy || !advertised) return;
    const context = await askAction({
      title: t('workflowRunTitle').replace('{name}', safeName),
      message: t('workflowRunHint'),
      placeholder: t('workflowRunPlaceholder'),
      submitLabel: t('workflowRunSubmit'),
      allowEmpty: true,
    });
    if (context === null) return;
    await runNativeDesktopAction(
      `${t('workflowRunStarted').replace('{name}', safeName)}${context ? `: ${context}` : ''}`,
      (current) => current.client!.launchWorkflow(current.sessionId!, safeName, context).then((result) => result.message),
      `/${safeName}${context ? ` ${context}` : ''}`,
    );
  };

  /** A newly advertised engine action gets a desktop form until it earns a
   * dedicated UI. This is gated by the live command catalogue, not a guessed
   * slash name, and keeps the implementation syntax out of the transcript. */
  const openEngineAction = async (name: string, title: string, description?: string) => {
    const safeName = name.replace(/^\//, '');
    const agent = threadsRef.current.find((thread) => thread.id === (active?.id || activeId));
    const advertised = agent?.commands?.some(
      (command) => command.name.replace(/^\//, '') === safeName,
    );
    if (!agent?.client || !agent.sessionId || agent.busy || !advertised) return;
    const request = await askAction({
      title,
      message: description || t('plusWorkflowHint'),
      placeholder: t('skillDialogPlaceholder'),
      submitLabel: t('skillDialogSubmit'),
      allowEmpty: true,
    });
    if (request === null) return;
    await runNativeDesktopAction(
      `${title}${request ? `: ${request}` : ''}`,
      (current) => current.client!.runDesktopCommand(current.sessionId!, safeName, request),
      `/${safeName}${request ? ` ${request}` : ''}`,
    );
  };

  /** Compress through the native ACP endpoint, without exposing `/compact`. */
  const compactActiveSession = async () => {
    const agent = threadsRef.current.find((thread) => thread.id === (active?.id || activeId));
    if (!agent?.client || !agent.sessionId || agent.busy) return;
    patchThread(agent.id, { busy: true, error: null });
    try {
      await agent.client.compact(agent.sessionId);
      appendLine(agent.id, { id: nid(), role: 'system', text: t('autoCompactDone') });
    } catch (error) {
      patchThread(agent.id, { error: error instanceof Error ? error.message : String(error) });
    } finally {
      patchThread(agent.id, { busy: false });
    }
  };

  /** Kernel-owned conversation recap behind a plain desktop action. */
  const recapActiveSession = async () => {
    const agent = threadsRef.current.find((thread) => thread.id === (active?.id || activeId));
    const available = agent?.commands?.some(
      (command) => command.name.replace(/^\//, '').toLowerCase() === 'recap',
    );
    if (!agent?.client || !agent.sessionId || agent.busy || !available) return;
    patchThread(agent.id, { busy: true, error: null });
    appendLine(agent.id, { id: nid(), role: 'system', text: t('recapStarted') });
    try {
      await agent.client.requestRecap(agent.sessionId);
    } catch (error) {
      markTaskFailed(agent.id, error);
    } finally {
      patchThread(agent.id, { busy: false });
    }
  };

  /** Sharing may publish conversation content, so explicit confirmation is
   * required before calling the real Grok Build share endpoint. */
  const shareActiveSession = async () => {
    const agent = threadsRef.current.find((thread) => thread.id === (active?.id || activeId));
    const available = agent?.commands?.some(
      (command) => command.name.replace(/^\//, '').toLowerCase() === 'share',
    );
    if (!agent?.client || !agent.sessionId || agent.busy || !available) return;
    const confirmed = await askAction({
      title: t('shareSessionTitle'),
      message: t('shareSessionConfirm'),
      placeholder: '',
      submitLabel: t('shareSessionSubmit'),
      allowEmpty: true,
    });
    if (confirmed === null) return;
    patchThread(agent.id, { busy: true, error: null });
    try {
      const url = await agent.client.shareSession(agent.sessionId);
      try { await navigator.clipboard.writeText(url); } catch { /* link remains in the local task */ }
      appendLine(agent.id, { id: nid(), role: 'system', text: `${t('shareSessionDone')}: ${url}` });
      alert(t('shareSessionCopied'));
    } catch (error) {
      patchThread(agent.id, { error: error instanceof Error ? error.message : String(error) });
    } finally {
      patchThread(agent.id, { busy: false });
    }
  };

  /** Native file-picker export; `/export` remains keyboard compatibility only. */
  const exportActiveSession = async () => {
    if (!active?.sessionId || active.busy) return;
    try {
      const path = await save({
        defaultPath: `gorkx-${active.sessionId.slice(0, 8)}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (typeof path !== 'string' || !path) return;
      await exportSessionMarkdown(active.sessionId, path, grokCmd || undefined);
      alert(`${t('exportSessionDone')}: ${path}`);
    } catch (error) {
      try {
        await exportSessionClipboard(active.sessionId, grokCmd || undefined);
        alert(t('exportSessionClipboard'));
      } catch (fallbackError) {
        alert(fallbackError instanceof Error ? fallbackError.message : String(error));
      }
    }
  };

  /** Local-only support archive, with a plain-language privacy gate. */
  const exportActiveTrace = async () => {
    if (!active?.sessionId || active.busy) return;
    const proceed = await askAction({
      title: t('traceExportTitle'),
      message: t('traceExportHint'),
      placeholder: t('traceExportPlaceholder'),
      submitLabel: t('traceExportChoose'),
      allowEmpty: true,
    });
    if (proceed === null) return;
    try {
      const path = await save({
        defaultPath: `gorkx-trace-${active.sessionId.slice(0, 8)}.tar.gz`,
        filters: [{ name: 'Grok diagnostic archive', extensions: ['tar.gz'] }],
      });
      if (typeof path !== 'string' || !path) return;
      if (!path.endsWith('.tar.gz')) {
        alert(t('traceExportExtension'));
        return;
      }
      await exportSessionTrace(active.sessionId, path, grokCmd || undefined);
      alert(`${t('traceExportDone')}: ${path}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  /** The only remote diagnostic-transfer path: a dedicated warning and explicit user confirmation. */
  const uploadActiveTrace = async () => {
    if (!active?.sessionId || active.busy) return;
    const proceed = await askAction({
      title: t('traceUploadTitle'),
      message: t('traceUploadHint'),
      placeholder: t('traceUploadPlaceholder'),
      submitLabel: t('traceUploadConfirm'),
      allowEmpty: true,
    });
    if (proceed === null) return;
    try {
      const result = await uploadSessionTrace(active.sessionId, grokCmd || undefined);
      appendLine(active.id, { id: nid(), role: 'system', text: `${t('traceUploadDone')}${result ? `: ${result}` : ''}` });
      alert(t('traceUploadDone'));
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handlePlusAction = async (action: PlusAction) => {
    switch (action.type) {
      case 'attach-files':
        await attachFiles({ all: true });
        return;
      case 'attach-folders':
        await attachFiles({ folders: true });
        return;
      case 'capture-screen':
        try {
          const path = await captureScreenRegion();
          await addAttachmentPaths([path]);
        } catch (e) {
          alert(e instanceof Error ? e.message : String(e));
        }
        return;
      case 'open-web-source':
        setPlusMenuOpen(false);
        await openWebSourceAction();
        return;
      case 'pick-project':
        setPlusMenuOpen(false);
        setProjectPickerOpen(true);
        return;
      case 'terminal':
        setTerminalOpen(true);
        localStorage.setItem(OPT_IN_PANEL_KEYS.terminal, '1');
        return;
      case 'review':
        setReviewOpen(true);
        return;
      case 'extensions':
        setExtOpen(true);
        return;
      case 'memory-panel':
        setMemoryOpen(true);
        return;
      case 'plan-toggle':
        await changeChatMode(action.on ? 'plan' : 'agent');
        return;
      case 'explore-mode':
        setNewTaskProfile(action.on ? 'explore' : 'default');
        return;
      case 'task-memory':
        setNewTaskMemoryEnabled(action.on);
        try {
          localStorage.setItem('gorkx.newTaskMemoryEnabled', action.on ? '1' : '0');
        } catch {
          /* local preference is optional */
        }
        return;
      case 'task-subagents':
        setNewTaskSubagentsEnabled(action.on);
        try {
          localStorage.setItem('gorkx.newTaskSubagentsEnabled', action.on ? '1' : '0');
        } catch {
          /* local preference is optional */
        }
        return;
      case 'task-planning':
        setNewTaskPlanningEnabled(action.on);
        try {
          localStorage.setItem('gorkx.newTaskPlanningEnabled', action.on ? '1' : '0');
        } catch {
          /* local preference is optional */
        }
        if (!action.on && chatMode === 'plan') {
          await changeChatMode('agent');
        }
        return;
      case 'task-tool-limits': {
        setPlusMenuOpen(false);
        const labels = TASK_TOOL_LIMIT_OPTIONS.map((option) => `${option.id} — ${t(option.labelKey)}`).join('\n');
        const answer = await askAction({
          title: t('taskToolLimitsTitle'),
          message: `${t('taskToolLimitsMessage')}\n\n${labels}`,
          placeholder: t('taskToolLimitsPlaceholder'),
          submitLabel: t('taskToolLimitsApply'),
          allowEmpty: true,
          initialValue: newTaskDisallowedTools.join(', '),
        });
        if (answer === null) return;
        const next = parseTaskToolLimitsForm(answer);
        setNewTaskDisallowedTools(next);
        try {
          localStorage.setItem('gorkx.newTaskDisallowedTools', JSON.stringify(next));
        } catch {
          /* local preference is optional */
        }
        return;
      }
      case 'task-permission-rules': {
        setPlusMenuOpen(false);
        const answer = await askAction({
          title: t('permRulesTitle'),
          message: t('permRulesMessage'),
          placeholder: t('permRulesPlaceholder'),
          submitLabel: t('permRulesApply'),
          allowEmpty: true,
          initialValue: permissionRulesToForm(newTaskPermissionRules),
        });
        if (answer === null) return;
        try {
          const next = parsePermissionRulesForm(answer);
          setNewTaskPermissionRules(next);
          localStorage.setItem('gorkx.newTaskPermissionRules', JSON.stringify(next));
        } catch (error) {
          alert(error instanceof Error ? error.message : String(error));
        }
        return;
      }
      case 'search-scope': {
        setPlusMenuOpen(false);
        const current = threadsRef.current.find((thread) => thread.id === (active?.id || activeId));
        if (!current?.client || !current.sessionId || !current.searchScopeAvailable) return;
        const answer = await askAction({
          title: t('searchScopeTitle'),
          message: t('searchScopeMessage'),
          placeholder: t('searchScopePlaceholder'),
          submitLabel: t('searchScopeApply'),
          allowEmpty: true,
        });
        if (answer === null) return;
        try {
          const scope = parseSearchScopeForm(answer);
          patchThread(current.id, { pendingSearchScope: scope });
          appendLine(current.id, { id: nid(), role: 'system', text: scope ? t('searchScopeQueued') : t('searchScopeCleared') });
        } catch (error) {
          alert(error instanceof Error ? error.message : String(error));
        }
        return;
      }
      case 'fork-session':
        setPlusMenuOpen(false);
        await forkActiveSession();
        return;
      case 'rewind-session':
        setPlusMenuOpen(false);
        await openRewindDialog();
        return;
      case 'task-info':
        setTaskInfoOpen(true);
        return;
      case 'prompt-history':
        setPromptHistoryOpen(true);
        return;
      case 'compact-session':
        await compactActiveSession();
        return;
      case 'recap-session':
        await recapActiveSession();
        return;
      case 'share-session':
        await shareActiveSession();
        return;
      case 'export-session':
        await exportActiveSession();
        return;
      case 'export-trace':
        await exportActiveTrace();
        return;
      case 'upload-trace':
        await uploadActiveTrace();
        return;
      case 'new-task':
        selectThread(null);
        setDraft('');
        setCapabilityArm(null);
        return;
      case 'set-goal':
        setPlusMenuOpen(false);
        await openGoalAction();
        return;
      case 'deep-research':
        await openDeepResearchAction();
        return;
      case 'send-feedback':
        await openFeedbackAction();
        return;
      case 'start-kernel-loop':
        await openKernelLoopAction();
        return;
      case 'generate-media':
        setPlusMenuOpen(false);
        await openMediaAction(action.media);
        return;
      case 'edit-attached-image':
        setPlusMenuOpen(false);
        await openImageEditAction();
        return;
      case 'skill':
        await openSkillAction(action.skill);
        return;
      case 'workflow':
        await openWorkflowAction(action.name);
        return;
      case 'engine-action':
        await openEngineAction(action.name, action.title, action.description);
        return;
      default:
        return;
    }
  };

  const slashMenuItems = (query: string) => {
    const q = query.replace(/^\//, '').toLowerCase();
    const builtins = [
      { name: 'compact', description: t('slashDescCompact'), source: 'builtin' as const },
      { name: 'clear', description: t('slashDescNew'), source: 'builtin' as const },
      { name: 'new', description: t('slashDescNew'), source: 'builtin' as const },
      { name: 'diff', description: t('slashDescReview'), source: 'builtin' as const },
      { name: 'review', description: t('slashDescReview'), source: 'builtin' as const },
      { name: 'plan', description: t('slashDescPlan'), source: 'builtin' as const },
      { name: 'skills', description: t('slashDescExt'), source: 'builtin' as const },
      { name: 'mcp', description: t('slashDescExt'), source: 'builtin' as const },
      { name: 'plugins', description: t('slashDescExt'), source: 'builtin' as const },
      { name: 'memory', description: t('slashDescMemory'), source: 'local' as const },
      { name: 'flush', description: t('slashDescFlush'), source: 'agent' as const },
      { name: 'dream', description: t('slashDescDream'), source: 'agent' as const },
      { name: 'remember', description: t('slashDescRemember'), source: 'agent' as const },
      { name: 'fork', description: t('slashDescFork'), source: 'agent' as const },
      { name: 'rewind', description: t('slashDescRewind'), source: 'agent' as const },
      { name: 'model', description: t('slashDescModel'), source: 'agent' as const },
      { name: 'effort', description: t('slashDescEffort'), source: 'agent' as const },
      { name: 'context', description: t('slashDescContext'), source: 'agent' as const },
      { name: 'export', description: t('slashDescExport'), source: 'local' as const },
      { name: 'worktree', description: t('slashDescWorktree'), source: 'local' as const },
      { name: 'imagine', description: t('plusImagineHint'), source: 'agent' as const },
      { name: 'imagine-video', description: t('plusImagineVideoHint'), source: 'agent' as const },
      { name: 'goal', description: t('plusGoalHint'), source: 'agent' as const },
    ];
    const fromSession = (active?.commands ?? []).map((c) => ({
      name: c.name.replace(/^\//, ''),
      description: c.description,
      source: 'session' as const,
    }));
    const names = new Set(fromSession.map((c) => c.name.toLowerCase()));
    // Local rows have a direct shell/ACP implementation. Agent rows are only
    // useful when this exact live session advertised them — do not turn a
    // typed slash fallback into a fake product capability.
    const fromBuiltins = builtins.filter(
      (c) => !names.has(c.name.toLowerCase()) && c.source !== 'agent',
    );
    const fromDisk = diskSkillCommands.filter((c) => !names.has(c.name.toLowerCase()));
    return [...fromSession, ...fromBuiltins, ...fromDisk]
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q),
      )
      .slice(0, 28);
  };

  /**
   * Shared composer keyboard: slash / @ menus take Arrow · Tab · Enter · Esc
   * before send. Returns true if the event was handled (caller should stop).
   */
  const handleComposerMenuKeys = (e: ReactKeyboardEvent): boolean => {
    if (e.nativeEvent.isComposing) return false;

    if (slashOpen) {
      const items = slashMenuItems(draft);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (items.length) setSlashIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length) setSlashIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        if (items.length) {
          e.preventDefault();
          const pick = items[Math.min(slashIndex, items.length - 1)];
          if (pick) applySlashPick(pick.name);
          return true;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          return true;
        }
        // Enter with empty menu → fall through to send
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        setSlashIndex(0);
        return true;
      }
    }

    if (atOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (atHits.length) setAtIndex((i) => (i + 1) % atHits.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (atHits.length) setAtIndex((i) => (i - 1 + atHits.length) % atHits.length);
        return true;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        if (atHits.length) {
          e.preventDefault();
          const hit = atHits[Math.min(atIndex, atHits.length - 1)];
          if (hit) insertAtFile(hit.path);
          return true;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          return true;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAtOpen(false);
        setAtQuery('');
        setAtIndex(0);
        return true;
      }
    }

    return false;
  };

  /** Open folder picker starting at the default gorkX projects root (~/.gorkx/projects). */
  const pickProject = async () => {
    let defaultPath: string | undefined;
    try {
      defaultPath = await projectsRoot();
    } catch {
      /* still open dialog */
    }
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('openProjectFolder'),
      ...(defaultPath ? { defaultPath } : {}),
    });
    if (typeof selected === 'string') {
      setProject(selected);
      setRecentProjects(pushRecentProject(selected));
      localStorage.setItem('gorkx.project', selected);
    }
  };

  const handleProjectPicker = async (a: ProjectPickerAction) => {
    switch (a.type) {
      case 'select':
        setProject(a.path);
        setRecentProjects(pushRecentProject(a.path));
        localStorage.setItem('gorkx.project', a.path);
        return;
      case 'no-project':
        setProject('');
        localStorage.removeItem('gorkx.project');
        return;
      case 'new-blank':
        await createProjectByName();
        return;
      case 'open-folder':
        await pickProject();
        return;
      default:
        return;
    }
  };

  const sourceLabel = (source: string) => {
    switch (source) {
      case 'session':
        return t('slashSrcSession');
      case 'builtin':
        return t('slashSrcBuiltin');
      case 'skill':
        return t('slashSrcSkill');
      case 'agent':
        return t('slashSrcAgent');
      case 'local':
        return t('slashSrcLocal');
      default:
        return t('slashLocal');
    }
  };

  const removeProjectFromApp = (path: string, options?: { clearTaskIndex?: boolean }) => {
    // UI-only: remove from recent list; never delete files on disk
    setRecentProjects(removeRecentProject(path));
    setPinnedProjects((prev) => {
      const next = prev.filter((x) => x !== path);
      localStorage.setItem('gorkx.pinnedProjects', JSON.stringify(next));
      return next;
    });
    if (project === path) {
      setProject('');
      localStorage.setItem('gorkx.project', '');
    }
    // A deliberate user removal also clears the app-only task index. Recovery
    // from a missing folder must retain it: an external disk or temporary
    // worktree can return later, and removing a sidebar row must not erase
    // the user's local task history in that case.
    if (options?.clearTaskIndex !== false) void clearProjectStore(path);
  };

  /** Rename the desktop task and, while live, the corresponding Grok session. */
  const renameThread = async (id: string) => {
    const th = threads.find((x) => x.id === id);
    if (!th) return;
    const next = await askText({
      title: t('renameThread'),
      message: t('renameThreadPrompt'),
      defaultValue: th.title,
      okLabel: t('confirm'),
    });
    if (next == null) return;
    const raw = next.trim().slice(0, 80);
    if (!raw) return;
    const siblings = threadsRef.current.filter(
      (x) =>
        projectScopeKey(x.projectKey) === projectScopeKey(th.projectKey) && !x.archived,
    );
    const title = uniquifyThreadTitle(raw, siblings, id);
    patchThread(id, { title });
    // The App-owned title remains immediately durable offline. A live session
    // also receives the native rename so Grok recovery/search stays aligned.
    if (th.client && th.sessionId) {
      void th.client.renameSession(th.sessionId, title, th.cwd).catch(() => {
        appendLine(id, { id: nid(), role: 'system', text: t('renameThreadEngineSyncFailed') });
      });
    }
  };

  /**
   * Rename project folder on disk + rekey SQLite + update in-memory paths.
   * Display alias is cleared so folder name becomes the name.
   */
  const renameProjectOnDisk = async (oldPath: string) => {
    const currentName = projectDisplayName(oldPath, projectAliases);
    const nextName = await askText({
      title: t('renameProject'),
      message: t('renameProjectDiskPrompt'),
      defaultValue: currentName,
      okLabel: t('confirm'),
    });
    if (nextName == null || !nextName.trim()) return;
    try {
      const newPath = await invoke<string>('rename_project_folder', {
        oldPath,
        newName: nextName.trim(),
      });
      await invoke('store_rekey_project', { oldProject: oldPath, newProject: newPath });
      // Paths in recent / pinned / current
      setRecentProjects((prev) => {
        const next = prev.map((p) => (p === oldPath ? newPath : p));
        localStorage.setItem('gorkx.recentProjects', JSON.stringify(next));
        return next;
      });
      setPinnedProjects((prev) => {
        const next = prev.map((p) => (p === oldPath ? newPath : p));
        localStorage.setItem('gorkx.pinnedProjects', JSON.stringify(next));
        return next;
      });
      setProjectAliases((prev) => {
        const map = { ...prev };
        delete map[oldPath];
        delete map[newPath];
        localStorage.setItem('gorkx.projectAliases', JSON.stringify(map));
        return map;
      });
      if (project === oldPath) {
        setProject(newPath);
        localStorage.setItem('gorkx.project', newPath);
      }
      // In-memory threads
      setThreads((prev) =>
        prev.map((th) => {
          if (th.projectKey !== oldPath && th.cwd !== oldPath && !th.cwd?.startsWith(oldPath + '/')) {
            return th;
          }
          const repath = (p?: string | null) => {
            if (!p) return p;
            if (p === oldPath) return newPath;
            if (p.startsWith(oldPath + '/')) return newPath + p.slice(oldPath.length);
            return p;
          };
          return {
            ...th,
            projectKey: th.projectKey === oldPath ? newPath : th.projectKey,
            cwd: repath(th.cwd) || th.cwd,
            worktreePath: repath(th.worktreePath) ?? null,
          };
        }),
      );
      setProjectSessions((m) => {
        const out = { ...m };
        if (out[oldPath]) {
          out[newPath] = out[oldPath];
          delete out[oldPath];
        }
        return out;
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const createThread = async (opts?: {
    worktree?: boolean;
    /** Explicit cwd (e.g. open existing worktree path as a new task) */
    cwdOverride?: string;
    initialPrompt?: string;
    /** Friendly wording shown in chat when the engine command is internal. */
    initialDisplay?: string;
    initialAttachments?: ComposerAttachment[];
    profileOverride?: NewTaskProfile;
  }) => {
    const useWorktree = Boolean(opts?.worktree);
    const initialPrompt = (opts?.initialPrompt || '').trim();
    const initialDisplay = (opts?.initialDisplay || '').trim();
    const initialAttachments = opts?.initialAttachments || [];
    const selectedProfile = opts?.profileOverride ?? newTaskProfile;
    const memoryEnabled = newTaskMemoryEnabled;
    const subagentsEnabled = newTaskSubagentsEnabled;
    const planningEnabled = newTaskPlanningEnabled;
    const disallowedTools = sanitizeTaskToolLimits(newTaskDisallowedTools);
    const permissionRules = sanitizePermissionRules(newTaskPermissionRules);
    const cwdOverride = (opts?.cwdOverride || '').trim();
    if (useWorktree && !project && !cwdOverride) {
      alert(t('worktreeNeedProject'));
      return { ok: false, error: t('worktreeNeedProject') };
    }
    const scope = projectScopeKey(cwdOverride || project);
    const cwdBase = cwdOverride || project || (await homeDir());
    const id = tid();
    const rawSeed = initialPrompt
      ? titleFromUserText(initialDisplay || initialPrompt) || (project ? t('newThread') : t('inboxChat'))
      : useWorktree
        ? t('worktree')
        : project
          ? t('newThread')
          : t('inboxChat');
    const siblings = threadsRef.current.filter(
      (th) => projectScopeKey(th.projectKey) === scope && !th.archived,
    );
    const seedTitle = uniquifyThreadTitle(rawSeed, siblings);
    const createdAt = Date.now();
    setThreads((p) => [
      ...p,
      {
        id,
        title: seedTitle,
        sessionId: null,
        modelId: null,
        client: null,
        lines: [],
        busy: true,
        error: null,
        chatMode,
        cwd: cwdBase,
        projectKey: scope,
        worktreePath: null,
        effort,
        memoryEnabled,
        subagentsEnabled,
        planningEnabled,
        disallowedTools,
        permissionRules,
        archived: false,
        updatedAt: createdAt,
      },
    ]);
    selectThread(id);
    try {
      const client = await bootstrapClient(
        cwdBase,
        memoryEnabled,
        subagentsEnabled,
        planningEnabled,
        disallowedTools,
        permissionRules,
      );
      wireClient(id, client);
      const session = await client.newSession(
        cwdBase,
        agentProfileForNewTask(chatMode, selectedProfile, cwdBase, maxAgentTurns, disallowedTools),
      );
      rememberModels(session);
      let sessionId = session.sessionId;
      let cwd = cwdBase;
      let worktreePath: string | null = null;

      let selectedModelId = session.models?.currentModelId || null;
      if (modelId && modelId !== selectedModelId) {
        try {
          await client.setModel(sessionId, modelId);
          selectedModelId = modelId;
        } catch {
          // Keep the engine-reported default; never show an unaccepted model as active.
        }
      }

      if (useWorktree && project) {
        appendLine(id, { id: nid(), role: 'system', text: t('worktreeCreating') });
        const wt = await client.createWorktree(
          sessionId,
          project,
          `gorkx-${Date.now().toString(36)}`,
        );
        if (wt.worktreePath) {
          worktreePath = wt.worktreePath;
          cwd = wt.worktreePath;
        }
        if (wt.sessionId && wt.sessionId !== sessionId) {
          try {
            const loaded = await client.loadSession(wt.sessionId, cwd);
            sessionId = loaded.sessionId || wt.sessionId;
            void reconcileRunningSubagents(id, client, sessionId);
          } catch {
            sessionId = wt.sessionId;
          }
        }
        appendLine(id, {
          id: nid(),
          role: 'system',
          text: `worktree ${wt.status ?? 'ok'}${worktreePath ? `: ${worktreePath}` : ''}`,
        });
      }

      if (chatMode === 'plan') {
        try {
          await client.setMode(sessionId, 'plan');
        } catch (e) {
          appendLine(id, {
            id: nid(),
            role: 'system',
            text: `plan mode: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      } else {
        try {
          await client.setMode(sessionId, 'default');
        } catch {
          /* ignore */
        }
      }

      const mid = selectedModelId;
      // Hermes: load durable memory for first prompt injection
      let memInject = '';
      if (memoryEnabled) {
        try {
          memInject = await fetchMemoryInjection(project || undefined);
        } catch {
          memInject = '';
        }
      }
      // Title is fixed at create (seedTitle). Do not rewrite after agent runs.
      patchThread(id, {
        client,
        sessionId,
        modelId: mid,
        busy: Boolean(initialPrompt),
        cwd,
        projectKey: scope,
        worktreePath,
        chatMode,
        title: seedTitle,
        memoryInject: memInject || null,
        memoryInjected: false,
        userTurnCount: 0,
        memoryEnabled,
        subagentsEnabled,
        planningEnabled,
        disallowedTools,
        permissionRules,
        searchScopeAvailable: client.supportsSearchToolOverrides,
      });

      // Home-style: first message creates the session
      if (initialPrompt) {
        const userVisible = initialDisplay ||
          initialPrompt.replace(/\n\n\[Attached files[\s\S]*$/i, '').trim() || initialPrompt;
        const goalParsed = parseGoalCommand(initialPrompt);
        if (goalParsed?.text && !goalParsed.sub) {
          patchThread(id, { sessionGoal: makeGoal(goalParsed.text) });
        }
        appendLine(id, {
          id: nid(),
          role: 'user',
          text: userVisible,
          attachments: initialAttachments.length ? initialAttachments : undefined,
        });
        const ordinaryPrompt = initialPrompt.startsWith('/')
          ? initialPrompt
          : withConversationPresentation(initialPrompt);
        const enginePrompt = memInject
          ? `${memInject}\n\n---\n\n用户请求：\n${ordinaryPrompt}`
          : ordinaryPrompt;
        try {
          const result = await client.prompt(
            sessionId,
            enginePrompt,
            attachmentResourceLinks(initialAttachments),
          );
          if (result?.stopReason && result.stopReason !== 'end_turn') {
            appendLine(id, {
              id: nid(),
              role: 'system',
              text: `stop: ${result.stopReason}`,
            });
          }
          patchThread(id, {
            memoryInjected: true,
            memoryInject: null,
            userTurnCount: 1,
          });
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          markTaskFailed(id, error);
          return { ok: false, error };
        } finally {
          patchThread(id, { busy: false });
          // Auto-learn: persist session dump after first turn
          if (memoryEnabled) {
            void recordSessionMemory(
              project || undefined,
              seedTitle,
              userVisible.slice(0, 2000),
            );
          }
        }
      }
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      // A project may have been moved or deleted outside gorkX (especially a
      // disposable worktree). Do not leave an empty failed task that makes it
      // look like the kernel or account failed. Remove only the stale desktop
      // project reference; this never touches files on disk.
      if (
        /Project folder is unavailable for the agent sandbox|Project folder is not a directory for the agent sandbox/i.test(error)
        && (cwdOverride || project)
      ) {
        setThreads((items) => items.filter((thread) => thread.id !== id));
        if (project === cwdBase) removeProjectFromApp(cwdBase, { clearTaskIndex: false });
        if (activeIdRef.current === id) selectThread(null);
        alert(t('projectUnavailable').replace('{path}', cwdBase));
        return { ok: false, error };
      }
      markTaskFailed(id, error);
      return { ok: false, error };
    }
  };

  createThreadRef.current = createThread;

  const resumeSession = async (sessionId: string, title?: string | null) => {
    const scope = projectScopeKey(project);
    // Reuse any local row for this kernel session (with or without live client)
    const existing = threadsRef.current.find((th) => th.sessionId === sessionId);
    if (existing) {
      selectThread(existing.id);
      if (existing.client) return;
      // Fall through to reconnect into the same row id
      try {
        const cwdBase = existing.cwd || project || (await homeDir());
        const client = await bootstrapClient(cwdBase);
        wireClient(existing.id, client);
        const session = await client.loadSession(sessionId, cwdBase);
        rememberModels(session);
        patchThread(existing.id, {
          client,
          sessionId: session.sessionId || sessionId,
          busy: false,
          title: existing.title || title || sessionId.slice(0, 8),
          cwd: cwdBase,
          projectKey: existing.projectKey || scope,
        });
        void reconcileRunningSubagents(existing.id, client, session.sessionId || sessionId);
      } catch (e) {
        patchThread(existing.id, {
          busy: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      return;
    }
    const cwdBase = project || (await homeDir());
    const id = tid();
    const siblings = threadsRef.current.filter(
      (th) => projectScopeKey(th.projectKey) === scope && !th.archived,
    );
    const seedTitle = uniquifyThreadTitle(
      (title || '').trim() || sessionId.slice(0, 8),
      siblings,
    );
    setThreads((p) => [
      ...p,
      {
        id,
        title: seedTitle,
        sessionId,
        modelId: null,
        client: null,
        lines: [],
        busy: true,
        error: null,
        chatMode,
        cwd: cwdBase,
        projectKey: scope,
        worktreePath: null,
        effort,
        archived: false,
        updatedAt: Date.now(),
      },
    ]);
    selectThread(id);
    try {
      const client = await bootstrapClient(cwdBase);
      wireClient(id, client);
      const session = await client.loadSession(sessionId, cwdBase);
      rememberModels(session);
      void reconcileRunningSubagents(id, client, session.sessionId || sessionId);
      await new Promise((r) => setTimeout(r, 400));
      let mid = session.models?.currentModelId ?? null;
      if (modelId && modelId !== mid) {
        try {
          await client.setModel(session.sessionId || sessionId, modelId);
          mid = modelId;
        } catch {
          // Resume with the engine-reported model when the requested one is unavailable.
        }
      }
      if (chatMode === 'plan') {
        try {
          await client.setMode(session.sessionId || sessionId, 'plan');
        } catch {
          /* ignore */
        }
      }
      patchThread(id, {
        client,
        sessionId: session.sessionId || sessionId,
        modelId: mid,
        busy: false,
        title: title || sessionId.slice(0, 8),
        cwd: cwdBase,
        projectKey: scope,
        chatMode,
      });
    } catch (e) {
      patchThread(id, {
        busy: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /** Native, kernel-owned session copy. The source remains open and unchanged. */
  const forkActiveSession = async () => {
    const source = threadsRef.current.find((thread) => thread.id === activeId);
    if (!source?.client || !source.sessionId || source.busy) return;
    patchThread(source.id, { busy: true, error: null });
    try {
      const fork = await source.client.forkSession(source.sessionId, source.cwd);
      const id = tid();
      const siblings = threadsRef.current.filter(
        (thread) => projectScopeKey(thread.projectKey) === projectScopeKey(source.projectKey) && !thread.archived,
      );
      const child = {
        id,
        title: uniquifyThreadTitle(`${source.title} · ${t('forkSession')}`, siblings),
        sessionId: fork.newSessionId,
        modelId: fork.newModelId ?? source.modelId,
        client: source.client,
        lines: [],
        busy: true,
        error: null,
        chatMode: source.chatMode,
        cwd: fork.newCwd || source.cwd,
        projectKey: source.projectKey,
        worktreePath: source.worktreePath,
        effort: source.effort,
        archived: false,
        updatedAt: Date.now(),
      } satisfies Thread;
      setThreads((previous) => [...previous, child]);
      wireClient(id, source.client);
      selectThread(id);
      const loaded = await source.client.loadSession(child.sessionId, child.cwd);
      rememberModels(loaded);
      patchThread(id, {
        sessionId: loaded.sessionId || child.sessionId,
        modelId: loaded.models?.currentModelId ?? child.modelId,
        busy: false,
      });
      appendLine(id, { id: nid(), role: 'system', text: t('forkSessionDone') });
      void reconcileRunningSubagents(id, source.client, loaded.sessionId || child.sessionId);
    } catch (error) {
      patchThread(source.id, {
        error: `${t('forkSessionFailed')}: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      patchThread(source.id, { busy: false });
    }
  };

  /** Listing points is read-only; the dialog previews before it ever commits. */
  const openRewindDialog = async () => {
    let source = threadsRef.current.find((thread) => thread.id === activeId);
    if (!source?.sessionId) {
      alert(t('rewindNeedsSession'));
      return;
    }
    if (!source.client) {
      await reconnectThread(source.id);
      source = threadsRef.current.find((thread) => thread.id === activeId);
    }
    if (!source?.client || !source.sessionId || source.busy) return;
    patchThread(source.id, { busy: true, error: null });
    try {
      const points = await source.client.rewindPoints(source.sessionId);
      setRewindDialog({ threadId: source.id, points });
    } catch (error) {
      patchThread(source.id, {
        error: `${t('rewindFailed')}: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      patchThread(source.id, { busy: false });
    }
  };

  const executeRewind = async (point: RewindPoint, mode: RewindMode, force = false) => {
    const dialog = rewindDialog;
    const source = threadsRef.current.find((thread) => thread.id === dialog?.threadId);
    if (!dialog || !source?.client || !source.sessionId) return;
    setRewindDialog({ ...dialog, busy: true, error: null });
    patchThread(source.id, { busy: true, error: null });
    try {
      const preview = await source.client.previewRewind(source.sessionId, point.promptIndex, mode);
      const conflicts = preview.conflicts.slice(0, 5).map((item) => item.path).join(', ');
      // The kernel defines force=false as a non-mutating preview, so a false
      // success flag is expected here. Stop on any non-conflict preview error.
      if (preview.conflicts.length && !force) {
        setRewindDialog({
          ...dialog,
          busy: false,
          error: `${preview.error || t('rewindConflictFound')}${conflicts ? `: ${conflicts}` : ''}`,
          preview,
        });
        return;
      }
      if (preview.error && !preview.conflicts.length) {
        setRewindDialog({ ...dialog, busy: false, error: `${preview.error}${conflicts ? `: ${conflicts}` : ''}`, preview });
        return;
      }
      const result = await source.client.commitRewind(source.sessionId, point.promptIndex, mode);
      if (!result.success) {
        const commitConflicts = result.conflicts.slice(0, 5).map((item) => item.path).join(', ');
        setRewindDialog({
          ...dialog,
          busy: false,
          error: `${result.error || t('rewindFailed')}${commitConflicts ? `: ${commitConflicts}` : ''}`,
          preview: result,
        });
        return;
      }
      patchThread(source.id, { lines: [] });
      const loaded = await source.client.loadSession(source.sessionId, source.cwd);
      rememberModels(loaded);
      patchThread(source.id, { sessionId: loaded.sessionId || source.sessionId, busy: false });
      if (result.promptText?.trim()) setDraft(result.promptText);
      setComposerAtts([]);
      appendLine(source.id, { id: nid(), role: 'system', text: t('rewindDone') });
      setRewindDialog(null);
    } catch (error) {
      setRewindDialog({
        ...dialog,
        busy: false,
        error: `${t('rewindFailed')}: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      patchThread(source.id, { busy: false });
    }
  };

  /** Add a short steering note to the active Grok Build turn. */
  const interjectDraft = async () => {
    const live = threadsRef.current.find((thread) => thread.id === (active?.id || activeId));
    const text = draft.trim();
    // The native interjection route currently accepts text and image blocks;
    // keep the desktop action text-only until the composer attachment encoder
    // is shared with this path. Users can still queue an attachment normally.
    if (!live?.busy || !live.client || !live.sessionId || !text || composerAtts.length) return;
    setDraft('');
    setSlashOpen(false);
    setAtOpen(false);
    try {
      await live.client.interject(live.sessionId, text);
      appendLine(live.id, { id: nid(), role: 'system', text: t('followUpInterjected') });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (/method.?not.?found|unknown.*method/i.test(detail)) {
        setQueuedFollowUps((previous) => ({ ...previous, [live.id]: text }));
        appendLine(live.id, {
          id: nid(),
          role: 'system',
          text: `${t('followUpQueue')}: ${text.slice(0, 160)}${text.length > 160 ? '…' : ''}`,
        });
      } else {
        setDraft(text);
        appendLine(live.id, {
          id: nid(),
          role: 'system',
          text: `${t('followUpInterjectFailed')}: ${detail}`,
        });
      }
    }
  };

  /** Ask the kernel's side-question channel without stopping the main turn. */
  const askAsideDraft = async () => {
    const live = threadsRef.current.find((thread) => thread.id === (active?.id || activeId));
    const text = draft.trim();
    if (!live?.busy || !live.client || !live.sessionId || !text || composerAtts.length || asideBusyThreadId) return;
    setDraft('');
    setSlashOpen(false);
    setAtOpen(false);
    appendLine(live.id, { id: nid(), role: 'user', text, at: Date.now() });
    setAsideBusyThreadId(live.id);
    try {
      const answer = await live.client.askAside(live.sessionId, text);
      appendLine(live.id, {
        id: nid(),
        role: 'assistant',
        text: `${t('followUpAsideAnswer')}\n\n${answer}`,
        at: Date.now(),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (/method.?not.?found|unknown.*method/i.test(detail)) {
        setQueuedFollowUps((previous) => ({ ...previous, [live.id]: text }));
        appendLine(live.id, {
          id: nid(),
          role: 'system',
          text: `${t('followUpQueue')}: ${text.slice(0, 160)}${text.length > 160 ? '…' : ''}`,
        });
      } else {
        setDraft(text);
        appendLine(live.id, {
          id: nid(),
          role: 'system',
          text: `${t('followUpAsideFailed')}: ${detail}`,
        });
      }
    } finally {
      setAsideBusyThreadId(null);
    }
  };

  const send = async (submittedText?: string) => {
    const choiceSubmission = typeof submittedText === 'string';
    const text = (submittedText ?? draft).trim();
    // A decision-card click must never unexpectedly attach files the user had
    // staged for a different draft. Keep that draft untouched for later.
    const atts = choiceSubmission ? [] : composerAtts;
    if (!text && atts.length === 0) return;
    const promptBody = `${text}${attachmentsPromptBlock(atts)}`.trim();

    // Restored snapshot has sessionId but no live agent — reconnect in place (do NOT create a 2nd row)
    if (active?.sessionId && !active.client) {
      if (active.busy) return;
      try {
        await reconnectThread(active.id);
      } catch {
        return;
      }
    }

    // No thread / brand-new stub without session: create one and send (Codex home composer)
    const live = threadsRef.current.find((th) => th.id === (active?.id || activeId));
    // While busy, text is queued for the next normal turn. The expert `/btw`
    // compatibility path is the one exception: it has its own native side-
    // question route below. Attachments still use the normal queue because
    // the side-question encoder is text-only in this desktop surface.
    const busyAsideCommand = !choiceSubmission && atts.length === 0 && /^\/btw(?:\s|$)/i.test(text);
    if (live?.busy && text && !choiceSubmission && !busyAsideCommand) {
      setQueuedFollowUps((prev) => ({ ...prev, [live.id]: text }));
      setDraft('');
      setSlashOpen(false);
      appendLine(live.id, {
        id: nid(),
        role: 'system',
        text: `${t('followUpQueued')}: ${text.slice(0, 160)}${text.length > 160 ? '…' : ''}`,
      });
      return;
    }
    if (!live?.client || !live.sessionId) {
      if (live?.busy) return;
      if (!active || !active.sessionId) {
        if (!choiceSubmission) {
          setDraft('');
          setComposerAtts([]);
        }
        setSlashOpen(false);
        setAtOpen(false);
        await createThread({ initialPrompt: promptBody, initialAttachments: atts });
        return;
      }
      // sessionId present but reconnect failed
      return;
    }
    if (live.busy) return;

    // Use the live agent (may have been reconnected above)
    const agent = live;
    const client = agent.client!;
    const sessionId = agent.sessionId!;

    // A new user turn invalidates a suggestion generated for the previous
    // response; never leave a stale next-step chip beside fresh work.
    setPromptSuggestion(null);
    setPromptSuggestionError(null);

    // Suggestions belong to the prior response. A user-authored send (or a
    // clicked suggestion) starts the next turn, so they must not linger.
    setFollowUps((previous) => {
      if (!(agent.id in previous)) return previous;
      const { [agent.id]: _consumed, ...rest } = previous;
      return rest;
    });

    // Silent auto-compact near model threshold (always on; no UI toggle)
    if (!text.startsWith('/') && !compactingRef.current) {
      const limit = modelCtx?.contextWindow || agent.usage?.contextLimit || 500_000;
      const used = estimateContextUsed(agent.usage);
      const thr = (modelCtx?.autoCompactPercent ?? 80) / 100;
      if (limit > 0 && used / limit >= thr) {
        compactingRef.current = true;
        try {
          await client.compact(sessionId);
          appendLine(agent.id, {
            id: nid(),
            role: 'system',
            text: t('autoCompactDone'),
          });
        } catch {
          /* still send; compact best-effort */
        } finally {
          compactingRef.current = false;
        }
      }
    }

    // Local / slash builtins (Codex-like)
    if (text.startsWith('/')) {
      const [cmd, ...rest] = text.slice(1).split(/\s+/);
      const arg = rest.join(' ').trim();
      const name = (cmd || '').toLowerCase();
      if (name === 'btw') {
        setDraft('');
        setSlashOpen(false);
        setAtOpen(false);
        setCapabilityArm(null);
        if (!arg) {
          appendLine(agent.id, { id: nid(), role: 'system', text: t('followUpAsideHint') });
          return;
        }
        appendLine(agent.id, { id: nid(), role: 'user', text: arg, at: Date.now() });
        try {
          const answer = await client.askAside(sessionId, arg);
          appendLine(agent.id, {
            id: nid(),
            role: 'assistant',
            text: `${t('followUpAsideAnswer')}\n\n${answer}`,
            at: Date.now(),
          });
        } catch (error) {
          appendLine(agent.id, {
            id: nid(),
            role: 'system',
            text: `${t('followUpAsideFailed')}: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        return;
      }
      if (name === 'compact') {
        setDraft('');
        setSlashOpen(false);
        patchThread(agent.id, { busy: true, error: null });
        appendLine(agent.id, { id: nid(), role: 'user', text });
        try {
          await client.compact(sessionId, arg || undefined);
          appendLine(agent.id, {
            id: nid(),
            role: 'system',
            text: arg ? `compact requested (${arg})` : 'compact requested',
          });
        } catch {
          // Fallback: send as normal slash to agent
          try {
            await client.prompt(sessionId, text);
          } catch (e2) {
            patchThread(agent.id, {
              error: e2 instanceof Error ? e2.message : String(e2),
            });
          }
        } finally {
          patchThread(agent.id, { busy: false });
        }
        return;
      }
      if (name === 'clear' || name === 'new') {
        setDraft('');
        setSlashOpen(false);
        selectThread(null);
        setCapabilityArm(null);
        return;
      }
      if (name === 'diff' || name === 'review') {
        setDraft('');
        setSlashOpen(false);
        setReviewOpen(true);
        return;
      }
      if (name === 'skills' || name === 'plugins' || name === 'mcp' || name === 'mcps') {
        setDraft('');
        setSlashOpen(false);
        setExtOpen(true);
        return;
      }
      if (name === 'memory' || name === 'mem') {
        setDraft('');
        setSlashOpen(false);
        setMemoryOpen(true);
        return;
      }
      if (name === 'export') {
        setDraft('');
        setSlashOpen(false);
        if (sessionId) {
          void exportSessionClipboard(sessionId, grokCmd || undefined)
            .then(() => alert(t('exportSessionClipboard')))
            .catch((e) => alert(String(e)));
        }
        return;
      }
      if (name === 'sessions' || name === 'resume') {
        setDraft('');
        setSlashOpen(false);
        // Product: only gorkX tasks — open archived list in settings, not kernel import
        setKernelOpen(true);
        return;
      }
      if (name === 'worktree' || name === 'worktrees') {
        setDraft('');
        setSlashOpen(false);
        setWorktreePanelOpen(true);
        return;
      }
      if (name === 'plan') {
        setDraft('');
        setSlashOpen(false);
        void (async () => {
          await changeChatMode('plan');
          if (arg) {
            // /plan <description> — mode on, then send description as first plan turn
            appendLine(agent.id, { id: nid(), role: 'user', text: arg });
            patchThread(agent.id, { busy: true, error: null });
            try {
              await client.prompt(sessionId, arg);
            } catch (e) {
              patchThread(agent.id, {
                error: e instanceof Error ? e.message : String(e),
              });
            } finally {
              patchThread(agent.id, { busy: false });
            }
          }
        })();
        return;
      }
      // Keep the local Goal banner in sync; the actual action is routed through ACP below.
      if (name === 'goal') {
        const parsed = parseGoalCommand(text);
        if (parsed?.sub === 'clear') {
          patchThread(agent.id, { sessionGoal: null });
        } else if (parsed?.sub === 'pause' && agent.sessionGoal) {
          patchThread(agent.id, {
            sessionGoal: { ...agent.sessionGoal, status: 'paused', updatedAt: Date.now() },
          });
        } else if (parsed?.sub === 'resume' && agent.sessionGoal) {
          patchThread(agent.id, {
            sessionGoal: { ...agent.sessionGoal, status: 'active', updatedAt: Date.now() },
          });
        } else if (parsed?.text && !parsed.sub) {
          patchThread(agent.id, { sessionGoal: makeGoal(parsed.text) });
        } else if (!arg) {
          appendLine(agent.id, {
            id: nid(),
            role: 'system',
            text: t('goalNeedText'),
          });
        }
      }
    }

    if (!choiceSubmission) {
      setDraft('');
      setComposerAtts([]);
    }
    setSlashOpen(false);
    setAtOpen(false);
    setCapabilityArm(null);
    const userCount = agent.lines.filter((l) => l.role === 'user').length;
    const displayText = text || (atts.length ? t('attachmentsOnlyMessage') : '');
    appendLine(agent.id, {
      id: nid(),
      role: 'user',
      text: displayText,
      attachments: atts.length ? atts : undefined,
    });
    // Lock title on first user message only — never auto-rename later.
    // If the name is already used in this project, append time / index so rows stay distinct.
    if (userCount === 0 && canAutoTitle(agent.title)) {
      const nice =
        titleFromUserText(text) || (atts[0]?.name ? titleFromUserText(atts[0].name) : '');
      if (nice) {
        const siblings = threadsRef.current.filter(
          (th) =>
            projectScopeKey(th.projectKey) === projectScopeKey(agent.projectKey) &&
            !th.archived,
        );
        patchThread(agent.id, { title: uniquifyThreadTitle(nice, siblings, agent.id) });
      }
    }
    patchThread(agent.id, { busy: true, error: null });
    // Hermes: inject long-term memory once on first real user turn
    let engineBody = !text.startsWith('/') && !choiceSubmission
      ? withConversationPresentation(promptBody)
      : promptBody;
    let markInjected = false;
    if (!agent.memoryInjected && !text.startsWith('/')) {
      let inject = agent.memoryInject || '';
      if (!inject) {
        try {
          inject = await fetchMemoryInjection(
            agent.projectKey === NO_PROJECT_KEY ? undefined : agent.cwd || project || undefined,
          );
        } catch {
          inject = '';
        }
      }
      if (inject) {
        engineBody = `${inject}\n\n---\n\n用户请求：\n${engineBody}`;
        markInjected = true;
      }
    }
    try {
      const result = await client.prompt(
        sessionId,
        engineBody,
        attachmentResourceLinks(atts),
        agent.pendingSearchScope,
      );
      if (result?.stopReason && result.stopReason !== 'end_turn') {
        appendLine(agent.id, {
          id: nid(),
          role: 'system',
          text: `stop: ${result.stopReason}`,
        });
      }
      if (markInjected) {
        patchThread(agent.id, { memoryInjected: true, memoryInject: null });
      }
      if (agent.pendingSearchScope !== undefined) patchThread(agent.id, { pendingSearchScope: undefined });
    } catch (e) {
      patchThread(agent.id, {
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      const turns = (agent.userTurnCount || 0) + 1;
      patchThread(agent.id, { busy: false, userTurnCount: turns });
      // Auto-learn: after each meaningful non-slash turn, dump session notes
      if (!text.startsWith('/') && displayText.trim().length >= 8) {
        const th = threadsRef.current.find((x) => x.id === agent.id);
        const recent = (th?.lines || [])
          .filter((l) => l.role === 'user' || l.role === 'assistant')
          .slice(-6)
          .map((l) => `${l.role}: ${l.text.slice(0, 400)}`)
          .join('\n');
        void recordSessionMemory(
          agent.projectKey === NO_PROJECT_KEY ? undefined : agent.cwd || project || undefined,
          th?.title || agent.title,
          recent || displayText,
        );
      }
    }
  };
  sendRef.current = send;

  const insertAtFile = (path: string) => {
    setDraft((d) => {
      // replace trailing @query with @path
      const m = d.match(/@([^\s@]*)$/);
      if (m) return d.slice(0, d.length - m[0].length) + `@${path} `;
      return (d ? d + ' ' : '') + `@${path} `;
    });
    setAtOpen(false);
    setAtQuery('');
    setAtIndex(0);
  };

  // Reset highlight when slash filter text changes
  useEffect(() => {
    if (slashOpen) setSlashIndex(0);
  }, [draft, slashOpen]);

  // @file fuzzy search
  useEffect(() => {
    const cwd = active?.cwd || project;
    if (!atOpen || !cwd) return;
    const handle = window.setTimeout(() => {
      void listWorkspaceFiles(cwd, atQuery, 40)
        .then((hits) => {
          setAtHits(hits);
          setAtIndex(0);
        })
        .catch(() => {
          setAtHits([]);
          setAtIndex(0);
        });
    }, 120);
    return () => window.clearTimeout(handle);
  }, [atOpen, atQuery, active?.cwd, project]);

  const activePlanEntries = useMemo(() => {
    if (!active) return [];
    const plans = active.lines.filter((l) => l.role === 'plan' && l.planEntries?.length);
    const last = plans[plans.length - 1];
    return last?.planEntries ?? [];
  }, [active]);

  const cancelTurn = async () => {
    if (!active?.client || !active.sessionId) return;
    await active.client.cancel(active.sessionId);
    patchThread(active.id, { busy: false });
    appendLine(active.id, { id: nid(), role: 'system', text: t('stop') });
  };

  /** Run a Goal console action through the native ACP bridge. */
  const runGoalCommand = async (
    sub: 'status' | 'pause' | 'resume' | 'clear',
  ) => {
    if (!active) return;
    const g = active.sessionGoal;
    if (sub === 'clear') {
      if (!confirm(t('goalClearConfirm'))) return;
      patchThread(active.id, { sessionGoal: null });
    } else if (sub === 'pause' && g) {
      patchThread(active.id, {
        sessionGoal: { ...g, status: 'paused', updatedAt: Date.now() },
      });
    } else if (sub === 'resume' && g) {
      patchThread(active.id, {
        sessionGoal: { ...g, status: 'active', updatedAt: Date.now() },
      });
    }
    if (!active.client || !active.sessionId) {
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text: t('goalNoSession'),
      });
      return;
    }
    const label = sub === 'status'
      ? t('goalStatusBtn')
      : sub === 'pause'
        ? t('goalPause')
        : sub === 'resume'
          ? t('goalResume')
          : t('goalClear');
    await runNativeDesktopAction(
      label,
      (agent) => agent.client!.runDesktopCommand(agent.sessionId!, 'goal', sub),
      `/goal ${sub}`,
    );
  };

  /** Plan gate: leave plan mode → agent mode, then prompt to implement selected steps. */
  const applyPlan = async () => {
    if (!active?.client || !active.sessionId || active.busy) return;
    const planLines = active.lines.filter((l) => l.role === 'plan');
    const last = planLines[planLines.length - 1];
    if (!last) {
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text: t('applyPlanNoPlan'),
      });
      // Keep plan mode so user can ask the agent to produce a plan
      if (active.chatMode !== 'plan') {
        void changeChatMode('plan');
      }
      setReviewOpen(true);
      return;
    }
    const checked =
      last.planEntries?.filter((e) => e.checked).map((e) => e.text) ?? [];
    const allSteps = last.planEntries?.map((e) => e.text) ?? [];
    // Prefer checked steps; if none checked, use full plan text / all steps
    let planBody: string;
    let stepCount: number;
    if (checked.length > 0) {
      planBody = checked.map((text, i) => `${i + 1}. ${text}`).join('\n');
      stepCount = checked.length;
    } else if (allSteps.length > 0) {
      planBody = allSteps.map((text, i) => `${i + 1}. ${text}`).join('\n');
      stepCount = allSteps.length;
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text: t('applyPlanUseAllSteps'),
      });
    } else {
      planBody = (last.text || '').trim();
      stepCount = planBody ? 1 : 0;
    }
    if (!planBody) {
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text: t('applyPlanEmpty'),
      });
      return;
    }
    const prevMode = active.chatMode ?? 'plan';
    patchThread(active.id, { busy: true, error: null, chatMode: 'agent' });
    setReviewOpen(true);
    try {
      try {
        await active.client.setMode(active.sessionId, 'default');
      } catch {
        try {
          await active.client.setMode(active.sessionId, 'agent');
        } catch (e) {
          // Continue anyway — still send implement prompt
          appendLine(active.id, {
            id: nid(),
            role: 'system',
            text: `${t('applyPlanModeWarn')}: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text: t('applyPlanApproved').replace('{n}', String(stepCount)),
      });
      const body = `${t('applyPlanPrompt')}\n\n--- plan ---\n${planBody}`;
      appendLine(active.id, { id: nid(), role: 'user', text: body });
      const result = await active.client.prompt(active.sessionId, body);
      // Success path: leave plan UI state clean for agent work
      setChatMode('agent');
      setCapabilityArm(null);
      setDraft((d) => (d.trim().startsWith('/plan') ? '' : d));
      patchThread(active.id, { chatMode: 'agent' });
      if (result?.stopReason && result.stopReason !== 'end_turn') {
        appendLine(active.id, {
          id: nid(),
          role: 'system',
          text: t('applyPlanStop').replace('{reason}', String(result.stopReason)),
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      patchThread(active.id, {
        error: msg,
        chatMode: prevMode === 'plan' ? 'plan' : 'agent',
      });
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text: `${t('applyPlanFail')}: ${msg}`,
      });
      // Stay useful: offer re-enter plan mode so user can edit steps and retry
      try {
        if (active.sessionId && active.client) {
          await active.client.setMode(active.sessionId, 'plan');
          patchThread(active.id, { chatMode: 'plan' });
          setChatMode('plan');
        }
      } catch {
        /* */
      }
    } finally {
      patchThread(active.id, { busy: false });
    }
  };

  const togglePlanEntry = (lineId: string, entryId: string) => {
    if (!active) return;
    setThreads((prev) =>
      prev.map((th) => {
        if (th.id !== active.id) return th;
        return {
          ...th,
          lines: th.lines.map((l) => {
            if (l.id !== lineId || !l.planEntries) return l;
            return {
              ...l,
              planEntries: l.planEntries.map((e) =>
                e.id === entryId ? { ...e, checked: !e.checked } : e,
              ),
            };
          }),
        };
      }),
    );
  };

  const toggleAllPlanEntries = (lineId: string, checked: boolean) => {
    if (!active) return;
    setThreads((prev) =>
      prev.map((th) => {
        if (th.id !== active.id) return th;
        return {
          ...th,
          lines: th.lines.map((l) => {
            if (l.id !== lineId || !l.planEntries) return l;
            return {
              ...l,
              planEntries: l.planEntries.map((e) => ({ ...e, checked })),
            };
          }),
        };
      }),
    );
  };

  const changeModel = async (next: string) => {
    if (!next) return;
    // Prefer active live session; else any live thread
    const target =
      active?.client && active.sessionId
        ? active
        : threads.find((th) => th.client && th.sessionId) ?? null;
    if (!target?.client || !target.sessionId || !next) {
      setModelId(next);
      try {
        localStorage.setItem('gorkx.modelId', next);
      } catch {
        /* */
      }
      if (active) patchThread(active.id, { modelId: next });
      return;
    }
    try {
      await target.client.setModel(target.sessionId, next);
      setModelId(next);
      try {
        localStorage.setItem('gorkx.modelId', next);
      } catch {
        /* */
      }
      patchThread(target.id, { modelId: next });
      appendLine(target.id, {
        id: nid(),
        role: 'system',
        text: `model → ${next}`,
      });
    } catch (e) {
      appendLine(target.id, {
        id: nid(),
        role: 'system',
        text: `set model failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  /**
   * Effort is a spawn-time CLI flag. Changing it for the active thread restarts
   * the agent process and session/load so the new effort applies immediately.
   */
  const changeEffort = async (next: ReasoningEffort) => {
    setEffort(next);
    if (!active?.sessionId || !active.client) {
      return;
    }
    if (active.effort === next) return;
    if (active.busy) {
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text: `effort → ${next} queued after current turn (preference saved)`,
      });
      return;
    }
    const threadId = active.id;
    const sid = active.sessionId;
    const cwd = active.cwd;
    const mode = active.chatMode;
    patchThread(threadId, { busy: true });
    appendLine(threadId, {
      id: nid(),
      role: 'system',
      text: `restarting agent with effort:${next}…`,
    });
    try {
      await active.client.stop();
      const rules = splitPermissionRules(sanitizePermissionRules(active.permissionRules));
      const client = await AcpClient.start(
        perm,
        grokCmd || undefined,
        next,
        cwd || project || undefined,
        webSearchEnabled,
        maxAgentTurns,
        active.memoryEnabled !== false,
        active.subagentsEnabled !== false,
        active.planningEnabled !== false,
        sanitizeTaskToolLimits(active.disallowedTools),
        rules.allow,
        rules.deny,
      );
      await client.initialize();
      await client.authenticate('cached_token');
      wireClient(threadId, client);
      await client.loadSession(sid, cwd);
      void reconcileRunningSubagents(threadId, client, sid);
      if (mode === 'plan') {
        try {
          await client.setMode(sid, 'plan');
        } catch {
          /* ignore */
        }
      }
      if (modelId) {
        try {
          await client.setModel(sid, modelId);
        } catch {
          /* ignore */
        }
      }
      patchThread(threadId, { client, effort: next, busy: false });
      appendLine(threadId, {
        id: nid(),
        role: 'system',
        text: `effort active → ${next}`,
      });
    } catch (e) {
      patchThread(threadId, {
        busy: false,
        client: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /** Real delete: stop agent, delete Grok session file if any, drop local index. */
  const deleteThread = async (id: string) => {
    const th = threads.find((x) => x.id === id);
    if (th?.client) {
      try {
        await th.client.stop();
      } catch {
        /* */
      }
    }
    if (th?.sessionId) {
      let client: AcpClient | null = null;
      try {
        client = await bootstrapClient(th.cwd || project || undefined);
        await client.deleteSession(th.sessionId);
      } catch {
        // The confirmation says permanent delete. Keep both the local task
        // and its kernel session when the real deletion did not succeed.
        patchThread(id, {
          error: t('deleteThreadFailed'),
          busy: false,
        });
        alert(t('deleteThreadFailed'));
        return;
      } finally {
        await client?.stop();
      }
      dismissSession(th.sessionId);
    }
    if (th) void removeThreadMeta(th.projectKey || scopeKey, id);
    setThreads((p) => p.filter((x) => x.id !== id));
    if (activeId === id) selectThread(null);
  };

  /** Archive: hide in gorkX only — keeps Grok session files. */
  const archiveThread = async (id: string) => {
    const th = threads.find((x) => x.id === id);
    if (!th) return;
    if (th.client) await th.client.stop();
    const next = { ...th, client: null, busy: false, archived: true };
    persistThread(next);
    setThreads((p) => p.filter((x) => x.id !== id));
    if (activeId === id) selectThread(null);
  };

  /** Restore archived task back into the sidebar list (not "import kernel"). */
  const restoreArchivedTask = async (row: ArchivedTaskRow) => {
    const scope = projectScopeKey(row.projectKey);
    const metas = await loadThreadMetas(scope);
    const m = metas.find((x) => x.id === row.id);
    if (!m) return;
    const restored = { ...m, archived: false, updatedAt: Date.now() };
    await upsertThreadMeta(scope, restored);
    const snaps = await loadChatSnapshot(scope, restored.id);
    const stub = metaToStub({ ...restored, project: scope }, snapToLines(snaps));
    setThreads((p) => {
      if (p.some((x) => x.id === stub.id)) {
        return p.map((x) => (x.id === stub.id ? { ...x, archived: false } : x));
      }
      return [stub, ...p];
    });
  };

  const reconnectThread = async (id: string): Promise<AcpClient | null> => {
    const th = threadsRef.current.find((x) => x.id === id);
    if (!th?.sessionId || th.busy) return th?.client ?? null;
    if (th.client) return th.client;
    patchThread(id, { busy: true, error: null });
    try {
      const rules = splitPermissionRules(sanitizePermissionRules(th.permissionRules));
      const client = await AcpClient.start(
        perm,
        grokCmd || undefined,
        th.effort || effort,
        th.cwd || project || undefined,
        webSearchEnabled,
        maxAgentTurns,
        th.memoryEnabled !== false,
        th.subagentsEnabled !== false,
        th.planningEnabled !== false,
        sanitizeTaskToolLimits(th.disallowedTools),
        rules.allow,
        rules.deny,
      );
      await client.initialize();
      await client.authenticate('cached_token');
      wireClient(id, client);
      await client.loadSession(th.sessionId, th.cwd || project);
      void reconcileRunningSubagents(id, client, th.sessionId);
      if (th.chatMode === 'plan') {
        try {
          await client.setMode(th.sessionId, 'plan');
        } catch {
          /* ignore */
        }
      }
      if (th.modelId || modelId) {
        try {
          await client.setModel(th.sessionId, th.modelId || modelId);
        } catch {
          /* ignore */
        }
      }
      // Sync ref immediately so send() can use client before next render
      threadsRef.current = threadsRef.current.map((x) =>
        x.id === id ? { ...x, client, busy: false, error: null, searchScopeAvailable: client.supportsSearchToolOverrides } : x,
      );
      patchThread(id, { client, busy: false, error: null, searchScopeAvailable: client.supportsSearchToolOverrides });
      autoReconnectTried.current.delete(id);
      return client;
    } catch (e) {
      patchThread(id, {
        busy: false,
        client: null,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  };
  reconnectRef.current = reconnectThread;

  /** Re-authenticate in the browser, then reconnect without re-sending work. */
  const reauthenticateTask = async (id: string) => {
    setTaskReauthBusy(true);
    try {
      const result = await startLoginFlow();
      if (result.account) setAccount(result.account);
      if (!result.ok) {
        if (result.note) setAccountError(result.note);
        return;
      }
      setAccountError(null);
      refreshStatus();
      await refreshAccount();

      // Do not reuse a process started with the expired session.  Suppress its
      // normal one-shot reconnect while we intentionally replace it.
      const thread = threadsRef.current.find((item) => item.id === id);
      autoReconnectTried.current.add(id);
      await thread?.client?.stop().catch(() => undefined);
      patchThread(id, { client: null, busy: false, error: null });
      await reconnectThread(id);
      setTaskErrorOpen(false);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : String(error));
    } finally {
      setTaskReauthBusy(false);
    }
  };

  /** Preview, confirm, and apply Grok Build's real corrupted-history repair. */
  const repairBrokenSession = async (id: string) => {
    if (sessionRepairBusyId) return;
    const initial = threadsRef.current.find((item) => item.id === id);
    if (!initial?.sessionId || !isRepairableSessionError(initial.error || '')) return;
    setSessionRepairBusyId(id);
    try {
      const client = initial.client ?? await reconnectThread(id);
      const sessionId = initial.sessionId;
      if (!client) throw new Error('The task is not connected');
      const preview = await client.repairSession(sessionId, true);
      if (!preview.repaired) {
        appendLine(id, { id: nid(), role: 'system', text: t('sessionRepairNoop') });
        return;
      }
      const summary = [
        `${t('sessionRepairDuplicates')}: ${preview.duplicatesRemoved}`,
        `${t('sessionRepairStripped')}: ${preview.strippedToolResultIds.length}`,
        `${t('sessionRepairSynthetic')}: ${preview.syntheticResultsInserted}`,
      ].join(' · ');
      if (!confirm(`${t('sessionRepairConfirm')}\n\n${summary}`)) return;
      const result = await client.repairSession(sessionId, false);
      if (!result.repaired) {
        appendLine(id, { id: nid(), role: 'system', text: t('sessionRepairNoop') });
        return;
      }
      appendLine(id, { id: nid(), role: 'system', text: `${t('sessionRepairDone')} · ${summary}` });
      patchThread(id, { error: null, busy: false });
      setTaskErrorOpen(false);
    } catch (error) {
      appendLine(id, {
        id: nid(),
        role: 'system',
        text: `${t('sessionRepairFailed')}: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setSessionRepairBusyId(null);
    }
  };

  const answerPermission = async (prefer: 'allow' | 'reject' | string) => {
    if (!activeApproval || activeApproval.kind !== 'permission') return;
    try {
      const th = threadsRef.current.find((x) => x.id === activeApproval.threadId);
      if (
        !canAnswerApproval({
          approvalThreadId: activeApproval.threadId,
          targetThreadId: th?.id ?? '',
          hasClient: Boolean(th?.client),
        })
      ) {
        throw new Error(t('approvalInboxUnavailable'));
      }
      const optionId =
        prefer === 'allow' || prefer === 'reject'
          ? pickPermissionOption(activeApproval.request.options, prefer)
          : prefer;
      await th!.client!.respond(activeApproval.request.jsonrpcId, permissionResult(optionId));
      removeApproval(activeApproval.key);
    } catch {
      appendLine(activeApproval.threadId, { id: nid(), role: 'system', text: t('approvalInboxAnswerFailed') });
    }
  };

  const answerUserQuestion = async (
    result:
      | ReturnType<typeof userQuestionAcceptedResult>
      | ReturnType<typeof userQuestionCancelledResult>
      | ReturnType<typeof userQuestionPlanResult>,
  ) => {
    if (!activeApproval || activeApproval.kind !== 'question') return;
    try {
      const thread = threadsRef.current.find((item) => item.id === activeApproval.threadId);
      if (
        !canAnswerApproval({
          approvalThreadId: activeApproval.threadId,
          targetThreadId: thread?.id ?? '',
          hasClient: Boolean(thread?.client),
        })
      ) {
        throw new Error(t('approvalInboxUnavailable'));
      }
      await thread!.client!.respond(activeApproval.request.jsonrpcId, result);
      removeApproval(activeApproval.key);
    } catch {
      appendLine(activeApproval.threadId, { id: nid(), role: 'system', text: t('approvalInboxAnswerFailed') });
    }
  };

  const answerPlanApproval = async (
    outcome: 'approved' | 'cancelled' | 'abandoned',
    feedback?: string,
  ) => {
    if (!activeApproval || activeApproval.kind !== 'plan') return;
    try {
      const thread = threadsRef.current.find((item) => item.id === activeApproval.threadId);
      if (
        !canAnswerApproval({
          approvalThreadId: activeApproval.threadId,
          targetThreadId: thread?.id ?? '',
          hasClient: Boolean(thread?.client),
        })
      ) {
        throw new Error(t('approvalInboxUnavailable'));
      }
      await thread!.client!.respond(activeApproval.request.jsonrpcId, planApprovalResult(outcome, feedback));
      removeApproval(activeApproval.key);
    } catch {
      appendLine(activeApproval.threadId, { id: nid(), role: 'system', text: t('approvalInboxAnswerFailed') });
    }
  };

  const answerFolderTrust = async (outcome: 'trust' | 'reject') => {
    if (!activeApproval || activeApproval.kind !== 'trust') return;
    try {
      const thread = threadsRef.current.find((item) => item.id === activeApproval.threadId);
      if (
        !canAnswerApproval({
          approvalThreadId: activeApproval.threadId,
          targetThreadId: thread?.id ?? '',
          hasClient: Boolean(thread?.client),
        })
      ) {
        throw new Error(t('approvalInboxUnavailable'));
      }
      await thread!.client!.respond(activeApproval.request.jsonrpcId, folderTrustResult(outcome));
      removeApproval(activeApproval.key);
    } catch {
      appendLine(activeApproval.threadId, { id: nid(), role: 'system', text: t('approvalInboxAnswerFailed') });
    }
  };

  // Close composer popovers on outside click / Escape
  useEffect(() => {
    if (!ctxPopOpen && !modelPopOpen && !permPopOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.('.ctx-ring-wrap')) setCtxPopOpen(false);
      if (!t?.closest?.('.composer-model-wrap')) setModelPopOpen(false);
      if (!t?.closest?.('.composer-perm-wrap')) setPermPopOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCtxPopOpen(false);
        setModelPopOpen(false);
        setPermPopOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctxPopOpen, modelPopOpen, permPopOpen]);

  useEffect(() => {
    setCtxPopOpen(false);
    setModelPopOpen(false);
    setPermPopOpen(false);
  }, [activeId]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('.account-menu-wrap');
      if (!el) setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!projectMenuPath && !addProjectMenuOpen && !plusMenuOpen && !projectPickerOpen)
      return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('.project-pop-menu') || t?.closest?.('.thread-menu-btn')) return;
      if (t?.closest?.('.add-project-wrap')) return;
      if (t?.closest?.('.plus-wrap')) return;
      if (t?.closest?.('.home-project-wrap') || t?.closest?.('.project-picker-menu')) return;
      setProjectMenuPath(null);
      setAddProjectMenuOpen(false);
      setPlusMenuOpen(false);
      setProjectPickerOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [projectMenuPath, addProjectMenuOpen, plusMenuOpen, projectPickerOpen]);

  const accountAuthenticated = account?.authenticated === true;

  return (
    <div
      className={`shell${reviewOpen ? ' with-review' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
    >
      {/* Codex titlebar: traffic lights · sidebar · back/forward …… process · review · terminal */}
      <div
        className="app-chrome"
        data-tauri-drag-region
        onMouseDown={(e) => {
          // Overlay titlebar: must call startDragging (permission: core:window:allow-start-dragging)
          if (e.button !== 0) return;
          const el = e.target as HTMLElement;
          if (el.closest('button, a, input, select, textarea, [data-no-drag]')) return;
          void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
            getCurrentWindow().startDragging(),
          );
        }}
      >
        <div className="chrome-left chrome-cluster" data-no-drag>
          <button
            type="button"
            className="chrome-btn"
            title={sidebarCollapsed ? t('sidebarExpand') : t('sidebarCollapse')}
            aria-label={sidebarCollapsed ? t('sidebarExpand') : t('sidebarCollapse')}
            aria-expanded={!sidebarCollapsed}
            onClick={() => {
              setSidebarCollapsed((v) => {
                const next = !v;
                localStorage.setItem('gorkx.sidebarCollapsed', next ? '1' : '0');
                return next;
              });
            }}
          >
            <IconSidebar open={!sidebarCollapsed} />
          </button>
          <span className="chrome-sep" aria-hidden />
          <button
            type="button"
            className="chrome-btn"
            title={t('navBackHint')}
            aria-label={t('navBack')}
            disabled={!canNavBack}
            onClick={navBack}
          >
            <IconBack />
          </button>
          <button
            type="button"
            className="chrome-btn"
            title={t('navForwardHint')}
            aria-label={t('navForward')}
            disabled={!canNavForward}
            onClick={navForward}
          >
            <IconForward />
          </button>
        </div>
        <div className="chrome-right chrome-cluster" data-no-drag data-tauri-drag-region="false">
          <button
            type="button"
            className={processOpen ? 'chrome-btn on' : 'chrome-btn'}
            title={t('processHint')}
            aria-label={t('processTitle')}
            onClick={() => {
              setProcessOpen((v) => {
                const next = !v;
                localStorage.setItem('gorkx.processOpen', next ? '1' : '0');
                return next;
              });
            }}
          >
            <IconProcess />
          </button>
          <button
            type="button"
            className={reviewOpen ? 'chrome-btn on' : 'chrome-btn'}
            title={t('reviewTitle')}
            aria-label={t('reviewToggle')}
            onClick={() => setReviewOpen((v) => !v)}
          >
            <IconReview />
            {activeTools.length + activePlanEntries.length > 0 ? (
              <span className="icon-badge">
                {Math.min(99, activeTools.length + activePlanEntries.length)}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={terminalOpen ? 'chrome-btn on' : 'chrome-btn'}
            title={t('terminalTitle')}
            aria-label={t('terminalToggle')}
            onClick={() => setTerminalOpen((v) => !v)}
          >
            <IconTerminal />
          </button>
        </div>
      </div>

      <AppBanners
        status={status}
        update={appUpdateBanner}
        onOpenSettings={() => setKernelOpen(true)}
        onRefreshEngine={refreshStatus}
        onInstallUpdate={() => {
          void (async () => {
            if (!appUpdateBanner) return;
            const result = await installAppUpdate(appUpdateBanner);
            if (result.ok) setAppUpdateBanner(null);
          })();
        }}
        onDismissUpdate={() => setAppUpdateBanner(null)}
      />

      {/* Codex-style sidebar — fully hidden when collapsed; toggle is in app-chrome */}
      <aside className="sidebar">
        <div className="brand">
          <div className="logo" title={t('appName')}>
            <img src="/gorkx-icon.png" alt="" className="logo-img" draggable={false} />
          </div>
          <div className="brand-text">
            <div className="brand-name">{t('appName')}</div>
            <div className="brand-sub">{t('tagline')}</div>
          </div>
        </div>

        <SidebarNav
          extensionsOpen={extOpen}
          scheduledOpen={scheduledOpen}
          memoryOpen={memoryOpen}
          onNewTask={() => {
            selectThread(null);
            setDraft('');
            setComposerAtts([]);
            setSlashOpen(false);
            setCapabilityArm(null);
            setPlusMenuOpen(false);
          }}
          onOpenExtensions={() => setExtOpen(true)}
          onOpenScheduled={() => setScheduledOpen(true)}
          onOpenMemory={() => setMemoryOpen(true)}
        />

        {/* Lists hidden when collapsed — must expand to pick projects */}
        <div className="sidebar-lists">
        <div className="nav-divider" />

        {/* Codex-style: 项目 (folder-based) + 任务 (no project) */}
        <section className="block grow">
          {/* ── 项目 ── */}
          <div className="block-head">
            <span className="block-title">{t('projectsSection')}</span>
            <div className="add-project-wrap">
              <button
                type="button"
                className="btn btn-sm"
                title={t('addProject')}
                onClick={(e) => {
                  e.stopPropagation();
                  setAddProjectMenuOpen((v) => !v);
                  setProjectMenuPath(null);
                }}
              >
                <IconPlus size={14} />
              </button>
              {addProjectMenuOpen ? (
                <div className="pop-menu project-pop-menu" role="menu" style={{ right: 0, left: 'auto' }}>
                  <button
                    type="button"
                    className="pop-menu-item"
                    onClick={() => {
                      setAddProjectMenuOpen(false);
                      void createProjectByName();
                    }}
                  >
                    <IconPlus size={14} /> {t('createProjectByName')}
                  </button>
                  <button
                    type="button"
                    className="pop-menu-item"
                    onClick={() => {
                      setAddProjectMenuOpen(false);
                      void pickProject();
                    }}
                  >
                    <IconOpenFolder size={14} /> {t('openProjectFolder')}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="sidebar-task-filter" style={{ padding: '0 10px 8px' }}>
            <label className="sr-only" htmlFor="task-filter-input">
              {t('taskSearchPlaceholder')}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="btn btn-sm"
                title={t('taskSearchAll')}
                aria-label={t('taskSearchAll')}
                onClick={() => setTaskSearchOpen(true)}
                style={{ padding: 3, minWidth: 24 }}
              >
                <IconSearch size={14} />
              </button>
              <input
                id="task-filter-input"
                type="search"
                value={taskFilter}
                onChange={(e) => setTaskFilter(e.target.value)}
                placeholder={t('taskSearchPlaceholder')}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--hairline)',
                  background: 'var(--bg-elevated, transparent)',
                }}
              />
            </div>
          </div>

          {/* Stage B: cross-task run center — only non-idle ACP-backed tasks */}
          <div className="block-head run-center-head" style={{ marginTop: 4 }}>
            <span className="block-title">{t('runCenterTitle')}</span>
            {runCenterRows.length ? (
              <span className="run-center-count">{runCenterRows.length}</span>
            ) : null}
          </div>
          <div className="run-center-wrap">
            <RunCenterPanel
              rows={runCenterRows}
              activeId={activeId}
              onSelect={focusThreadFromRunCenter}
            />
          </div>

          {(() => {
            const q = taskFilter.trim().toLowerCase();
            const matchTitle = (title: string) =>
              !q || title.toLowerCase().includes(q);
            const projectList = orderedProjects(project, recentProjects, pinnedProjects);
            if (projectList.length === 0) {
              return (
                <div className="hint">
                  {t('noProjectsYet')}
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ marginTop: 8, display: 'block' }}
                    onClick={() => void pickProject()}
                  >
                    {t('openProjectFolder')}
                  </button>
                </div>
              );
            }
            return projectList.map((p) => {
              const name = projectDisplayName(p, projectAliases);
              const selected = p === project;
              const pinned = pinnedProjects.includes(p);
              const liveAll = threadsForScope(threads, projectScopeKey(p));
              const live = liveAll.filter((th) => matchTitle(threadListLabel(th, liveAll, t('newThread'))));
              const remoteAll =
                selected && showGrokHistory
                  ? (projectSessions[p] || []).filter(
                      (s) => !liveAll.some((th) => th.sessionId === s.sessionId),
                    )
                  : [];
              const remote = remoteAll.filter((s) => {
                const raw = (s.title || '').trim();
                return matchTitle(raw || t('inboxChat'));
              });
              // When filtering, hide project groups with no matching tasks
              if (q && live.length === 0 && remote.length === 0 && !matchTitle(name)) {
                return null;
              }
              return (
                <div key={p} className="proj-group">
                  {/* Anchor ··· menu to the project row only (not whole group incl. threads) */}
                  <div className="project-row-anchor">
                    <div className={selected ? 'thread on project-row' : 'thread project-row'}>
                      <button
                        type="button"
                        className="thread-main"
                        title={p}
                        onClick={() => {
                          setProject(p);
                          setProjectMenuPath(null);
                        }}
                      >
                        <span className="thread-title">
                          <span className="proj-folder-ico" aria-hidden>
                            {pinned ? <IconFolderPinned size={14} /> : <IconFolder size={14} />}
                          </span>
                          {name}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="thread-x thread-menu-btn"
                        title={t('projectMenu')}
                        aria-label={t('projectMenu')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddProjectMenuOpen(false);
                          setProjectMenuPath((cur) => (cur === p ? null : p));
                        }}
                      >
                        <IconMore size={14} />
                      </button>
                    </div>
                    {projectMenuPath === p ? (
                      <div className="pop-menu project-pop-menu" role="menu">
                        <button
                          type="button"
                          className="pop-menu-item"
                          onClick={() => {
                            setPinnedProjects(togglePinProject(p));
                            setProjectMenuPath(null);
                          }}
                        >
                          <IconPin size={14} /> {pinned ? t('unpinProject') : t('pinProject')}
                        </button>
                        <button
                          type="button"
                          className="pop-menu-item"
                          onClick={() => {
                            void revealInFinder(p).catch(() => {});
                            setProjectMenuPath(null);
                          }}
                        >
                          <IconOpenFolder size={14} /> {t('revealFinder')}
                        </button>
                        <button
                          type="button"
                          className="pop-menu-item"
                          onClick={() => {
                            setProject(p);
                            setProjectMenuPath(null);
                            void createThread({ worktree: true });
                          }}
                        >
                          <IconWorktree size={14} /> {t('createWorktreeMenu')}
                        </button>
                        <button
                          type="button"
                          className="pop-menu-item"
                          onClick={() => {
                            setProject(p);
                            setProjectMenuPath(null);
                            setWorktreePanelOpen(true);
                          }}
                        >
                          <IconWorktree size={14} /> {t('worktreeManage')}
                        </button>
                        <button
                          type="button"
                          className="pop-menu-item"
                          onClick={() => {
                            setProjectMenuPath(null);
                            setProjectInspectPath(p);
                          }}
                        >
                          <IconSearch size={14} /> {t('inspectProject')}
                        </button>
                        <button
                          type="button"
                          className="pop-menu-item"
                          onClick={() => {
                            setProjectMenuPath(null);
                            void renameProjectOnDisk(p);
                          }}
                        >
                          <IconRename size={14} /> {t('renameProject')}
                        </button>
                        <button
                          type="button"
                          className="pop-menu-item"
                          onClick={() => {
                            if (confirm(t('archiveProjectTasksConfirm'))) {
                              void archiveProjectTasks(p);
                            }
                            setProjectMenuPath(null);
                          }}
                        >
                          <IconArchive size={14} /> {t('archiveProjectTasks')}
                        </button>
                        <button
                          type="button"
                          className="pop-menu-item danger"
                          onClick={() => {
                            if (confirm(t('removeProjectConfirm'))) removeProjectFromApp(p);
                            setProjectMenuPath(null);
                          }}
                        >
                          <IconClose size={14} /> {t('removeProjectMenu')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="proj-threads">
                      {live.map((th) => {
                        const info = threadRunInfo(th);
                        return (
                        <ThreadListRow
                          key={th.id}
                          thread={{
                            ...th,
                            runPhase: info.phase,
                            runStep: info.step,
                            runStalled: info.stalled,
                          }}
                          siblings={live}
                          activeId={activeId}
                          onSelect={() => {
                            if (!selected) setProject(p);
                            selectThread(th.id);
                          }}
                          onRename={() => void renameThread(th.id)}
                          onArchive={() => {
                            if (confirm(t('archiveThreadConfirm'))) void archiveThread(th.id);
                          }}
                          onDelete={() => {
                            if (confirm(t('deleteThreadConfirm'))) void deleteThread(th.id);
                          }}
                        />
                        );
                      })}
                      {live.length === 0 && remote.length === 0 ? (
                        <div className="hint">
                          {q ? t('taskSearchEmpty') : t('noProjectTasks')}
                        </div>
                      ) : null}
                      {remote.map((s) => {
                        const raw = (s.title || '').trim();
                        const looksId = !raw || /^[0-9a-f-]{8,}$/i.test(raw);
                        let label = looksId
                          ? t('inboxChat')
                          : titleFromUserText(raw) || raw.slice(0, 28);
                        // Disambiguate same-title kernel history rows
                        const sameTitleCount = remote.filter((o) => {
                          const r = (o.title || '').trim();
                          const lid = !r || /^[0-9a-f-]{8,}$/i.test(r);
                          const l = lid
                            ? t('inboxChat')
                            : titleFromUserText(r) || r.slice(0, 28);
                          return l.toLowerCase() === label.toLowerCase();
                        }).length;
                        if (sameTitleCount > 1 && s.lastChangeUnixMs) {
                          const clock = formatThreadClock(s.lastChangeUnixMs);
                          if (clock) label = `${label} · ${clock}`;
                        }
                        return (
                          <div key={s.sessionId} className="thread project-row">
                            <button
                              type="button"
                              className="thread-main"
                              title={s.sessionId}
                              onClick={() =>
                                void resumeSession(s.sessionId, looksId ? label : raw)
                              }
                            >
                              <span className="thread-title">
                                <span className="proj-folder-ico" aria-hidden>
                                  <IconRemoteSession size={12} />
                                </span>
                                {label}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="thread-x"
                              title={t('archiveThread')}
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissSession(s.sessionId);
                              }}
                            >
                              <IconArchive size={14} />
                            </button>
                            <button
                              type="button"
                              className="thread-x"
                              title={t('deleteThread')}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(t('deleteThreadConfirm'))) {
                                  void hardDeleteGrokSession(s.sessionId);
                                }
                              }}
                            >
                              <IconClose size={14} />
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            });
          })()}

          {/* ── 任务（无项目会话，对齐 Codex） ── */}
          <div className="block-head" style={{ marginTop: 14 }}>
            <span className="block-title">{t('tasksSection')}</span>
          </div>
          <div className="task-list">
            {(() => {
              const q = taskFilter.trim().toLowerCase();
              const inboxAll = threadsForScope(threads, NO_PROJECT_KEY);
              const inbox = inboxAll.filter(
                (th) => !q || threadListLabel(th, inboxAll, t('newThread')).toLowerCase().includes(q),
              );
              return inbox.map((th) => {
                const info = threadRunInfo(th);
                return (
                <ThreadListRow
                  key={th.id}
                  thread={{
                    ...th,
                    runPhase: info.phase,
                    runStep: info.step,
                    runStalled: info.stalled,
                  }}
                  siblings={inboxAll}
                  activeId={activeId}
                  onSelect={() => {
                    setProject('');
                    selectThread(th.id);
                  }}
                  onRename={() => void renameThread(th.id)}
                  onArchive={() => {
                    if (confirm(t('archiveThreadConfirm'))) void archiveThread(th.id);
                  }}
                  onDelete={() => {
                    if (confirm(t('deleteThreadConfirm'))) void deleteThread(th.id);
                  }}
                />
                );
              });
            })()}
            {(() => {
              const q = taskFilter.trim().toLowerCase();
              const inboxAll = threadsForScope(threads, NO_PROJECT_KEY);
              const count = inboxAll.filter(
                (th) => !q || threadListLabel(th, inboxAll, t('newThread')).toLowerCase().includes(q),
              ).length;
              if (count > 0) return null;
              return (
                <div className="hint">{q ? t('taskSearchEmpty') : t('noTasksYet')}</div>
              );
            })()}
          </div>
        </section>
        </div>

        <footer className="status">
          <div className="account-menu-wrap">
            <button
              type="button"
              className="account-chip"
              title={accountAuthenticated ? account?.email || t('subBadgeFull') : t('statusNeedLogin')}
              onClick={() => {
                setAccountMenuOpen((v) => !v);
                void refreshAccount();
              }}
            >
              <AccountAvatar
                src={account?.avatarUrl}
                label={
                  accountAuthenticated
                    ? uiDisplayName(account, nameOverride) ||
                      account?.displayName ||
                      account?.email ||
                      '?'
                    : '?'
                }
                guest={!accountAuthenticated}
              />
              <span className="account-meta">
                <span className="account-name">
                  {!status?.installed
                    ? t('statusMissing')
                    : !accountAuthenticated
                      ? t('statusNeedLogin')
                      : (() => {
                          const name =
                            uiDisplayName(account, nameOverride) ||
                            t('subBadgeFull');
                          const plan = account?.membershipLabel?.trim();
                          return plan ? `${name}（${plan}）` : name;
                        })()}
                </span>
                <span className="account-quota">
                  {accountAuthenticated && account?.creditUsagePercent != null
                    ? `已用 ${Math.round(account.creditUsagePercent)}% · 剩 ${Math.max(0, Math.round(100 - account.creditUsagePercent))}%`
                    : accountAuthenticated
                      ? account?.quotaLabel?.replace(/\s*·\s*重置.*$/, '') || account?.membershipLabel || '—'
                      : '—'}
                </span>
              </span>
            </button>
            {accountMenuOpen ? (
              <div className="account-menu" role="menu">
                {accountAuthenticated ? (
                  <>
                    <div className="account-menu-head">
                      <AccountAvatar
                        src={account?.avatarUrl}
                        label={
                          uiDisplayName(account, nameOverride) ||
                          account?.displayName ||
                          account?.email ||
                          '?'
                        }
                      />
                      <div className="account-meta">
                        <div className="account-name">
                          {(() => {
                            const name =
                              uiDisplayName(account, nameOverride) ||
                              t('subBadgeFull');
                            const plan = account?.membershipLabel?.trim();
                            return plan ? `${name}（${plan}）` : name;
                          })()}
                        </div>
                        <div className="account-quota">
                          {account?.email || account?.membershipLabel || t('subBadgeFull')}
                          {account?.displayName &&
                          nameOverride &&
                          nameOverride !== account.displayName ? (
                            <span className="muted"> · {account.displayName}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {nameEditOpen ? (
                      <div className="account-menu-name-edit">
                        <input
                          className="account-name-input"
                          value={nameDraft}
                          autoFocus
                          maxLength={40}
                          placeholder={account?.displayName || t('displayNamePlaceholder')}
                          onChange={(e) => setNameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const next = nameDraft.trim();
                              saveDisplayNameOverride(next);
                              setNameOverride(next);
                              setNameEditOpen(false);
                            } else if (e.key === 'Escape') {
                              setNameEditOpen(false);
                            }
                          }}
                        />
                        <div className="account-name-edit-actions">
                          <button
                            type="button"
                            className="btn btn-sm primary-sm"
                            onClick={() => {
                              const next = nameDraft.trim();
                              saveDisplayNameOverride(next);
                              setNameOverride(next);
                              setNameEditOpen(false);
                            }}
                          >
                            {t('confirm')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => {
                              saveDisplayNameOverride('');
                              setNameOverride('');
                              setNameDraft('');
                              setNameEditOpen(false);
                            }}
                          >
                            {t('displayNameReset')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="account-menu-item"
                        onClick={() => {
                          setNameDraft(nameOverride || uiDisplayName(account) || '');
                          setNameEditOpen(true);
                        }}
                      >
                        {t('displayNameEdit')}
                      </button>
                    )}
                    <div className="account-menu-quota-block">
                      <div className="account-menu-quota-title">{t('remainingQuota')}</div>
                      <div className="account-menu-quota-line">
                        {account?.creditUsagePercent != null
                          ? `已用 ${Math.round(account.creditUsagePercent)}% · 剩 ${Math.max(0, Math.round(100 - account.creditUsagePercent))}%`
                          : account?.quotaLabel || accountError || t('accountQuotaUnavailable')}
                      </div>
                      {account?.periodEnd ? (
                        <div className="account-menu-quota-reset">
                          {t('quotaResetAt')} {formatPeriodEnd(account.periodEnd)}
                        </div>
                      ) : null}
                      {account?.productUsage?.length ? (
                        <div className="account-menu-quota-reset">
                          {account.productUsage
                            .map((p) =>
                              p.usagePercent != null
                                ? `${p.product} ${Math.round(p.usagePercent)}%`
                                : p.product,
                            )
                            .join(' · ')}
                        </div>
                      ) : null}
                      {accountError && account?.creditUsagePercent == null ? (
                        <div className="account-menu-quota-reset" title={accountError}>
                          {accountError.slice(0, 80)}
                        </div>
                      ) : null}
                    </div>
                    {account?.creditUsagePercent == null ? (
                      <button
                        type="button"
                        className="account-menu-item account-menu-item-primary"
                        onClick={() => void openUrlSafe('https://grok.com/imagine?_s=usage')}
                      >
                        {t('quotaOpenWebsite')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="account-menu-item"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setKernelOpen(true);
                      }}
                    >
                      {t('settings')}
                    </button>
                    <button
                      type="button"
                      className="account-menu-item"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        void (async () => {
                          try {
                            await logoutAccount();
                          } catch {
                            /* */
                          }
                          setAccount(null);
                          setAccountError(null);
                          refreshStatus();
                          void refreshAccount();
                        })();
                      }}
                    >
                      {t('logout')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="account-menu-item account-menu-item-primary"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      void (async () => {
                        try {
                          const result = await startLoginFlow();
                          if (result.account) setAccount(result.account);
                          if (result.ok) setAccountError(null);
                          else if (result.note) setAccountError(result.note);
                        } catch (e) {
                          setAccountError(e instanceof Error ? e.message : String(e));
                        }
                        refreshStatus();
                        void refreshAccount();
                      })();
                    }}
                  >
                    {t('subLogin')}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </footer>
      </aside>

      <main className="main">
        {!active ? (
          <div className="main-home">
            <div className="empty">
              <div className="empty-icon">
                <img src="/gorkx-icon.png" alt="" className="empty-icon-img" draggable={false} />
              </div>
              <h2>{t('emptyHello')}</h2>
              <p>{project ? t('emptyHelloSub') : t('emptyTasksSub')}</p>
              {(() => {
                const scope = project ? projectScopeKey(project) : NO_PROJECT_KEY;
                const scoped = threadsForScope(threads, scope);
                const recent = pickHomeRecentTasks(scoped, 5);
                if (!recent.length) return null;
                return (
                  <section className="home-recent" aria-label={t('homeRecentTitle')}>
                    <h3 className="home-recent-title">{t('homeRecentTitle')}</h3>
                    <ul className="home-recent-list">
                      {recent.map((th) => {
                        const label = threadListLabel(th, scoped, t('newThread'));
                        const clock = formatThreadClock(th.updatedAt);
                        return (
                          <li key={th.id}>
                            <button
                              type="button"
                              className="home-recent-item"
                              onClick={() => selectThread(th.id)}
                              title={label}
                            >
                              <span className="home-recent-label">{label}</span>
                              {clock ? <span className="home-recent-meta">{clock}</span> : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })()}
              <div className="starter-groups">
                {(
                  [
                    [
                      'starterOfficeTitle',
                      [
                        ['starterSummarize', 'starterSummarizeHint', 'starterSummarizePrompt'],
                        ['starterReport', 'starterReportHint', 'starterReportPrompt'],
                        ['starterMeeting', 'starterMeetingHint', 'starterMeetingPrompt'],
                        ['starterEmail', 'starterEmailHint', 'starterEmailPrompt'],
                        ['starterResearch', 'starterResearchHint', 'starterResearchPrompt'],
                        ['starterDecision', 'starterDecisionHint', 'starterDecisionPrompt'],
                        ['starterPlanWork', 'starterPlanWorkHint', 'starterPlanWorkPrompt'],
                      ],
                    ],
                    [
                      'starterCodeTitle',
                      [
                        ['starterExplore', 'starterExploreHint', 'starterExplorePrompt'],
                        ['starterBug', 'starterBugHint', 'starterBugPrompt'],
                        ['starterFeature', 'starterFeatureHint', 'starterFeaturePrompt'],
                        ['starterTest', 'starterTestHint', 'starterTestPrompt'],
                      ],
                    ],
                  ] as const
                ).map(([groupKey, cards]) => (
                  <section className="starter-section" key={groupKey} aria-label={t(groupKey)}>
                    <h3>{t(groupKey)}</h3>
                    <div className="starter-grid">
                      {cards.map(([titleKey, hintKey, promptKey]) => (
                        <button
                          key={titleKey}
                          type="button"
                          className="starter-card"
                          onClick={() => {
                            // Starter cards are guidance, not an implicit agent turn:
                            // let people tailor the brief and add files before they send.
                            if (titleKey === 'starterExplore') setNewTaskProfile('explore');
                            setDraft(t(promptKey));
                            setSlashOpen(false);
                            focusComposer();
                          }}
                        >
                          <strong>{t(titleKey)}</strong>
                          <span>{t(hintKey)}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
            <div className="composer-dock">
              <div className="composer-home-bar">
                <div className="home-project-wrap">
                  <button
                    type="button"
                    className="home-project-chip"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      setProjectPickerOpen((v) => !v);
                    }}
                    title={project || t('selectProject')}
                  >
                    📁{' '}
                    {project
                      ? projectDisplayName(project, projectAliases)
                      : t('projectPickerNoProject')}
                  </button>
                  <ProjectPicker
                    open={projectPickerOpen}
                    projects={[
                      ...pinnedProjects.filter((p) => recentProjects.includes(p) || true),
                      ...recentProjects.filter((p) => !pinnedProjects.includes(p)),
                    ].filter((p, i, arr) => arr.indexOf(p) === i)}
                    aliases={projectAliases}
                    current={project || undefined}
                    onClose={() => setProjectPickerOpen(false)}
                    onAction={(a) => void handleProjectPicker(a)}
                  />
                </div>
              </div>
              <div
                className={`composer${dragOver ? ' drag-over' : ''}`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) setDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const files = Array.from(e.dataTransfer.files || []);
                  const paths = files
                    .map((f) => (f as File & { path?: string }).path)
                    .filter((p): p is string => Boolean(p));
                  if (paths.length) void addAttachmentPaths(paths);
                }}
              >
                {composerAtts.length ? (
                  <AttachmentStrip
                    items={composerAtts}
                    onRemove={removeComposerAtt}
                    onOpen={setPreviewAtt}
                  />
                ) : null}
                {dragOver ? <div className="composer-drop-hint">{t('dropFilesHint')}</div> : null}
                {capabilityArm ? (
                  <div className="capability-arm">
                    <span>
                      {t('capabilityArmed').replace('{name}', capabilityArm.label)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        setCapabilityArm(null);
                        setDraft('');
                      }}
                    >
                      {t('capabilityClear')}
                    </button>
                  </div>
                ) : null}
              <SlashMenu
                open={slashOpen}
                items={slashMenuItems(draft)}
                activeIndex={slashIndex}
                sourceLabel={sourceLabel}
                onActiveIndex={setSlashIndex}
                onPick={applySlashPick}
              />
                <textarea
                  value={draft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft(v);
                    setPromptHistoryIndex(-1);
                    setSlashOpen(v.startsWith('/') && !v.includes('\n'));
                    if (
                      capabilityArm &&
                      !v.startsWith(capabilityArm.prefix) &&
                      !v.startsWith(`${capabilityArm.prefix} `)
                    ) {
                      setCapabilityArm(null);
                    }
                  }}
                  placeholder={
                    capabilityArm
                      ? t('capabilityPlaceholder').replace('{name}', capabilityArm.label)
                      : t('homeComposerPlaceholder')
                  }
                  rows={2}
                  onKeyDown={(e) => {
                    if (handleComposerMenuKeys(e)) return;
                    if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && activePromptHistory.length) {
                      if (e.key === 'ArrowUp' && !draft.trim()) {
                        e.preventDefault();
                        setDraft(activePromptHistory[0]);
                        setPromptHistoryIndex(0);
                        return;
                      }
                      if (e.key === 'ArrowUp' && promptHistoryIndex >= 0) {
                        e.preventDefault();
                        const next = Math.min(promptHistoryIndex + 1, activePromptHistory.length - 1);
                        setDraft(activePromptHistory[next]);
                        setPromptHistoryIndex(next);
                        return;
                      }
                      if (e.key === 'ArrowDown' && promptHistoryIndex >= 0) {
                        e.preventDefault();
                        const next = promptHistoryIndex - 1;
                        setPromptHistoryIndex(next);
                        setDraft(next >= 0 ? activePromptHistory[next] : '');
                        return;
                      }
                    }
                    if (e.key === 'Escape') {
                      if (capabilityArm) {
                        setCapabilityArm(null);
                        setDraft('');
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      setSlashOpen(false);
                      void send();
                    }
                  }}
                />
                <div className="composer-send-row">
                  <div className="composer-toolbar-left">
                    <div className="plus-wrap">
                      <button
                        type="button"
                        className="btn-icon"
                        title={t('plusMenu')}
                        onClick={() => setPlusMenuOpen((v) => !v)}
                      >
                        ＋
                      </button>
                      <PlusMenu
                        open={plusMenuOpen}
                        home
                        planModeOn={chatMode === 'plan'}
                        exploreModeOn={newTaskProfile === 'explore'}
                        taskMemoryEnabled={newTaskMemoryEnabled}
                        taskSubagentsEnabled={newTaskSubagentsEnabled}
                        taskPlanningEnabled={newTaskPlanningEnabled}
                        taskToolLimitCount={newTaskDisallowedTools.length}
                        taskPermissionRuleCount={newTaskPermissionRules.length}
                        skills={extSnap?.skills ?? []}
                        hasActiveSession={false}
                        hasImageAttachment={composerAtts.some((attachment) => attachment.kind === 'image')}
                        availableCommandNames={
                          // Only expose engine-owned actions after an actual session
                          // advertised them. A static fallback made image generation
                          // look available before the bundled engine/account confirmed it.
                          threads.find((th) => th.commands?.length)?.commands?.map((c) =>
                            c.name.replace(/^\//, ''),
                          )
                        }
                        onClose={() => setPlusMenuOpen(false)}
                        onAction={(a) => void handlePlusAction(a)}
                      />
                    </div>
                    {chatMode === 'plan' ? (
                      <button
                        type="button"
                        className="composer-mode-pill"
                        title={t('planModeActive')}
                        onClick={() => void changeChatMode('agent')}
                      >
                        {t('modePlan')}
                      </button>
                    ) : null}
                    {newTaskProfile === 'explore' && chatMode !== 'plan' ? (
                      <button
                        type="button"
                        className="composer-mode-pill"
                        title={t('plusExploreHint')}
                        onClick={() => setNewTaskProfile('default')}
                      >
                        {t('modeExplore')}
                      </button>
                    ) : null}
                    {!newTaskMemoryEnabled ? (
                      <button
                        type="button"
                        className="composer-mode-pill"
                        title={t('plusTaskMemoryOffHint')}
                        onClick={() => void handlePlusAction({ type: 'task-memory', on: true })}
                      >
                        {t('plusTaskMemoryOff')}
                      </button>
                    ) : null}
                    {!newTaskSubagentsEnabled ? (
                      <button
                        type="button"
                        className="composer-mode-pill"
                        title={t('plusTaskSubagentsOffHint')}
                        onClick={() => void handlePlusAction({ type: 'task-subagents', on: true })}
                      >
                        {t('plusTaskSubagentsOff')}
                      </button>
                    ) : null}
                    {!newTaskPlanningEnabled ? (
                      <button
                        type="button"
                        className="composer-mode-pill"
                        title={t('plusTaskPlanningOffHint')}
                        onClick={() => void handlePlusAction({ type: 'task-planning', on: true })}
                      >
                        {t('plusTaskPlanningOff')}
                      </button>
                    ) : null}
                    {newTaskDisallowedTools.length ? (
                      <button
                        type="button"
                        className="composer-mode-pill"
                        title={`${t('plusTaskToolsHint')}: ${newTaskDisallowedTools.join(', ')}`}
                        onClick={() => void handlePlusAction({ type: 'task-tool-limits' })}
                      >
                        {t('plusTaskToolsLimited').replace('{n}', String(newTaskDisallowedTools.length))}
                      </button>
                    ) : null}
                    {newTaskPermissionRules.length ? (
                      <button
                        type="button"
                        className="composer-mode-pill"
                        title={permissionRulesToForm(newTaskPermissionRules)}
                        onClick={() => void handlePlusAction({ type: 'task-permission-rules' })}
                      >
                        {t('plusPermRulesLimited').replace('{n}', String(newTaskPermissionRules.length))}
                      </button>
                    ) : null}
                    {newTaskProfile !== 'default' && newTaskProfile !== 'explore' && chatMode !== 'plan' && (!newTaskProfile.startsWith('project:') || Boolean(projectRoleNameForCwd(newTaskProfile, project))) ? (
                      <button
                        type="button"
                        className="composer-mode-pill"
                        title={t('taskRoleActiveHint')}
                        onClick={() => { setSettingsInitialSection('agents'); setKernelOpen(true); }}
                      >
                        {newTaskProfile.startsWith('project:') ? t('taskRoleProject') : t('taskRoleCustom')}
                      </button>
                    ) : null}
                  </div>
                  <div className="composer-toolbar-right">
                    <div className="composer-model-wrap">
                      <button
                        type="button"
                        className="composer-ctl"
                        title={`${t('modelFromSub')} · ${t('effortHintReal')}`}
                        onClick={() => {
                          setModelPopOpen((v) => !v);
                          setPermPopOpen(false);
                        }}
                      >
                        <span className="composer-ctl-main">
                          {formatTaskModelDisplay({
                            modelId: modelId || availableModels[0]?.modelId || '',
                            modelName:
                              modelShortLabel(
                                modelId || availableModels[0]?.modelId || '',
                                availableModels,
                              ) || 'model',
                            providerLabel: resolveProviderForModelId(
                              modelId || availableModels[0]?.modelId,
                              customModelRows,
                            ),
                          })}
                        </span>
                        <span className="composer-ctl-meta">{effortShortLabel(effort)}</span>
                      </button>
                      {modelPopOpen ? (
                        <div className="composer-pop composer-pop-end" role="dialog">
                          <div className="composer-pop-title">{t('modelFromSub')}</div>
                          {(availableModels.length
                            ? availableModels
                            : modelId
                              ? [{ modelId, name: modelId }]
                              : []
                          ).map((m) => (
                            <button
                              key={m.modelId}
                              type="button"
                              className={`composer-pop-item${modelId === m.modelId ? ' active' : ''}`}
                              onClick={() => {
                                setModelId(m.modelId);
                                setModelPopOpen(false);
                              }}
                            >
                              {m.name || m.modelId}
                            </button>
                          ))}
                          <div className="composer-pop-title">{t('effortFromModel')}</div>
                          {(['low', 'medium', 'high'] as ReasoningEffort[]).map((e) => (
                            <button
                              key={e}
                              type="button"
                              className={`composer-pop-item${effort === e ? ' active' : ''}`}
                              onClick={() => {
                                setEffort(e);
                                setModelPopOpen(false);
                              }}
                            >
                              {effortShortLabel(e)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {(() => {
                      return (
                        <div className="ctx-ring-wrap">
                          <ContextRing
                            pct={0}
                            title={t('contextHomeNa')}
                            onClick={() => {
                              setCtxPopOpen((v) => !v);
                              setModelPopOpen(false);
                              setPermPopOpen(false);
                            }}
                          />
                          {ctxPopOpen ? (
                            <div className="ctx-popover align-right" role="dialog">
                              <div className="ctx-pop-title">{t('contextWindow')}</div>
                              <div className="ctx-pop-row">
                                <span>{t('contextHomeNa')}</span>
                                <strong>—</strong>
                              </div>
                              <div className="ctx-pop-detail muted">{t('contextHomeNaHint')}</div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                    <button
                      type="button"
                      className="btn-send"
                      title={t('send')}
                      disabled={!draft.trim() && composerAtts.length === 0}
                      onClick={() => {
                        void send();
                      }}
                    >
                      ↑
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <header className="main-bar">
              <div className="main-title" title={active.title}>
                {active.title}
              </div>
              {active.worktreePath ? (
                <button
                  type="button"
                  className="pill"
                  title={active.worktreePath}
                  onClick={() =>
                    void revealInFinder(active.worktreePath!).catch(() => {})
                  }
                >
                  {t('worktree')} ·{' '}
                  {active.worktreePath.replace(/\/+$/, '').split('/').slice(-2).join('/')}
                </button>
              ) : null}
              <div className="main-bar-spacer" />
              {activeDeliverables.length ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  title={t('deliverablesOpenHint')}
                  onClick={() => setDeliverablesOpen(true)}
                >
                  {t('deliverablesOpen')}
                  <span className="approval-inbox-count">{activeDeliverables.length}</span>
                </button>
              ) : null}
              {approvalQueue.length ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  title={t('approvalInboxOpenHint')}
                  onClick={() => setApprovalInboxOpen(true)}
                >
                  {t('approvalInboxOpen')}
                  <span className="approval-inbox-count">{approvalQueue.length}</span>
                </button>
              ) : null}
              {/* 有可执行的计划步骤时显示「执行/重试」 */}
              {activePlanEntries.length > 0 && !active.busy ? (
                <button
                  type="button"
                  className="btn btn-sm primary-sm"
                  title={t('applyPlanHint')}
                  onClick={() => void applyPlan()}
                >
                  {active.chatMode === 'plan' ? t('applyPlan') : t('applyPlanRetry')}
                </button>
              ) : null}
              {active.error ? (
                <button
                  type="button"
                  className="pill err"
                  title={requiresAccountReauthentication(active.error)
                    ? t('taskErrorSignInHint')
                    : t('taskErrorDetailsHint')}
                  onClick={() => {
                    if (requiresAccountReauthentication(active.error)) {
                      void reauthenticateTask(active.id);
                    } else {
                      setTaskErrorOpen(true);
                    }
                  }}
                >
                  {requiresAccountReauthentication(active.error)
                    ? t('taskErrorSignInRequired')
                    : t('taskErrorDetails')}
                </button>
              ) : null}
              {active.sessionId ? (
                <>
                  <button
                    type="button"
                    className="chrome-btn"
                    title={t('exportSession')}
                    aria-label={t('exportSession')}
                    disabled={active.busy}
                    onClick={() => void exportActiveSession()}
                  >
                    <IconExport />
                  </button>
                  <button
                    type="button"
                    className="chrome-btn"
                    title={t('forkSession')}
                    aria-label={t('forkSession')}
                    disabled={active.busy || !active.client}
                    onClick={() => void forkActiveSession()}
                  >
                    <IconFork />
                  </button>
                </>
              ) : null}
            </header>
            {/* Goal console: persist + native actions + plan-based progress */}
            {active.sessionGoal ? (
              <div
                className={`goal-banner goal-banner-active goal-status-${active.sessionGoal.status}${
                  active.busy ? ' goal-busy' : ''
                }`}
              >
                <strong>
                  {t('goalBanner')}
                  {active.busy ? (
                    <span className="thread-busy-dot" style={{ marginLeft: 6 }} aria-hidden />
                  ) : null}
                </strong>
                <span className="goal-banner-status">
                  {goalStatusLabel(active.sessionGoal.status, {
                    active: t('goalStatusActive'),
                    paused: t('goalStatusPaused'),
                    complete: t('goalStatusComplete'),
                    blocked: t('goalStatusBlocked'),
                  })}
                </span>
                <span className="goal-banner-text" title={active.sessionGoal.text}>
                  {active.sessionGoal.text}
                </span>
                {active.sessionGoal.message ? (
                  <span className="goal-banner-msg muted" title={active.sessionGoal.message}>
                    {active.sessionGoal.message}
                  </span>
                ) : null}
                {active.sessionGoal.blockedReason ? (
                  <span className="goal-banner-msg" title={active.sessionGoal.blockedReason}>
                    {active.sessionGoal.blockedReason}
                  </span>
                ) : null}
                {activePlanEntries.length > 0 ? (
                  <span className="goal-banner-progress">
                    {t('reviewPlanProgress')
                      .replace(
                        '{done}',
                        String(
                          activePlanEntries.filter(
                            (e) =>
                              e.checked ||
                              /done|complete|finish/i.test(e.status || ''),
                          ).length,
                        ),
                      )
                      .replace('{total}', String(activePlanEntries.length))}
                  </span>
                ) : (
                  <span className="goal-banner-progress muted" title={t('goalNoProgressHint')}>
                    {t('goalNoProgressShort')}
                  </span>
                )}
                <div className="goal-banner-actions">
                  {active.sessionGoal.status !== 'complete' ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={active.busy}
                        title={t('goalStatusHint')}
                        onClick={() => void runGoalCommand('status')}
                      >
                        {t('goalStatusBtn')}
                      </button>
                      {active.sessionGoal.status === 'paused' ? (
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={active.busy}
                          onClick={() => void runGoalCommand('resume')}
                        >
                          {t('goalResume')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={active.busy}
                          onClick={() => void runGoalCommand('pause')}
                        >
                          {t('goalPause')}
                        </button>
                      )}
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={active.busy && active.sessionGoal.status !== 'complete'}
                    title={t('goalClearHint')}
                    onClick={() => {
                      if (active.sessionGoal?.status === 'complete') {
                        patchThread(active.id, { sessionGoal: null });
                      } else {
                        void runGoalCommand('clear');
                      }
                    }}
                  >
                    {active.sessionGoal.status === 'complete'
                      ? t('goalDismiss')
                      : t('goalClear')}
                  </button>
                </div>
              </div>
            ) : capabilityArm && /^\/goal\b/i.test(capabilityArm.prefix) ? (
              <div className="goal-banner">
                <strong>{t('goalStaging')}</strong>
                <span>{t('goalStagingHint')}</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => {
                    setCapabilityArm(null);
                    setDraft('');
                  }}
                >
                  {t('capabilityClear')}
                </button>
              </div>
            ) : null}
            {/* 仅在有计划步骤时显示进度条；模式切换在底部「规划/执行」 */}
            {activePlanEntries.length > 0 ? (
              <div className="goal-banner plan-banner">
                <strong>{t('modePlan')}</strong>
                <span>
                  {t('reviewPlanProgress')
                    .replace(
                      '{done}',
                      String(activePlanEntries.filter((e) => e.checked).length),
                    )
                    .replace('{total}', String(activePlanEntries.length))}
                </span>
                {!active.busy ? (
                  <button
                    type="button"
                    className="btn btn-sm primary-sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => void applyPlan()}
                  >
                    {active.chatMode === 'plan' ? t('applyPlan') : t('applyPlanRetry')}
                  </button>
                ) : null}
              </div>
            ) : null}
            {active.error ? (
              <section className="task-error-card" role="alert" aria-label={t('taskErrorDialogTitle')}>
                <div>
                  <strong>{requiresAccountReauthentication(active.error) ? t('accountSignInAgain') : t('taskFailedVisible')}</strong>
                  <p>{t('taskErrorDialogHint')}</p>
                </div>
                <div className="task-error-card-actions">
                  {requiresAccountReauthentication(active.error) ? (
                    <button
                      type="button"
                      className="btn btn-sm primary-sm"
                      disabled={taskReauthBusy}
                      onClick={() => void reauthenticateTask(active.id)}
                    >
                      {taskReauthBusy ? t('taskErrorSignInWorking') : t('taskErrorSignIn')}
                    </button>
                  ) : null}
                  {isRepairableSessionError(active.error) ? (
                    <button
                      type="button"
                      className="btn btn-sm primary-sm"
                      disabled={sessionRepairBusyId === active.id || active.busy}
                      onClick={() => void repairBrokenSession(active.id)}
                    >
                      {sessionRepairBusyId === active.id ? t('sessionRepairRunning') : t('sessionRepair')}
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-sm" onClick={() => setTaskErrorOpen(true)}>
                    {t('taskErrorDetails')}
                  </button>
                  {!active.client ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={active.busy}
                      onClick={() => void reconnectThread(active.id).catch(() => {})}
                    >
                      {t('taskErrorReconnect')}
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}
            <ProcessPanel
              open={processOpen}
              onClose={() => {
                setProcessOpen(false);
                localStorage.setItem('gorkx.processOpen', '0');
              }}
              lines={active.lines}
              busy={active.busy}
              onCancelSubagent={(subagentId) => {
                const client = active.client;
                if (!client) return;
                setThreads((prev) =>
                  prev.map((thread) =>
                    thread.id === active.id
                      ? {
                          ...thread,
                          lines: thread.lines.map((line) =>
                            line.toolKey === `subagent:${subagentId}`
                              ? { ...line, toolStatus: 'cancelling' }
                              : line,
                          ),
                        }
                      : thread,
                  ),
                );
                void client.cancelSubagent(subagentId).then((result) => {
                  // A live cancellation emits subagent_finished. If the engine
                  // says it was already terminal, no follow-up event is sent,
                  // so settle the row from the typed response.
                  if (result.cancelled) return;
                  const terminal = result.outcome?.status || 'cancelled';
                  setThreads((prev) =>
                    prev.map((thread) =>
                      thread.id === active.id
                        ? {
                            ...thread,
                            lines: thread.lines.map((line) =>
                              line.toolKey === `subagent:${subagentId}`
                                ? { ...line, toolStatus: terminal }
                                : line,
                            ),
                          }
                        : thread,
                    ),
                  );
                }).catch((error) => {
                  setThreads((prev) =>
                    prev.map((thread) =>
                      thread.id === active.id
                        ? {
                            ...thread,
                            lines: thread.lines.map((line) =>
                              line.toolKey === `subagent:${subagentId}`
                                ? { ...line, toolStatus: 'running' }
                                : line,
                            ),
                          }
                        : thread,
                    ),
                  );
                  appendLine(active.id, {
                    id: nid(),
                    role: 'system',
                    text: `停止子任务失败：${error instanceof Error ? error.message : String(error)}`,
                  });
                });
              }}
              onInspectSubagent={(subagentId) => {
                const client = active.client;
                if (!client) return;
                void client.getSubagent(subagentId).then((snapshot) => {
                  if (!snapshot) {
                    appendLine(active.id, {
                      id: nid(),
                      role: 'system',
                      text: `子任务 ${subagentId} 的内核快照已不可用。`,
                    });
                    return;
                  }
                  const output = typeof snapshot.output === 'string' ? snapshot.output.trim() : '';
                  const failure = typeof snapshot.failureError === 'string'
                    ? snapshot.failureError
                    : typeof snapshot.failure_error === 'string'
                      ? snapshot.failure_error
                      : '';
                  const cancelled = typeof snapshot.cancelReason === 'string'
                    ? snapshot.cancelReason
                    : typeof snapshot.cancel_reason === 'string'
                      ? snapshot.cancel_reason
                      : '';
                  const status = String(snapshot.status ?? 'unknown');
                  const detail = output || failure || cancelled || '内核未返回文本输出。';
                  appendLine(active.id, {
                    id: nid(),
                    role: 'system',
                    text: `子任务结果 (${status})\n${detail}`,
                  });
                }).catch((error) => {
                  appendLine(active.id, {
                    id: nid(),
                    role: 'system',
                    text: `读取子任务结果失败：${error instanceof Error ? error.message : String(error)}`,
                  });
                });
              }}
            />
            {!processOpen ? <ToolTimeline tools={activeTools} /> : null}
            <MessageList
              lines={active.lines}
              bottomRef={bottomRef}
              onTogglePlanEntry={togglePlanEntry}
              onToggleAllPlan={toggleAllPlanEntries}
              onOpenAttachment={setPreviewAtt}
              onCopyAssistant={async (text) => {
                try {
                  await navigator.clipboard.writeText(text);
                } catch {
                  const area = document.createElement('textarea');
                  area.value = text;
                  area.style.position = 'fixed';
                  area.style.opacity = '0';
                  document.body.appendChild(area);
                  area.select();
                  const copied = document.execCommand('copy');
                  area.remove();
                  if (!copied) throw new Error(t('copyFailed'));
                }
              }}
              showProcessInChat={false}
              showTimestamps={showMessageTimestamps}
              choiceDisabled={active.busy}
              onSelectChoice={(value) => void send(value)}
              followUps={followUps[active.id]?.suggestions}
              onWorkflowAction={(workflow, action) => void manageWorkflow(workflow, action).catch((error) => {
                appendLine(active.id, {
                  id: nid(),
                  role: 'system',
                  text: error instanceof Error ? error.message : String(error),
                });
              })}
              workflowActionDisabled={!workflowManagementAvailable || active.busy}
              onScheduledTaskDelete={(task) => void deleteKernelScheduledTask(task).catch((error) => {
                appendLine(active.id, {
                  id: nid(),
                  role: 'system',
                  text: error instanceof Error ? error.message : String(error),
                });
              })}
              scheduledTaskDeleteDisabled={active.busy}
              footer={
                activeApproval?.kind === 'question' && activeApproval.threadId === active.id ? (
                  <UserQuestionPrompt
                    presentation="inline"
                    request={activeApproval.request}
                    onAccept={(answers: UserQuestionAnswers, annotations: UserQuestionAnnotations) =>
                      void answerUserQuestion(userQuestionAcceptedResult(answers, annotations))
                    }
                    onPlanAction={(outcome, partialAnswers) =>
                      void answerUserQuestion(userQuestionPlanResult(outcome, partialAnswers))
                    }
                    onCancel={() => void answerUserQuestion(userQuestionCancelledResult())}
                  />
                ) : null
              }
            />
            {(() => {
              const info = threadRunInfo(active);
              const snoozeUntil = stallSnoozeUntil[active.id] ?? 0;
              const showStall =
                info.stalled && info.phase === 'running' && stallClock >= snoozeUntil;
              if (!showStall) return null;
              return (
                <div className="run-stall-banner" role="status">
                  <p>{t('runStallBanner')}</p>
                  <div className="run-stall-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        // Acknowledge still-working: refresh heartbeat baseline only in UI snooze.
                        setStallSnoozeUntil((prev) => ({
                          ...prev,
                          [active.id]: Date.now() + DEFAULT_STALL_MS,
                        }));
                      }}
                    >
                      {t('runStallStillWorking')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        setStallSnoozeUntil((prev) => ({
                          ...prev,
                          [active.id]: Date.now() + DEFAULT_STALL_MS,
                        }));
                      }}
                    >
                      {t('runStallKeepWaiting')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm primary-sm"
                      onClick={() => void cancelTurn()}
                    >
                      {t('runStallCancel')}
                    </button>
                  </div>
                </div>
              );
            })()}
            <div className="composer-dock">
              <div
                className={`composer${dragOver ? ' drag-over' : ''}`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) setDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const files = Array.from(e.dataTransfer.files || []);
                  const paths = files
                    .map((f) => (f as File & { path?: string }).path)
                    .filter((p): p is string => Boolean(p));
                  if (paths.length) void addAttachmentPaths(paths);
                }}
              >
                {composerAtts.length ? (
                  <AttachmentStrip
                    items={composerAtts}
                    onRemove={removeComposerAtt}
                    onOpen={setPreviewAtt}
                  />
                ) : null}
                {dragOver ? <div className="composer-drop-hint">{t('dropFilesHint')}</div> : null}
                {queuedFollowUps[active.id] ? (
                  <div className="follow-up-queued" role="status">
                    <span>
                      {t('followUpQueued')}: {queuedFollowUps[active.id].slice(0, 100)}
                      {queuedFollowUps[active.id].length > 100 ? '…' : ''}
                    </span>
                    <div className="follow-up-queued-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          const queued = queuedFollowUps[active.id];
                          if (!queued) return;
                          // Editing must stop the automatic next-turn send first;
                          // the user explicitly re-queues the revised text.
                          setDraft(queued);
                          setQueuedFollowUps((prev) => {
                            const { [active.id]: _drop, ...rest } = prev;
                            return rest;
                          });
                        }}
                      >
                        {t('followUpEditQueue')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() =>
                          setQueuedFollowUps((prev) => {
                            const { [active.id]: _drop, ...rest } = prev;
                            return rest;
                          })
                        }
                      >
                        {t('followUpClearQueue')}
                      </button>
                    </div>
                  </div>
                ) : null}
                {promptSuggestion?.threadId === active.id ? (
                  <div className="prompt-suggestion-card" role="status">
                    <span className="prompt-suggestion-label">{t('promptSuggestionLabel')}</span>
                    <button
                      type="button"
                      className="prompt-suggestion-text"
                      title={t('promptSuggestionUseHint')}
                      onClick={() => {
                        setDraft(promptSuggestion.text);
                        setPromptHistoryIndex(-1);
                        setPromptSuggestion(null);
                      }}
                    >
                      {promptSuggestion.text}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      title={t('promptSuggestionDismissHint')}
                      onClick={() => setPromptSuggestion(null)}
                    >
                      {t('cancel')}
                    </button>
                  </div>
                ) : null}
                {promptSuggestionError ? (
                  <div className="hint prompt-suggestion-error" role="alert">
                    {t('promptSuggestionUnavailable')}: {promptSuggestionError}
                  </div>
                ) : null}
                <SlashMenu
                  open={slashOpen}
                  items={slashMenuItems(draft)}
                  activeIndex={slashIndex}
                  sourceLabel={sourceLabel}
                  onActiveIndex={setSlashIndex}
                  onPick={applySlashPick}
                />
                {atOpen ? (
                  <div className="slash-menu" role="listbox" aria-label={t('atFilesHint')}>
                    <div className="hint">
                      {t('atFilesHintNav').replace('{q}', atQuery || '*')}
                    </div>
                    {atHits.length === 0 ? (
                      <div className="hint">{t('atFilesEmpty')}</div>
                    ) : (
                      atHits.map((h, i) => {
                        const hi = Math.min(atIndex, atHits.length - 1);
                        return (
                          <button
                            key={h.path}
                            type="button"
                            role="option"
                            aria-selected={i === hi}
                            className={i === hi ? 'slash-item on' : 'slash-item'}
                            ref={(el) => {
                              if (i === hi && el) el.scrollIntoView({ block: 'nearest' });
                            }}
                            onMouseEnter={() => setAtIndex(i)}
                            onClick={() => insertAtFile(h.path)}
                          >
                            <span className="mono">{h.path}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
                {capabilityArm ? (
                  <div className="capability-arm">
                    <span>
                      {t('capabilityArmed').replace('{name}', capabilityArm.label)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        setCapabilityArm(null);
                        setDraft('');
                      }}
                    >
                      {t('capabilityClear')}
                    </button>
                  </div>
                ) : null}
                <textarea
                  value={draft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft(v);
                    setSlashOpen(v.startsWith('/') && !v.includes('\n'));
                    if (
                      capabilityArm &&
                      !v.startsWith(capabilityArm.prefix) &&
                      !v.startsWith(`${capabilityArm.prefix} `)
                    ) {
                      setCapabilityArm(null);
                    }
                    const at = v.match(/(^|\s)@([^\s@]*)$/);
                    if (at) {
                      setAtOpen(true);
                      setAtQuery(at[2] || '');
                    } else {
                      setAtOpen(false);
                      setAtQuery('');
                    }
                  }}
                  placeholder={
                    capabilityArm
                      ? t('capabilityPlaceholder').replace('{name}', capabilityArm.label)
                      : t('composerPlaceholder')
                  }
                  rows={2}
                  onKeyDown={(e) => {
                    if (handleComposerMenuKeys(e)) return;
                    if (e.key === 'Escape') {
                      if (capabilityArm) {
                        setCapabilityArm(null);
                        setDraft('');
                      }
                    }
                    // Enter send · Shift+Enter newline
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      setSlashOpen(false);
                      setAtOpen(false);
                      void send();
                    }
                  }}
                />
                {voiceInterim || voiceError || voiceListeningSessionId === active.sessionId ? (
                  <div className="voice-hint" role={voiceError ? 'alert' : 'status'}>
                    {voiceError || voiceInterim || t('voiceListening')}
                  </div>
                ) : null}
                <div className="composer-send-row">
                  <div className="composer-toolbar-left">
                    {active.sessionId && active.client && !active.busy && active.lines.some((line) => line.role === 'assistant') ? (
                      <button
                        type="button"
                        className="btn btn-sm composer-btw-btn"
                        title={t('promptSuggestionButtonHint')}
                        disabled={promptSuggestionBusy}
                        onClick={() => void requestPromptSuggestion()}
                      >
                        {promptSuggestionBusy ? t('promptSuggestionWorking') : t('promptSuggestionButton')}
                      </button>
                    ) : null}
                    {active.busy && composerAtts.length === 0 ? (
                      <button
                        type="button"
                        className="btn btn-sm composer-btw-btn"
                        title={t('followUpAsideHint')}
                        disabled={!draft.trim() || asideBusyThreadId === active.id}
                        onClick={() => void askAsideDraft()}
                      >
                        {asideBusyThreadId === active.id ? t('followUpAsideWorking') : t('followUpAside')}
                      </button>
                    ) : null}
                    {active.busy && composerAtts.length === 0 ? (
                      <button
                        type="button"
                        className="btn btn-sm composer-btw-btn"
                        title={t('followUpInterjectHint')}
                        disabled={!draft.trim()}
                        onClick={() => void interjectDraft()}
                      >
                        {t('followUpInterject')}
                      </button>
                    ) : null}
                    {activeFollowUpMode === 'queue' ? (
                      <button
                        type="button"
                        className="btn btn-sm composer-btw-btn"
                        title={t('followUpQueueHint')}
                        disabled={!draft.trim()}
                        onClick={() => {
                          const text = draft.trim();
                          if (!text) return;
                          setQueuedFollowUps((prev) => ({ ...prev, [active.id]: text }));
                          setDraft('');
                          appendLine(active.id, {
                            id: nid(),
                            role: 'system',
                            text: `${t('followUpQueued')}: ${text.slice(0, 160)}${text.length > 160 ? '…' : ''}`,
                          });
                        }}
                      >
                        {t('followUpQueue')}
                      </button>
                    ) : null}
                    <div className="plus-wrap">
                      <button
                        type="button"
                        className="btn-icon"
                        disabled={active.busy}
                        title={t('plusMenu')}
                        onClick={() => setPlusMenuOpen((v) => !v)}
                      >
                        ＋
                      </button>
                      <PlusMenu
                        open={plusMenuOpen}
                        planModeOn={(active.chatMode ?? chatMode) === 'plan'}
                        taskMemoryEnabled={active.memoryEnabled !== false}
                        taskSubagentsEnabled={active.subagentsEnabled !== false}
                        taskPlanningEnabled={active.planningEnabled !== false}
                        searchScopeAvailable={active.searchScopeAvailable === true}
                        skills={extSnap?.skills ?? []}
                        hasActiveSession={Boolean(active.client && active.sessionId)}
                        hasImageAttachment={composerAtts.some((attachment) => attachment.kind === 'image')}
                        availableCommandNames={(active.commands ?? []).map((c) =>
                          c.name.replace(/^\//, ''),
                        )}
                        workflows={activeSavedWorkflows}
                        engineActions={active.commands}
                        onClose={() => setPlusMenuOpen(false)}
                        onAction={(a) => void handlePlusAction(a)}
                      />
                      <ProjectPicker
                        open={projectPickerOpen && Boolean(active)}
                        projects={[
                          ...pinnedProjects,
                          ...recentProjects.filter((p) => !pinnedProjects.includes(p)),
                        ].filter((p, i, arr) => arr.indexOf(p) === i)}
                        aliases={projectAliases}
                        current={project || undefined}
                        onClose={() => setProjectPickerOpen(false)}
                        onAction={(a) => void handleProjectPicker(a)}
                      />
                    </div>
                    <div className="composer-perm-wrap">
                      <button
                        type="button"
                        className={`composer-icon-btn perm-${perm}`}
                        title={`${t('permission')}: ${
                          perm === 'auto'
                            ? t('permAuto')
                            : perm === 'full'
                              ? t('permFull')
                              : t('permDefault')
                        }`}
                        disabled={active.busy}
                        onClick={() => {
                          setPermPopOpen((v) => !v);
                          setModelPopOpen(false);
                          setCtxPopOpen(false);
                        }}
                      >
                        <PermShieldIcon mode={perm} />
                      </button>
                      {permPopOpen ? (
                        <div className="composer-pop composer-pop-sm" role="dialog">
                          <div className="composer-pop-title">{t('permission')}</div>
                          {(
                            [
                              ['default', t('permDefault'), t('permDefaultHint')],
                              ['auto', t('permAuto'), t('permAutoHint')],
                              ['full', t('permFull'), t('permFullHint')],
                            ] as const
                          ).map(([id, label, hint]) => (
                            <button
                              key={id}
                              type="button"
                              className={`composer-pop-item stacked${perm === id ? ' active' : ''}`}
                              onClick={() => {
                                setPerm(id);
                                setPermPopOpen(false);
                              }}
                            >
                              <span>{label}</span>
                              <span className="composer-pop-hint">{hint}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={`composer-icon-btn voice-btn${voiceListeningSessionId === active.sessionId ? ' listening' : ''}`}
                      title={
                        voiceListeningSessionId === active.sessionId
                          ? t('voiceInputStop')
                          : t('voiceInput')
                      }
                      aria-label={
                        voiceListeningSessionId === active.sessionId
                          ? t('voiceInputStop')
                          : t('voiceInput')
                      }
                      aria-pressed={voiceListeningSessionId === active.sessionId}
                      disabled={!active.client || !active.sessionId}
                      onClick={() => void toggleNativeVoice()}
                    >
                      <svg className="mic-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                        <rect x="5.25" y="2" width="5.5" height="8" rx="2.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M3.5 7.75a4.5 4.5 0 0 0 9 0M8 12.25v2M5.75 14.25h4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                    {(active.chatMode ?? chatMode) === 'plan' ? (
                      <button
                        type="button"
                        className="composer-mode-pill"
                        title={t('planModeActive')}
                        disabled={active.busy}
                        onClick={() => void changeChatMode('agent')}
                      >
                        {t('modePlan')}
                      </button>
                    ) : null}
                    {sanitizeTaskToolLimits(active.disallowedTools).length ? (
                      <span
                        className="composer-mode-pill"
                        title={`${t('taskToolLimitsActiveHint')}: ${sanitizeTaskToolLimits(active.disallowedTools).join(', ')}`}
                      >
                        {t('plusTaskToolsLimited').replace(
                          '{n}',
                          String(sanitizeTaskToolLimits(active.disallowedTools).length),
                        )}
                      </span>
                    ) : null}
                    {sanitizePermissionRules(active.permissionRules).length ? (
                      <span
                        className="composer-mode-pill"
                        title={`${t('permRulesActiveHint')}\n${permissionRulesToForm(active.permissionRules ?? [])}`}
                      >
                        {t('plusPermRulesLimited').replace(
                          '{n}',
                          String(sanitizePermissionRules(active.permissionRules).length),
                        )}
                      </span>
                    ) : null}
                  </div>
                  <div className="composer-toolbar-right">
                    <div className="composer-model-wrap">
                      <button
                        type="button"
                        className="composer-ctl"
                        title={
                          availableModels.length <= 1
                            ? t('modelSubOnlyOneHint')
                            : `${t('modelFromSub')} · ${t('effortHintReal')}`
                        }
                        disabled={active.busy}
                        onClick={() => {
                          setModelPopOpen((v) => !v);
                          setPermPopOpen(false);
                          setCtxPopOpen(false);
                        }}
                      >
                        <span className="composer-ctl-main">
                          {formatTaskModelDisplay({
                            modelId: active?.modelId || modelId || availableModels[0]?.modelId || '',
                            modelName:
                              modelShortLabel(
                                active?.modelId || modelId || availableModels[0]?.modelId || '',
                                availableModels,
                              ) || 'model',
                            providerLabel: resolveProviderForModelId(
                              active?.modelId || modelId || availableModels[0]?.modelId,
                              customModelRows,
                            ),
                          })}
                        </span>
                        <span className="composer-ctl-meta">
                          {effortShortLabel(active ? active.effort : effort)}
                        </span>
                      </button>
                      {modelPopOpen ? (
                        <div className="composer-pop composer-pop-end" role="dialog">
                          <div className="composer-pop-title">{t('modelFromSub')}</div>
                          {(availableModels.length
                            ? availableModels
                            : modelId
                              ? [{ modelId, name: modelId }]
                              : []
                          ).map((m) => (
                            <button
                              key={m.modelId}
                              type="button"
                              className={`composer-pop-item${modelId === m.modelId ? ' active' : ''}`}
                              onClick={() => {
                                void changeModel(m.modelId);
                                setModelPopOpen(false);
                              }}
                            >
                              {m.name || m.modelId}
                            </button>
                          ))}
                          <div className="composer-pop-title">{t('effortFromModel')}</div>
                          {(['low', 'medium', 'high'] as ReasoningEffort[]).map((e) => (
                            <button
                              key={e}
                              type="button"
                              className={`composer-pop-item${
                                (active ? active.effort : effort) === e ? ' active' : ''
                              }`}
                              onClick={() => {
                                void changeEffort(e);
                                setModelPopOpen(false);
                              }}
                            >
                              {effortShortLabel(e)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {(() => {
                      const limit =
                        modelCtx?.contextWindow || active.usage?.contextLimit || 500_000;
                      const used = estimateContextUsed(active.usage);
                      const bar = formatContextBar(used, limit);
                      return (
                        <div className="ctx-ring-wrap">
                          <ContextRing
                            pct={bar.pct}
                            title={t('contextClickHint')}
                            onClick={() => {
                              setCtxPopOpen((v) => !v);
                              setModelPopOpen(false);
                              setPermPopOpen(false);
                            }}
                          />
                          {ctxPopOpen ? (
                            <div className="ctx-popover align-right" role="dialog">
                              <div className="ctx-pop-title">{t('contextWindow')}</div>
                              <div className="ctx-pop-row">
                                <span>{bar.label}</span>
                                <strong>{bar.pct}%</strong>
                              </div>
                              <div className="ctx-pop-bar">
                                <span style={{ width: `${bar.pct}%` }} />
                              </div>
                              {formatUsage(active.usage) ? (
                                <div className="ctx-pop-detail muted">{formatUsage(active.usage)}</div>
                              ) : null}
                              <div className="ctx-pop-detail muted">
                                {t('autoCompactHint')}
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm ctx-task-info-btn"
                                onClick={() => {
                                  setCtxPopOpen(false);
                                  setTaskInfoOpen(true);
                                }}
                              >
                                {t('taskInfoTitle')}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                    <button
                      type="button"
                      className={`btn-send${active.busy ? ' btn-send-stop' : ''}`}
                      title={active.busy ? t('stop') : t('send')}
                      disabled={
                        active.busy
                          ? false
                          : (!draft.trim() && composerAtts.length === 0) || !active.client
                      }
                      onClick={() => {
                        if (active.busy) void cancelTurn();
                        else {
                          void send();
                        }
                      }}
                    >
                      {active.busy ? (
                        <span className="btn-send-stop-icon" aria-hidden />
                      ) : (
                        '↑'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      <AttachmentPreview
        item={previewAtt}
        projectCwd={active?.cwd || project || undefined}
        onClose={() => setPreviewAtt(null)}
      />

      {promptHistoryOpen ? (
        <div className="modal-backdrop" onClick={() => setPromptHistoryOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('promptHistoryTitle')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h2>{t('promptHistoryTitle')}</h2>
              <button type="button" className="btn btn-sm" onClick={() => setPromptHistoryOpen(false)}>
                {t('cancel')}
              </button>
            </div>
            <p className="text-prompt-msg">{t('promptHistoryHint')}</p>
            {kernelPromptHistoryLoading ? <div className="hint">{t('promptHistoryLoading')}</div> : null}
            {kernelPromptHistoryError ? (
              <div className="hint">{t('promptHistoryKernelUnavailable')}: {kernelPromptHistoryError}</div>
            ) : null}
            {kernelPromptHistory.length ? <div className="hint">{t('promptHistoryKernelHint')}</div> : null}
            {visiblePromptHistory.length ? (
              <div style={{ display: 'grid', gap: 6, maxHeight: 360, overflow: 'auto' }}>
                {visiblePromptHistory.map((text, index) => (
                  <button
                    key={`${index}:${text}`}
                    type="button"
                    className="slash-item"
                    style={{ textAlign: 'left' }}
                    onClick={() => {
                      setDraft(text);
                      setPromptHistoryIndex(index < activePromptHistory.length ? index : -1);
                      setPromptHistoryOpen(false);
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
            ) : (
              !kernelPromptHistoryLoading ? <div className="hint">{t('promptHistoryEmpty')}</div> : null
            )}
          </div>
        </div>
      ) : null}

      {taskErrorOpen && active?.error ? (
        <div className="modal-backdrop" onClick={() => setTaskErrorOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('taskErrorDialogTitle')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h2>{t('taskErrorDialogTitle')}</h2>
              <button type="button" className="btn btn-sm" onClick={() => setTaskErrorOpen(false)}>
                {t('cancel')}
              </button>
            </div>
            <p className="text-prompt-msg">{t('taskErrorDialogHint')}</p>
            <pre className="modal-body">{active.error}</pre>
            <div className="modal-actions">
              {requiresAccountReauthentication(active.error) ? (
                <button
                  type="button"
                  className="btn btn-sm primary-sm"
                  disabled={taskReauthBusy}
                  onClick={() => void reauthenticateTask(active.id)}
                >
                  {taskReauthBusy ? t('taskErrorSignInWorking') : t('taskErrorSignIn')}
                </button>
              ) : null}
              {isRepairableSessionError(active.error) ? (
                <button
                  type="button"
                  className="btn btn-sm primary-sm"
                  disabled={sessionRepairBusyId === active.id || active.busy}
                  onClick={() => void repairBrokenSession(active.id)}
                >
                  {sessionRepairBusyId === active.id ? t('sessionRepairRunning') : t('sessionRepair')}
                </button>
              ) : null}
              {!active.client ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={active.busy}
                  onClick={() => {
                    setTaskErrorOpen(false);
                    void reconnectThread(active.id).catch(() => {});
                  }}
                >
                  {t('taskErrorReconnect')}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  void navigator.clipboard.writeText(active.error!).then(
                    () => alert(t('taskErrorCopied')),
                    () => alert(active.error),
                  );
                }}
              >
                {t('taskErrorCopy')}
              </button>
              <button type="button" className="btn btn-sm primary-sm" onClick={() => setTaskErrorOpen(false)}>
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <OnboardingModal
        open={onboardOpen}
        mode="setup"
        status={status}
        account={account}
        project={project || null}
        onClose={() => {
          dismissOnboarding();
          setOnboardOpen(false);
        }}
        onOpenSettings={() => {
          setKernelOpen(true);
        }}
        onLogin={() => {
          void (async () => {
            try {
              const result = await startLoginFlow();
              if (result.account) setAccount(result.account);
              if (result.ok) setAccountError(null);
            } catch (e) {
              setAccountError(e instanceof Error ? e.message : String(e));
            }
            refreshStatus();
            void refreshAccount();
          })();
        }}
        onPickProject={() => {
          void (async () => {
            try {
              const selected = await open({
                directory: true,
                multiple: false,
                title: t('onboardPickProject'),
              });
              if (typeof selected === 'string' && selected.trim()) {
                setProject(selected);
              }
            } catch {
              /* */
            }
          })();
        }}
        onRefresh={refreshStatus}
      />

      <OnboardingModal
        open={tutorialOpen}
        mode="tutorial"
        status={status}
        account={account}
        project={project || null}
        onClose={() => setTutorialOpen(false)}
        onOpenSettings={() => setKernelOpen(true)}
        onLogin={() => undefined}
        onPickProject={() => undefined}
        onRefresh={refreshStatus}
      />

      {reviewOpen ? <Suspense fallback={<DeferredPanelFallback />}><ReviewPanel
        open={reviewOpen}
        cwd={active && active.projectKey !== NO_PROJECT_KEY ? active.cwd || project : project || ''}
        allowWorkspacePreview={Boolean(active && active.projectKey !== NO_PROJECT_KEY ? active.cwd || project : project)}
        tools={activeTools}
        planEntries={activePlanEntries}
        client={active?.client}
        sessionId={active?.sessionId}
        taskBusy={Boolean(active?.busy)}
        onClose={() => setReviewOpen(false)}
        onApplyPlan={
          active && activePlanEntries.length > 0 && !active.busy
            ? () => void applyPlan()
            : undefined
        }
        onTogglePlanEntry={(entryId) => {
          const line = active?.lines.find((l) => l.planEntries?.some((e) => e.id === entryId));
          if (line) togglePlanEntry(line.id, entryId);
        }}
        onToggleAllPlan={(checked) => {
          const line = active?.lines.find((l) => l.planEntries && l.planEntries.length > 0);
          if (line) toggleAllPlanEntries(line.id, checked);
        }}
      /></Suspense> : null}

      {terminalOpen ? <Suspense fallback={<DeferredPanelFallback />}><TerminalDock
        open={terminalOpen}
        cwd={active?.cwd || project}
        onClose={() => setTerminalOpen(false)}
      /></Suspense> : null}

      <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <TaskSearchDialog
        open={taskSearchOpen}
        aliases={projectAliases}
        onClose={() => setTaskSearchOpen(false)}
        onOpenTask={(hit) => void openTaskSearchHit(hit)}
        onSearchKernel={searchKernelSessions}
        onOpenKernelSession={(hit) => void openKernelSearchHit(hit)}
      />

      {kernelOpen ? <Suspense fallback={<DeferredPanelFallback />}><SettingsPanel
        open={kernelOpen}
        onClose={() => {
          setKernelOpen(false);
          setSettingsInitialSection(undefined);
        }}
        grokCmd={grokCmd}
        onGrokCmd={setGrokCmd}
        status={status}
        onRefresh={refreshStatus}
        project={project}
        recentProjects={recentProjects}
        account={account}
        onModelsRefreshed={() => {
          void loadSubscriptionModels(true);
          void reloadLiveModelCatalogs();
        }}
        perm={perm}
        onPerm={setPerm}
        webSearchEnabled={webSearchEnabled}
        onWebSearchEnabled={(enabled) => {
          setWebSearchEnabled(enabled);
          try {
            localStorage.setItem('gorkx.webSearchEnabled', enabled ? '1' : '0');
          } catch {
            /* browser preview */
          }
        }}
        maxAgentTurns={maxAgentTurns}
        onMaxAgentTurns={(turns) => {
          const next = Number.isInteger(turns) && (turns ?? 0) >= 1 && (turns ?? 0) <= 200 ? turns : null;
          setMaxAgentTurns(next);
          try {
            if (next == null) localStorage.removeItem('gorkx.maxAgentTurns');
            else localStorage.setItem('gorkx.maxAgentTurns', String(next));
          } catch {
            /* browser preview */
          }
        }}
        voiceShortcutEnabled={voiceShortcutEnabled}
        onVoiceShortcutEnabled={(enabled) => {
          setVoiceShortcutEnabled(enabled);
          try {
            localStorage.setItem('gorkx.voiceShortcutEnabled', enabled ? '1' : '0');
          } catch {
            /* browser preview */
          }
        }}
        showMessageTimestamps={showMessageTimestamps}
        onShowMessageTimestamps={(enabled) => {
          setShowMessageTimestamps(enabled);
          try {
            localStorage.setItem('gorkx.showMessageTimestamps', enabled ? '1' : '0');
          } catch {
            /* browser preview */
          }
        }}
        newTaskProfile={newTaskProfile}
        onNewTaskProfile={(profile) => {
          const next = profile || 'default';
          setNewTaskProfile(next);
          try { localStorage.setItem('gorkx.newTaskProfile', next); } catch { /* browser preview */ }
        }}
        onOpenMemory={() => setMemoryOpen(true)}
        onOpenTutorial={() => setTutorialOpen(true)}
        onOpenExtensions={() => setExtOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenWorktrees={() => setWorktreePanelOpen(true)}
        onOpenReview={() => setReviewOpen(true)}
        onCaptureDesktop={async () => {
          const path = await captureScreenRegion();
          await addAttachmentPaths([path]);
          return path;
        }}
        onRestoreArchived={(row) => void restoreArchivedTask(row)}
        hooksAvailable={Boolean(active?.client && active?.sessionId)}
        onRefreshHooks={active?.client && active?.sessionId ? refreshLiveHooks : undefined}
        onManageHooks={active?.client && active?.sessionId ? manageLiveHooks : undefined}
        onListCloudEnvironments={() => withCloudClient((client) => client.listCloudEnvironments())}
        onCreateCloudEnvironment={(input) => withCloudClient((client) => client.createCloudEnvironment(input))}
        onUpdateCloudEnvironment={(id, input) => withCloudClient((client) => client.updateCloudEnvironment(id, input))}
        onDeleteCloudEnvironment={(id) => withCloudClient((client) => client.deleteCloudEnvironment(id))}
        onFetchBilling={() => withCloudClient((client) => client.getBilling())}
        onFetchAutoTopup={() => withCloudClient((client) => client.getAutoTopupRule())}
        initialSection={settingsInitialSection}
      /></Suspense> : null}

      {extOpen ? <Suspense fallback={<DeferredPanelFallback />}><ExtensionsPanel
        open={extOpen}
        onClose={() => {
          setExtOpen(false);
          refreshExtensions();
        }}
        project={project}
        grokCmd={grokCmd}
        onRunSkill={runSkill}
        liveClient={active?.client}
        liveSessionId={active?.sessionId}
      /></Suspense> : null}

      <TextPromptModal
        request={textPrompt}
        onCancel={() => {
          textPrompt?.resolve(null);
          setTextPrompt(null);
        }}
        onSubmit={(v) => {
          textPrompt?.resolve(v);
          setTextPrompt(null);
        }}
      />

      <ActionPromptModal
        request={actionPrompt}
        onCancel={() => {
          actionPrompt?.resolve(null);
          setActionPrompt(null);
        }}
        onSubmit={(value) => {
          actionPrompt?.resolve(value);
          setActionPrompt(null);
        }}
      />

      {scheduledOpen ? <Suspense fallback={<DeferredPanelFallback />}><ScheduledPanel
        open={scheduledOpen}
        onClose={() => setScheduledOpen(false)}
        projects={[...pinnedProjects, ...recentProjects].filter(
          (p, i, a) => a.indexOf(p) === i,
        )}
        aliases={projectAliases}
        currentProject={project || undefined}
        onRunJob={runScheduledJob}
        onContinueBackgroundRun={continueBackgroundScheduledRun}
      /></Suspense> : null}

      {memoryOpen ? <Suspense fallback={<DeferredPanelFallback />}><MemoryPanel
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        project={project || undefined}
        grokCmd={grokCmd}
        canCaptureSessionMemory={Boolean(active?.commands?.some((command) => command.name.replace(/^\//, '').toLowerCase() === 'flush'))}
        canOrganizeSessionMemory={Boolean(active?.commands?.some((command) => command.name.replace(/^\//, '').toLowerCase() === 'dream'))}
        canRememberSessionMemory={Boolean(active?.commands?.some((command) => command.name.replace(/^\//, '').toLowerCase() === 'remember'))}
        onRunKernelMemoryAction={(action, note) => {
          const command = action === 'capture'
            ? '/flush'
            : action === 'organize'
              ? '/dream'
              : `/remember ${note || ''}`.trim();
          const visible = action === 'capture'
            ? t('memoryFlushVisible')
            : action === 'organize'
              ? t('memoryDreamVisible')
              : `${t('memoryKernelRememberVisible')}: ${note || ''}`;
          setMemoryOpen(false);
          const kernelCommand = action === 'capture'
            ? 'flush'
            : action === 'organize'
              ? 'dream'
              : 'remember';
          void runNativeDesktopAction(
            visible,
            (agent) => action === 'capture'
              ? agent.client!.flushMemory(agent.sessionId!)
              : agent.client!.runDesktopCommand(agent.sessionId!, kernelCommand, note || ''),
            command,
          );
        }}
      /></Suspense> : null}

      {worktreePanelOpen ? <Suspense fallback={<DeferredPanelFallback />}><WorktreePanel
        open={worktreePanelOpen}
        onClose={() => setWorktreePanelOpen(false)}
        grokCmd={grokCmd}
        project={project || undefined}
        mainProject={worktreeMainProject}
        onCreate={() => {
          setWorktreePanelOpen(false);
          void createThread({ worktree: true });
        }}
        onOpenPath={(path) => {
          try {
            const prev = project || localStorage.getItem('gorkx.project') || '';
            if (prev && prev !== path) {
              const main = worktreeMainProject || prev;
              setWorktreeMainProject(main);
              localStorage.setItem('gorkx.worktreeMainProject', main);
            }
            localStorage.setItem('gorkx.project', path);
          } catch {
            /* */
          }
          setProject(path);
        }}
        onOpenAsTask={(path) => {
          try {
            const prev = project || localStorage.getItem('gorkx.project') || '';
            if (prev && prev !== path) {
              const main = worktreeMainProject || prev;
              setWorktreeMainProject(main);
              localStorage.setItem('gorkx.worktreeMainProject', main);
            }
            localStorage.setItem('gorkx.project', path);
          } catch {
            /* */
          }
          setProject(path);
          void createThread({ cwdOverride: path });
        }}
        onBackToMain={() => {
          const main = worktreeMainProject;
          if (!main) return;
          setProject(main);
          try {
            localStorage.setItem('gorkx.project', main);
            localStorage.removeItem('gorkx.worktreeMainProject');
          } catch {
            /* */
          }
          setWorktreeMainProject(null);
        }}
      /></Suspense> : null}

      {projectInspectPath ? <Suspense fallback={<DeferredPanelFallback />}><ProjectInspectPanel
        open
        project={projectInspectPath}
        grokCmd={grokCmd}
        onClose={() => setProjectInspectPath(null)}
      /></Suspense> : null}

      {taskInfoOpen ? <Suspense fallback={<DeferredPanelFallback />}><TaskInfoPanel
        open
        client={active?.client ?? null}
        sessionId={active?.sessionId ?? null}
        localModelId={active?.modelId || modelId || null}
        localProviderLabel={resolveProviderForModelId(
          active?.modelId || modelId,
          customModelRows,
        )}
        privacyOptOut={account?.codingDataRetentionOptOut}
        onSetPrivacy={active?.client && active?.sessionId ? async (optOut) => {
          await active.client!.setCodingDataRetention(optOut);
          setAccount((current) => current ? { ...current, codingDataRetentionOptOut: optOut } : current);
        } : undefined}
        onClose={() => setTaskInfoOpen(false)}
        onManageAuth={(destination) => {
          setTaskInfoOpen(false);
          setSettingsInitialSection(destination === 'models' ? 'models' : 'account');
          setKernelOpen(true);
        }}
      /></Suspense> : null}

      {activeApproval?.kind === 'permission' ? (
        <PermissionPrompt request={activeApproval.request} onAnswer={(optionId) => void answerPermission(optionId)} />
      ) : null}
      {activeApproval?.kind === 'question' && activeApproval.threadId !== active?.id ? (
        <UserQuestionPrompt
          request={activeApproval.request}
          onAccept={(answers: UserQuestionAnswers, annotations: UserQuestionAnnotations) =>
            void answerUserQuestion(userQuestionAcceptedResult(answers, annotations))
          }
          onPlanAction={(outcome, partialAnswers) =>
            void answerUserQuestion(userQuestionPlanResult(outcome, partialAnswers))
          }
          onCancel={() => void answerUserQuestion(userQuestionCancelledResult())}
        />
      ) : null}
      {activeApproval?.kind === 'plan' ? (
        <PlanApprovalPrompt
          request={activeApproval.request}
          onAnswer={(outcome, feedback) => void answerPlanApproval(outcome, feedback)}
        />
      ) : null}
      {activeApproval?.kind === 'trust' ? (
        <FolderTrustPrompt request={activeApproval.request} onAnswer={(outcome) => void answerFolderTrust(outcome)} />
      ) : null}
      <ApprovalInboxPanel
        open={approvalInboxOpen}
        rows={approvalInboxRows}
        activeKey={activeApproval?.key ?? null}
        onClose={() => setApprovalInboxOpen(false)}
        onSelect={(key) => {
          const entry = approvalQueue.find((item) => item.key === key);
          setActiveApprovalKey(key);
          setApprovalInboxOpen(false);
          // Always return to the origin task before answering.
          if (entry) focusThreadFromRunCenter(entry.threadId);
        }}
      />
      <DeliverablesPanel
        open={deliverablesOpen}
        items={activeDeliverables}
        links={activeDeliverableLinks}
        taskTitle={active?.title}
        onClose={() => setDeliverablesOpen(false)}
        onOpen={(item) => {
          setDeliverablesOpen(false);
          setPreviewAtt(item);
        }}
        onReveal={(path) => {
          void revealInFinder(path).catch(() => {});
        }}
        onCopySummary={async (text) => {
          try {
            await navigator.clipboard.writeText(text);
            alert(t('deliverablesCopied'));
          } catch {
            alert(text);
          }
        }}
        onExportTask={() => void exportActiveSession()}
        canExport={Boolean(active?.sessionId && !active.busy)}
      />
      {rewindDialog ? (
        <RewindDialog
          points={rewindDialog.points}
          busy={rewindDialog.busy}
          error={rewindDialog.error}
          preview={rewindDialog.preview}
          onClose={() => setRewindDialog(null)}
          onConfirm={(point, mode, force) => void executeRewind(point, mode, force)}
        />
      ) : null}
    </div>
  );
}

export default App;
