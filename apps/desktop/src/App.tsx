import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import {
  AcpClient,
  extractUpdateText,
  fetchGrokStatus,
  stopAllAgents,
  parsePlanUpdate,
  parseSubagentUpdate,
  isToolCallIdLike,
  parseToolUpdate,
  permissionResult,
  pickPermissionOption,
  type GrokStatus,
  type ModelInfo,
  type PermissionMode,
  type PermissionRequest,
  type ReasoningEffort,
  type SessionUpdate,
} from './lib/acpClient';
import { SettingsPanel, type ArchivedTaskRow } from './components/SettingsPanel';
import { ToolTimeline, type ToolEvent } from './components/ToolTimeline';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { ExtensionsPanel } from './components/ExtensionsPanel';
import { MessageList, type ChatLine } from './components/MessageList';
import { AttachmentStrip } from './components/AttachmentStrip';
import { AttachmentPreview } from './components/AttachmentPreview';
import { ReviewPanel } from './components/ReviewPanel';
import { TerminalDock } from './components/TerminalDock';
import {
  TextPromptModal,
  type TextPromptRequest,
} from './components/TextPromptModal';
import { MemoryPanel } from './components/MemoryPanel';
import {
  OnboardingModal,
  dismissOnboarding,
  isOnboardingDismissed,
} from './components/OnboardingModal';

import { WorktreePanel } from './components/WorktreePanel';
import { ProcessPanel } from './components/ProcessPanel';
import { PlusMenu, type PlusAction } from './components/PlusMenu';
import { ProjectPicker, type ProjectPickerAction } from './components/ProjectPicker';
import { ScheduledPanel } from './components/ScheduledPanel';
import {
  type ScheduledJob,
  computeNextRun,
  computeRetryRun,
  loadPersistentJobs,
  savePersistentJobs,
} from './lib/scheduled';
import { fetchMemoryInjection, recordSessionMemory } from './lib/memory';
import { listCustomModels } from './lib/modelsConfig';
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
  inspectProject,
} from './lib/grokAdmin';
import {
  attachmentsPromptBlock,
  attachmentResourceLinks,
  buildAttachment,
  createNamedProject,
  projectsRoot,
  revokeAttachment,
  type ComposerAttachment,
} from './lib/attachments';
import { captureScreenRegion } from './lib/host';
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
} from './lib/threads';
import { ContextRing } from './components/ContextRing';
import { MicIcon, PermShieldIcon } from './components/ComposerIcons';
import { SidebarNav } from './components/SidebarNav';
import { ThreadListRow } from './components/ThreadListRow';
import { AccountAvatar } from './components/AccountAvatar';
import { PermissionPrompt } from './components/PermissionPrompt';
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
} from './lib/account';
import type { AccountSummary } from './lib/account';
import {
  checkAppUpdate,
  installAppUpdate,
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
  isVoiceInputSupported,
  VoiceInputSession,
} from './lib/voiceInput';
import './App.css';

export type ChatMode = 'agent' | 'plan';

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
  commands?: Array<{ name: string; description?: string }>;
  /** Last activity — sidebar sort / same-title disambiguation */
  updatedAt?: number;
  /** Hermes: inject once on first real user prompt */
  memoryInject?: string | null;
  memoryInjected?: boolean;
  /** user turns completed — for auto-learn */
  userTurnCount?: number;
  /** Active /goal for this task (banner + persist; agent owns execution) */
  sessionGoal?: SessionGoal | null;
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
  const [perm, setPerm] = useState<PermissionMode>(() => {
    const v = localStorage.getItem('gorkx.perm');
    return v === 'auto' || v === 'full' ? v : 'default';
  });
  const [chatMode, setChatMode] = useState<ChatMode>(() => {
    return localStorage.getItem('gorkx.chatMode') === 'plan' ? 'plan' : 'agent';
  });
  const [effort, setEffort] = useState<ReasoningEffort>(() => {
    const v = localStorage.getItem('gorkx.effort');
    return v === 'low' || v === 'medium' || v === 'high' ? v : 'high';
  });
  const [modelId, setModelId] = useState(() => localStorage.getItem('gorkx.modelId') ?? '');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
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
  const [kernelOpen, setKernelOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(() => {
    // Default closed on first launch (empty Review is noisy); remember preference.
    const v = localStorage.getItem('gorkx.reviewOpen');
    return v === '1' || v === 'true';
  });
  const [terminalOpen, setTerminalOpen] = useState(() => {
    const v = localStorage.getItem('gorkx.terminalOpen');
    return v === '1' || v === 'true';
  });

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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  /** Capability armed in composer (user completes request in chat). */
  const [capabilityArm, setCapabilityArm] = useState<{
    prefix: string;
    label: string;
  } | null>(null);
  const [permReq, setPermReq] = useState<PermissionRequest | null>(null);
  const [permAgentId, setPermAgentId] = useState<string | null>(null);
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
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const voiceSessionRef = useRef<VoiceInputSession | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  /** Local-only nickname for the sidebar chip (API name stays unchanged). */
  const [nameOverride, setNameOverride] = useState(() => loadDisplayNameOverride());
  const [nameEditOpen, setNameEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [onboardOpen, setOnboardOpen] = useState(false);
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
        initialAttachments?: ComposerAttachment[];
      }) => Promise<{ ok: boolean; error?: string }>)
    | null
  >(null);
  const reconnectRef = useRef<((id: string) => Promise<AcpClient | null>) | null>(null);
  const threadsRef = useRef<Thread[]>([]);
  /** Prevent reconnect storm if agent keeps dying */
  const autoReconnectTried = useRef<Set<string>>(new Set());

  const active = useMemo(() => {
    const th = threads.find((x) => x.id === activeId) ?? null;
    if (!th) return null;
    // Only show threads for current project scope
    if (th.projectKey !== projectScopeKey(project) || th.archived) return null;
    return th;
  }, [threads, activeId, project]);
  threadsRef.current = threads;

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
    localStorage.setItem('gorkx.effort', effort);
  }, [effort]);
  useEffect(() => {
    if (modelId) localStorage.setItem('gorkx.modelId', modelId);
  }, [modelId]);
  useEffect(() => {
    localStorage.setItem('gorkx.grokCmd', grokCmd);
  }, [grokCmd]);
  useEffect(() => {
    localStorage.setItem('gorkx.reviewOpen', reviewOpen ? '1' : '0');
  }, [reviewOpen]);
  useEffect(() => {
    localStorage.setItem('gorkx.terminalOpen', terminalOpen ? '1' : '0');
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
          toolStatus: l.toolStatus,
          toolKind: l.toolKind,
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
  }, [project, cycleThread, focusComposer]);

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
    if (!status) return;
    const kernelOk = Boolean(status.installed);
    const authOk = Boolean(
      status.authenticated || account?.authenticated || account?.email,
    );
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

  /** Merge custom [model.*] rows into the composer picker. */
  const loadCustomModels = useCallback(async () => {
    const snap = await listCustomModels();
    if (!snap?.customModels?.length && !snap?.defaultModel) return;
    const custom: ModelInfo[] = (snap.customModels ?? []).map((m) => ({
      modelId: m.model || m.id,
      name: m.name ? `${m.name} · custom` : `${m.model || m.id} · custom`,
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

  useEffect(() => {
    void loadCustomModels();
  }, [loadCustomModels]);

  useEffect(() => {
    if (!status?.authenticated) return;
    void loadSubscriptionModels(false);
    void loadSubscriptionModels(true);
  }, [status?.authenticated, loadSubscriptionModels]);

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

  /** Insert skill into composer; user completes the request in chat. */
  const runSkill = useCallback(
    (skill: SkillInfo) => {
      const cmd = `/${skill.name} `;
      setDraft(cmd);
      setSlashOpen(false);
      setPlusMenuOpen(false);
      setCapabilityArm({ prefix: `/${skill.name}`, label: skill.name });
      window.setTimeout(() => {
        const el = document.querySelector(
          '.composer textarea',
        ) as HTMLTextAreaElement | null;
        el?.focus();
        el?.setSelectionRange(cmd.length, cmd.length);
      }, 30);
      if (!active && project) {
        void createThreadRef.current?.();
      }
    },
    [active, project],
  );

  /**
   * Arm a Grok capability in the composer: user finishes the request in chat
   * (no modal). Next Enter sends the real slash/tool line to the agent.
   */
  const stageCapability = useCallback((prefix: string, label: string) => {
    const p = prefix.startsWith('/') ? prefix : `/${prefix}`;
    const staged = p.endsWith(' ') ? p : `${p} `;
    setPlusMenuOpen(false);
    setSlashOpen(false);
    setAtOpen(false);
    setDraft(staged);
    setCapabilityArm({ prefix: staged.trim(), label });
    // Focus active composer textarea after paint
    window.setTimeout(() => {
      const el = document.querySelector(
        '.composer textarea',
      ) as HTMLTextAreaElement | null;
      el?.focus();
      const len = staged.length;
      el?.setSelectionRange(len, len);
    }, 30);
  }, []);

  /** Only for actions that must fire immediately (flush/dream with no extra text). */
  const applySlashCommand = useCallback(
    async (line: string) => {
      const cmd = line.startsWith('/') ? line : `/${line}`;
      setPlusMenuOpen(false);
      setSlashOpen(false);
      setCapabilityArm(null);
      if (!active?.client || !active.sessionId) {
        setDraft(cmd.endsWith(' ') ? cmd : `${cmd} `);
        return;
      }
      appendLine(active.id, { id: nid(), role: 'user', text: cmd });
      patchThread(active.id, { busy: true, error: null });
      try {
        await active.client.prompt(active.sessionId, cmd);
      } catch (e) {
        patchThread(active.id, {
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        patchThread(active.id, { busy: false });
      }
    },
    [active],
  );

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
              failureCount: 0,
              lastError: null,
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
              const result = await createThreadRef.current?.({ initialPrompt: job.prompt });
              if (result?.ok) continue;
              // Re-read so a user edit or a different due job cannot be
              // overwritten by this failure record.
              const current = await loadPersistentJobs();
              const failureCount = (current.find((item) => item.id === job.id)?.failureCount ?? 0) + 1;
              const error = (result?.error || '调度执行器未就绪').slice(0, 500);
              await savePersistentJobs(
                current.map((item) =>
                  item.id === job.id
                    ? {
                        ...item,
                        failureCount,
                        lastError: error,
                        nextRunAt: computeRetryRun(failureCount, Date.now()),
                      }
                    : item,
                ),
              );
            } catch {
              const current = await loadPersistentJobs();
              const failureCount = (current.find((item) => item.id === job.id)?.failureCount ?? 0) + 1;
              await savePersistentJobs(
                current.map((item) =>
                  item.id === job.id
                    ? {
                        ...item,
                        failureCount,
                        lastError: '调度过程发生未预期错误',
                        nextRunAt: computeRetryRun(failureCount, Date.now()),
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
    setThreads((prev) =>
      prev.map((th) => (th.id === threadId ? { ...th, lines: [...th.lines, line] } : th)),
    );
  }, []);

  const appendOrMerge = useCallback(
    (
      threadId: string,
      role: ChatLine['role'],
      chunk: string,
      toolKey?: string,
      meta?: { toolStatus?: string; toolKind?: string },
    ) => {
      if (!chunk && !toolKey) return;
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
              };
              return { ...th, lines };
            }
            lines.push({
              id: nid(),
              role,
              text: chunk || meta?.toolKind || '工具调用',
              toolKey,
              toolStatus: meta?.toolStatus,
              toolKind: meta?.toolKind,
            });
            return { ...th, lines };
          }
          const last = lines[lines.length - 1];
          if (last && last.role === role && !last.toolKey) {
            lines[lines.length - 1] = { ...last, text: last.text + chunk };
          } else {
            lines.push({ id: nid(), role, text: chunk });
          }
          return { ...th, lines };
        }),
      );
    },
    [],
  );

  const wireClient = useCallback(
    (threadId: string, client: AcpClient) => {
      client.onSessionUpdate = (update: SessionUpdate) => {
        const subagent = parseSubagentUpdate(update);
        if (subagent) {
          appendOrMerge(threadId, 'tool', subagent.label, `subagent:${subagent.subagentId}`, {
            toolStatus: subagent.status,
            toolKind: subagent.kind,
          });
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
        if (kind === 'text') appendOrMerge(threadId, 'assistant', text);
        else if (kind === 'thought') appendOrMerge(threadId, 'thought', text);
        else if (kind === 'user' && text) {
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
        setPermAgentId(threadId);
        setPermReq(req);
        void notifyPermission(
          'gorkX',
          'Permission required — open the app to approve or reject.',
        );
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

      client.onUsageMeta = (meta) => {
        const u = usageFromUnknown(meta);
        if (u) patchThread(threadId, { usage: u });
      };

      client.onStderr = (line) => {
        if (/error|Error|panic|failed/i.test(line)) {
          appendLine(threadId, { id: nid(), role: 'system', text: line });
        }
      };

      client.onExit = () => {
        patchThread(threadId, {
          busy: false,
          client: null,
          error: 'Agent process exited',
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
    [appendLine, appendOrMerge, patchThread],
  );

  /**
   * Rehydrate only the engine's currently-running child tasks after a session
   * load. Finished tasks come from the persisted session replay; this query is
   * solely for work that survived while the desktop process was absent.
   */
  const reconcileRunningSubagents = useCallback(
    async (threadId: string, client: AcpClient, sessionId: string) => {
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
        if (!rows.length) return;
        setThreads((prev) =>
          prev.map((thread) => {
            if (thread.id !== threadId) return thread;
            const lines = [...thread.lines];
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
        // This extension is optional on older kernels. Session replay remains
        // usable even when a running-list probe is unavailable.
      }
    },
    [],
  );

  const bootstrapClient = useCallback(async () => {
    const client = await AcpClient.start(perm, grokCmd || undefined, effort);
    await client.initialize();
    await client.authenticate('cached_token');
    return client;
  }, [perm, grokCmd, effort]);

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
      let client: AcpClient | null = null;
      try {
        client = await bootstrapClient();
        await client.deleteSession(sessionId);
      } catch {
        /* still hide locally if kernel rejects */
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
        client = await bootstrapClient();
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
    insertSlash(name);
  };

  /**
   * Real plan mode:
   * 1) session/set_mode plan|default when a session exists
   * 2) Grok TUI path: arm /plan in composer so the next chat turn enters plan mode
   * Without a live session, only (2)+preference — createThread will set_mode on new.
   */
  const changeChatMode = async (next: ChatMode) => {
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
      // Always arm /plan in chat — Grok activates plan on the next prompt
      stageCapability('/plan', t('modePlan'));
      if (active) {
        appendLine(active.id, {
          id: nid(),
          role: 'system',
          text: setModeOk
            ? t('planModeOnHint')
            : setModeErr
              ? `${t('planModeOnSlashFallback')} (${setModeErr})`
              : t('planModeOnSlashFallback'),
        });
      }
      return;
    }

    // Leave plan mode
    setCapabilityArm(null);
    if (draft.startsWith('/plan')) setDraft('');
    if (active) {
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
      case 'pick-project':
        setPlusMenuOpen(false);
        setProjectPickerOpen(true);
        return;
      case 'terminal':
        setTerminalOpen(true);
        localStorage.setItem('gorkx.terminalOpen', '1');
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
      case 'stage':
        stageCapability(action.cmd, action.label);
        return;
      case 'send-now':
        if (action.cmd === '/new' || action.cmd === '/clear') {
          selectThread(null);
          setDraft('');
          setCapabilityArm(null);
          return;
        }
        await applySlashCommand(action.cmd);
        return;
      case 'skill':
        stageCapability(`/${action.skill.name}`, action.skill.name);
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
    const fromBuiltins = builtins.filter((c) => !names.has(c.name.toLowerCase()));
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

  const removeProjectFromApp = (path: string) => {
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
    // Optional: clear saved thread index for this project (not disk code)
    void clearProjectStore(path);
  };

  /** Rename session title (UI + SQLite meta only). */
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
    patchThread(id, { title: uniquifyThreadTitle(raw, siblings, id) });
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
    initialAttachments?: ComposerAttachment[];
  }) => {
    const useWorktree = Boolean(opts?.worktree);
    const initialPrompt = (opts?.initialPrompt || '').trim();
    const initialAttachments = opts?.initialAttachments || [];
    const cwdOverride = (opts?.cwdOverride || '').trim();
    if (useWorktree && !project && !cwdOverride) {
      alert(t('worktreeNeedProject'));
      return { ok: false, error: t('worktreeNeedProject') };
    }
    const scope = projectScopeKey(cwdOverride || project);
    const cwdBase = cwdOverride || project || (await homeDir());
    const id = tid();
    const rawSeed = initialPrompt
      ? titleFromUserText(initialPrompt) || (project ? t('newThread') : t('inboxChat'))
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
        archived: false,
        updatedAt: createdAt,
      },
    ]);
    selectThread(id);
    try {
      const client = await bootstrapClient();
      wireClient(id, client);
      const session = await client.newSession(cwdBase);
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
      try {
        memInject = await fetchMemoryInjection(project || undefined);
      } catch {
        memInject = '';
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
      });

      // Home-style: first message creates the session
      if (initialPrompt) {
        const userVisible =
          initialPrompt.replace(/\n\n\[Attached files[\s\S]*$/i, '').trim() || initialPrompt;
        const goalParsed = parseGoalCommand(userVisible);
        if (goalParsed?.text && !goalParsed.sub) {
          patchThread(id, { sessionGoal: makeGoal(goalParsed.text) });
        }
        appendLine(id, {
          id: nid(),
          role: 'user',
          text: userVisible,
          attachments: initialAttachments.length ? initialAttachments : undefined,
        });
        const enginePrompt = memInject
          ? `${memInject}\n\n---\n\n用户请求：\n${initialPrompt}`
          : initialPrompt;
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
          patchThread(id, {
            error,
          });
          return { ok: false, error };
        } finally {
          patchThread(id, { busy: false });
          // Auto-learn: persist session dump after first turn
          void recordSessionMemory(
            project || undefined,
            seedTitle,
            userVisible.slice(0, 2000),
          );
        }
      }
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      patchThread(id, {
        busy: false,
        error,
      });
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
        const client = await bootstrapClient();
        wireClient(existing.id, client);
        const cwdBase = existing.cwd || project || (await homeDir());
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
      const client = await bootstrapClient();
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

  const send = async () => {
    const text = draft.trim();
    const atts = composerAtts;
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
    if (!live?.client || !live.sessionId) {
      if (live?.busy) return;
      if (!active || !active.sessionId) {
        setDraft('');
        setComposerAtts([]);
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
      // Capture goal for banner + persist; still send full /goal line to the agent.
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

    setDraft('');
    setComposerAtts([]);
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
    let engineBody = promptBody;
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
        engineBody = `${inject}\n\n---\n\n用户请求：\n${promptBody}`;
        markInjected = true;
      }
    }
    try {
      const result = await client.prompt(sessionId, engineBody, attachmentResourceLinks(atts));
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

  const mapVoiceError = (code: string): string => {
    if (code === 'unsupported') return t('voiceUnsupported');
    if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'PermissionDeniedError') {
      return t('voiceErrorDenied');
    }
    if (code === 'network') return t('voiceErrorNetwork');
    if (code === 'no-speech') return t('voiceErrorNoSpeech');
    if (code === 'no-device' || code === 'NotFoundError') return t('voiceErrorNoDevice');
    if (code === 'no-mediadevices') return t('voiceUnsupported');
    return `${t('voiceErrorGeneric')} (${code})`;
  };

  const stopVoiceInput = useCallback(() => {
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = null;
    setVoiceListening(false);
  }, []);

  const toggleVoiceInput = useCallback(() => {
    if (voiceSessionRef.current?.isListening()) {
      stopVoiceInput();
      setVoiceHint(null);
      return;
    }
    if (!isVoiceInputSupported()) {
      setVoiceHint(t('voiceUnsupported'));
      window.setTimeout(() => setVoiceHint(null), 3200);
      return;
    }
    setVoiceHint(t('voiceListening'));
    const session = new VoiceInputSession({
      onDraft: (text) => setDraft(text),
      onListeningChange: (on) => {
        setVoiceListening(on);
        if (on) setVoiceHint(t('voiceListening'));
        else setVoiceHint((h) => (h === t('voiceListening') ? null : h));
      },
      onError: (code) => {
        setVoiceHint(mapVoiceError(code));
        window.setTimeout(() => setVoiceHint(null), 3600);
      },
    });
    voiceSessionRef.current = session;
    session.start(draftRef.current);
  }, [stopVoiceInput]);

  useEffect(() => {
    return () => {
      voiceSessionRef.current?.dispose();
      voiceSessionRef.current = null;
    };
  }, []);

  /** Send /goal subcommand; optimistic local status when applicable. */
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
    const line = `/goal ${sub}`;
    if (!active.client || !active.sessionId) {
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text: t('goalNoSession'),
      });
      return;
    }
    appendLine(active.id, { id: nid(), role: 'user', text: line });
    patchThread(active.id, { busy: true, error: null });
    try {
      await active.client.prompt(active.sessionId, line);
    } catch (e) {
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text: `${t('goalCmdFail')}: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      patchThread(active.id, { busy: false });
    }
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
      const client = await AcpClient.start(perm, grokCmd || undefined, next);
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
        client = await bootstrapClient();
        await client.deleteSession(th.sessionId);
      } catch {
        /* local remove still */
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
      const client = await AcpClient.start(perm, grokCmd || undefined, th.effort || effort);
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
        x.id === id ? { ...x, client, busy: false, error: null } : x,
      );
      patchThread(id, { client, busy: false, error: null });
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

  const answerPermission = async (prefer: 'allow' | 'reject' | string) => {
    if (!permReq || !permAgentId) return;
    const th = threads.find((x) => x.id === permAgentId);
    const optionId =
      prefer === 'allow' || prefer === 'reject'
        ? pickPermissionOption(permReq.options, prefer)
        : prefer;
    if (th?.client) {
      await th.client.respond(permReq.jsonrpcId, permissionResult(optionId));
    }
    setPermReq(null);
    setPermAgentId(null);
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
              <IconSearch size={14} />
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
                            void inspectProject(p, grokCmd || undefined)
                              .then((raw) => {
                                try {
                                  alert(JSON.stringify(JSON.parse(raw), null, 2).slice(0, 3500));
                                } catch {
                                  alert(raw.slice(0, 3500));
                                }
                              })
                              .catch((e) => alert(String(e)));
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
                      {live.map((th) => (
                        <ThreadListRow
                          key={th.id}
                          thread={th}
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
                      ))}
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
              return inbox.map((th) => (
                <ThreadListRow
                  key={th.id}
                  thread={th}
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
              ));
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
              title={account?.email || t('subBadgeFull')}
              onClick={() => {
                setAccountMenuOpen((v) => !v);
                void refreshAccount();
              }}
            >
              <AccountAvatar
                src={account?.avatarUrl}
                label={
                  uiDisplayName(account, nameOverride) ||
                  account?.displayName ||
                  account?.email ||
                  '?'
                }
                guest={!status?.authenticated && !account?.authenticated}
              />
              <span className="account-meta">
                <span className="account-name">
                  {!status?.installed
                    ? t('statusMissing')
                    : !status?.authenticated && !account?.authenticated
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
                  {account?.creditUsagePercent != null
                    ? `已用 ${Math.round(account.creditUsagePercent)}% · 剩 ${Math.max(0, Math.round(100 - account.creditUsagePercent))}%`
                    : account?.quotaLabel?.replace(/\s*·\s*重置.*$/, '') ||
                      (status?.authenticated || account?.authenticated
                        ? account?.membershipLabel || '—'
                        : '—')}
                </span>
              </span>
            </button>
            {accountMenuOpen ? (
              <div className="account-menu" role="menu">
                {status?.authenticated || account?.authenticated ? (
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
                          : account?.quotaLabel || accountError || '—'}
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
              <div className="starter-grid">
                {(
                  [
                    [
                      'starterExplore',
                      'starterExploreHint',
                      'Explore the repository structure and summarize the architecture.',
                    ],
                    [
                      'starterBug',
                      'starterBugHint',
                      'Help me find and fix a bug. Ask me for symptoms or logs first if needed.',
                    ],
                    [
                      'starterFeature',
                      'starterFeatureHint',
                      'Help me design and implement a new feature end-to-end.',
                    ],
                    [
                      'starterTest',
                      'starterTestHint',
                      'Add focused tests for the most important paths in this project.',
                    ],
                  ] as const
                ).map(([titleKey, hintKey, prompt]) => (
                  <button
                    key={titleKey}
                    type="button"
                    className="starter-card"
                    onClick={() => {
                      void createThread({ initialPrompt: prompt });
                    }}
                  >
                    <strong>{t(titleKey)}</strong>
                    <span>{t(hintKey)}</span>
                  </button>
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
                        skills={extSnap?.skills ?? []}
                        hasActiveSession={false}
                        availableCommandNames={
                          // Prefer last live session's commands; else builtins cache
                          threads.find((th) => th.commands?.length)?.commands?.map((c) =>
                            c.name.replace(/^\//, ''),
                          ) ?? [
                            'plan',
                            'goal',
                            'compact',
                            'diff',
                            'review',
                            'memory',
                            'fork',
                            'worktree',
                            'imagine',
                            'flush',
                            'dream',
                          ]
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
                          {modelShortLabel(
                            modelId || availableModels[0]?.modelId || '',
                            availableModels,
                          ) || 'model'}
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
                      className={`composer-icon-btn voice-btn${voiceListening ? ' listening' : ''}`}
                      title={voiceListening ? t('voiceInputStop') : t('voiceInput')}
                      aria-pressed={voiceListening}
                      onClick={() => toggleVoiceInput()}
                    >
                      <MicIcon active={voiceListening} />
                    </button>
                    <button
                      type="button"
                      className="btn-send"
                      title={t('send')}
                      disabled={!draft.trim() && composerAtts.length === 0}
                      onClick={() => {
                        stopVoiceInput();
                        void send();
                      }}
                    >
                      ↑
                    </button>
                  </div>
                </div>
                {voiceHint ? <div className="voice-hint">{voiceHint}</div> : null}
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
                <span className="pill err" title={active.error}>
                  {t('error')}
                </span>
              ) : null}
              {active.sessionId ? (
                <>
                  <button
                    type="button"
                    className="chrome-btn"
                    title={t('exportSession')}
                    aria-label={t('exportSession')}
                    disabled={active.busy}
                    onClick={() => {
                      void (async () => {
                        try {
                          const path = await save({
                            defaultPath: `gorkx-${active.sessionId!.slice(0, 8)}.md`,
                            filters: [{ name: 'Markdown', extensions: ['md'] }],
                          });
                          if (typeof path !== 'string' || !path) return;
                          await exportSessionMarkdown(active.sessionId!, path, grokCmd || undefined);
                          alert(`${t('exportSessionDone')}: ${path}`);
                        } catch (e) {
                          try {
                            await exportSessionClipboard(active.sessionId!, grokCmd || undefined);
                            alert(t('exportSessionClipboard'));
                          } catch (e2) {
                            alert(e2 instanceof Error ? e2.message : String(e));
                          }
                        }
                      })();
                    }}
                  >
                    <IconExport />
                  </button>
                  <button
                    type="button"
                    className="chrome-btn"
                    title={t('forkSession')}
                    aria-label={t('forkSession')}
                    disabled={active.busy || !active.client}
                    onClick={() => {
                      void (async () => {
                        if (!active.client || !active.sessionId) return;
                        appendLine(active.id, { id: nid(), role: 'user', text: '/fork' });
                        patchThread(active.id, { busy: true, error: null });
                        try {
                          await active.client.prompt(active.sessionId, '/fork');
                        } catch (e) {
                          patchThread(active.id, {
                            error: e instanceof Error ? e.message : String(e),
                          });
                        } finally {
                          patchThread(active.id, { busy: false });
                        }
                      })();
                    }}
                  >
                    <IconFork />
                  </button>
                </>
              ) : null}
            </header>
            {/* Goal console: persist + /goal subcommands + plan-based progress */}
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
              showProcessInChat={false}
            />
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
                <div className="composer-send-row">
                  <div className="composer-toolbar-left">
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
                        skills={extSnap?.skills ?? []}
                        hasActiveSession={Boolean(active.client && active.sessionId)}
                        availableCommandNames={(active.commands ?? []).map((c) =>
                          c.name.replace(/^\//, ''),
                        )}
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
                          {modelShortLabel(
                            modelId || availableModels[0]?.modelId || '',
                            availableModels,
                          ) || 'model'}
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
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                    <button
                      type="button"
                      className={`composer-icon-btn voice-btn${voiceListening ? ' listening' : ''}`}
                      title={voiceListening ? t('voiceInputStop') : t('voiceInput')}
                      aria-pressed={voiceListening}
                      disabled={active.busy}
                      onClick={() => toggleVoiceInput()}
                    >
                      <MicIcon active={voiceListening} />
                    </button>
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
                          stopVoiceInput();
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
                {voiceHint ? <div className="voice-hint">{voiceHint}</div> : null}
              </div>
            </div>
          </>
        )}
      </main>

      <AttachmentPreview item={previewAtt} onClose={() => setPreviewAtt(null)} />

      <OnboardingModal
        open={onboardOpen}
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

      <ReviewPanel
        open={reviewOpen}
        cwd={active?.cwd || project}
        tools={activeTools}
        planEntries={activePlanEntries}
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
      />

      <TerminalDock
        open={terminalOpen}
        cwd={active?.cwd || project}
        onClose={() => setTerminalOpen(false)}
      />

      <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <SettingsPanel
        open={kernelOpen}
        onClose={() => setKernelOpen(false)}
        grokCmd={grokCmd}
        onGrokCmd={setGrokCmd}
        status={status}
        onRefresh={refreshStatus}
        project={project}
        recentProjects={recentProjects}
        account={account}
        onModelsRefreshed={() => {
          void loadSubscriptionModels(true);
          void loadCustomModels();
        }}
        perm={perm}
        onPerm={setPerm}
        onOpenMemory={() => setMemoryOpen(true)}
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
      />

      <ExtensionsPanel
        open={extOpen}
        onClose={() => {
          setExtOpen(false);
          refreshExtensions();
        }}
        project={project}
        grokCmd={grokCmd}
        onRunSkill={runSkill}
      />

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

      <ScheduledPanel
        open={scheduledOpen}
        onClose={() => setScheduledOpen(false)}
        projects={[...pinnedProjects, ...recentProjects].filter(
          (p, i, a) => a.indexOf(p) === i,
        )}
        aliases={projectAliases}
        currentProject={project || undefined}
        onRunJob={runScheduledJob}
      />

      <MemoryPanel
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        project={project || undefined}
        grokCmd={grokCmd}
        onSendSlash={(cmd) => {
          setMemoryOpen(false);
          if (!active?.client || !active.sessionId) {
            setDraft(cmd.startsWith('/') ? cmd : `/${cmd}`);
            return;
          }
          void (async () => {
            const line = cmd.startsWith('/') ? cmd : `/${cmd}`;
            appendLine(active.id, { id: nid(), role: 'user', text: line });
            patchThread(active.id, { busy: true, error: null });
            try {
              await active.client!.prompt(active.sessionId!, line);
            } catch (e) {
              patchThread(active.id, {
                error: e instanceof Error ? e.message : String(e),
              });
            } finally {
              patchThread(active.id, { busy: false });
            }
          })();
        }}
      />

      <WorktreePanel
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
      />

      {permReq ? (
        <PermissionPrompt request={permReq} onAnswer={(optionId) => void answerPermission(optionId)} />
      ) : null}
    </div>
  );
}

export default App;
