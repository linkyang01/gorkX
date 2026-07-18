import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import {
  AcpClient,
  extractUpdateText,
  fetchGrokStatus,
  stopAllAgents,
  parsePlanUpdate,
  formatToolLine,
  permissionResult,
  pickPermissionOption,
  type GrokStatus,
  type ModelInfo,
  type PermissionMode,
  type PermissionRequest,
  type ReasoningEffort,
  type SessionUpdate,
} from './lib/acpClient';
import { SettingsPanel } from './components/SettingsPanel';
import { ToolTimeline, type ToolEvent } from './components/ToolTimeline';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { ExtensionsPanel } from './components/ExtensionsPanel';
import { MessageList, type ChatLine } from './components/MessageList';
import { ReviewPanel } from './components/ReviewPanel';
import { TerminalDock } from './components/TerminalDock';
import {
  loadPinnedProjects,
  loadProjectAliases,
  loadRecentProjects,
  orderedProjects,
  projectDisplayName,
  pushRecentProject,
  removeRecentProject,
  setProjectAlias,
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
import {
  fetchAccountSummary,
  fetchModelContext,
  fetchSubscriptionModels,
} from './lib/account';
import type { AccountSummary } from './lib/account';
import {
  estimateContextUsed,
  formatContextBar,
  formatUsage,
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
}

interface RecentSession {
  sessionId: string;
  title?: string | null;
  cwd?: string;
  modelId?: string;
  lastChangeUnixMs?: number;
}

const MAX_THREADS = 4;
let lineSeq = 1;
const nid = () => `n${lineSeq++}`;

function metaToStub(m: ThreadMeta, lines?: ChatLine[]): Thread {
  return {
    id: m.id,
    title: m.title || m.sessionId?.slice(0, 8) || 'session',
    sessionId: m.sessionId,
    modelId: m.modelId,
    client: null,
    lines:
      lines && lines.length > 0
        ? lines
        : [
            {
              id: nid(),
              role: 'system',
              text: t('restoredHint'),
            },
          ],
    busy: false,
    error: null,
    chatMode: m.chatMode === 'plan' ? 'plan' : 'agent',
    worktreePath: m.worktreePath,
    cwd: m.cwd,
    projectKey: projectScopeKey(m.project),
    archived: Boolean(m.archived),
    effort: m.effort || 'high',
  };
}

function snapToLines(
  snaps: Array<{
    id: string;
    role: string;
    text: string;
    toolKey?: string | null;
    toolStatus?: string | null;
    toolKind?: string | null;
  }>,
): ChatLine[] {
  return snaps.map((s) => ({
    id: s.id,
    role: (['user', 'assistant', 'thought', 'tool', 'system', 'plan'].includes(s.role)
      ? s.role
      : 'system') as ChatLine['role'],
    text: s.text,
    toolKey: s.toolKey ?? undefined,
    toolStatus: s.toolStatus ?? undefined,
    toolKind: s.toolKind ?? undefined,
  }));
}

function App() {
  const [project, setProject] = useState(() => localStorage.getItem('gorkx.project') ?? '');
  const [recentProjects, setRecentProjects] = useState<string[]>(() => loadRecentProjects());
  const [pinnedProjects, setPinnedProjects] = useState<string[]>(() => loadPinnedProjects());
  const [projectAliases, setProjectAliases] = useState(() => loadProjectAliases());
  const [projectMenuPath, setProjectMenuPath] = useState<string | null>(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  /** Opt-in: show Grok kernel history under selected project (not auto-loaded). */
  const [showGrokHistory, setShowGrokHistory] = useState(false);
  const [grokHistoryLoading, setGrokHistoryLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const permModeRef = useRef(perm);
  permModeRef.current = perm;
  const createThreadRef = useRef<((opts?: { worktree?: boolean }) => Promise<void>) | null>(null);
  const reconnectRef = useRef<((id: string) => Promise<void>) | null>(null);
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
          if (cur?.client) continue;
          byId.set(s.id, s);
        }
        // Keep any other live/prev threads not in loaded (e.g. brand-new not yet flushed)
        for (const th of prev) {
          if (!byId.has(th.id) && !th.archived) byId.set(th.id, th);
        }
        return Array.from(byId.values()).sort((a, b) => {
          if (a.client && !b.client) return -1;
          if (!a.client && b.client) return 1;
          return (a.title || '').localeCompare(b.title || '', undefined, {
            sensitivity: 'base',
          });
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

  // Global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        void createThreadRef.current?.();
      }
      if (meta && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setReviewOpen((v) => !v);
      }
      if (meta && (e.key === 'j' || e.key === 'J') && e.shiftKey) {
        e.preventDefault();
        setTerminalOpen((v) => !v);
      }
      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setKernelOpen(true);
      }
      if (meta && (e.key === 'e' || e.key === 'E') && e.shiftKey) {
        e.preventDefault();
        setExtOpen(true);
      }
      if (meta && e.key === '/') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project]);

  const activeTools: ToolEvent[] = useMemo(() => {
    if (!active) return [];
    const map = new Map<string, ToolEvent>();
    for (const line of active.lines) {
      if (line.role !== 'tool') continue;
      const id = line.toolKey || line.id;
      const parts = line.text.split(' · ');
      map.set(id, {
        id,
        label: parts[0] || line.text,
        status: parts[1],
      });
    }
    return [...map.values()].slice(-12);
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

  useEffect(() => {
    refreshStatus();
    void fetchAccountSummary().then(setAccount);
    const iv = window.setInterval(() => {
      void fetchAccountSummary().then(setAccount);
    }, 120_000);
    return () => window.clearInterval(iv);
  }, [refreshStatus]);

  /** Models from Grok subscription cache / cli-chat-proxy (not hardcoded). */
  const loadSubscriptionModels = useCallback(async (refresh = false) => {
    const rows = await fetchSubscriptionModels(refresh);
    if (!rows.length) return;
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
      return mapped[0]?.modelId || cur;
    });
  }, []);

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

  /** Insert skill slash command; open a session if needed. */
  const runSkill = useCallback(
    (skill: SkillInfo) => {
      const cmd = `/${skill.name} `;
      setDraft(cmd);
      setSlashOpen(false);
      if (!active && project) {
        void createThreadRef.current?.();
      }
    },
    [active, project],
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
    };
    void upsertThreadMeta(th.projectKey || NO_PROJECT_KEY, meta);
  }, []);

  const patchThread = useCallback(
    (id: string, patch: Partial<Thread>) => {
      setThreads((prev) => {
        const next = prev.map((th) => (th.id === id ? { ...th, ...patch } : th));
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
              lines[idx] = {
                ...lines[idx],
                text: chunk || lines[idx].text,
                toolStatus: meta?.toolStatus ?? lines[idx].toolStatus,
                toolKind: meta?.toolKind ?? lines[idx].toolKind,
              };
              return { ...th, lines };
            }
            lines.push({
              id: nid(),
              role,
              text: chunk,
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
          const toolLine = formatToolLine(update);
          if (toolLine) {
            const key = String(update.toolCallId ?? toolLine);
            appendOrMerge(threadId, 'tool', toolLine, key, {
              toolStatus: update.status ? String(update.status) : undefined,
              toolKind: update.kind ? String(update.kind) : undefined,
            });
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
        setActiveId(null);
      }
    },
    [bootstrapClient, dismissSession, scopeKey, activeId],
  );

  /** Opt-in: load Grok kernel history for one project cwd (not auto). */
  const loadSessionsForProject = useCallback(
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

  useEffect(() => {
    setShowGrokHistory(false);
  }, [project]);
  const attachFiles = async (opts?: { images?: boolean; folders?: boolean }) => {
    const selected = await open({
      multiple: true,
      directory: Boolean(opts?.folders),
      filters: opts?.images
        ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'] }]
        : undefined,
    });
    const paths = Array.isArray(selected)
      ? selected
      : typeof selected === 'string'
        ? [selected]
        : [];
    if (!paths.length) return;
    if (!active) {
      // Home: stash paths into draft as @ refs then user can send
      setDraft((d) => {
        const refs = paths.map((p) => `@${p}`).join(' ');
        return d ? `${d.trimEnd()} ${refs} ` : `${refs} `;
      });
      setPlusMenuOpen(false);
      return;
    }
    const chunks: string[] = [];
    for (const p of paths) {
      if (opts?.folders || opts?.images) {
        chunks.push(`\n- @${p}`);
        continue;
      }
      try {
        const body = await readTextFile(p);
        const name = p.split('/').pop() || p;
        const trimmed = body.length > 80_000 ? body.slice(0, 80_000) + '\n/* truncated */' : body;
        chunks.push('\n### @' + name + '\n```\n' + trimmed + '\n```');
      } catch (e) {
        chunks.push(`\n### @${p}\n_(unreadable: ${e instanceof Error ? e.message : String(e)})_`);
      }
    }
    setDraft((d) => (d ? d + '\n' : '') + `Attached:${chunks.join('\n')}`);
    setPlusMenuOpen(false);
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
  };

  const pickProject = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') setProject(selected);
  };

  const removeProjectFromApp = (path: string) => {
    // UI-only: remove from recent list; never delete files on disk
    setRecentProjects(removeRecentProject(path));
    if (project === path) {
      setProject('');
      localStorage.setItem('gorkx.project', '');
    }
    // Optional: clear saved thread index for this project (not disk code)
    void clearProjectStore(path);
  };

  const createThread = async (opts?: { worktree?: boolean; initialPrompt?: string }) => {
    const useWorktree = Boolean(opts?.worktree);
    const initialPrompt = (opts?.initialPrompt || '').trim();
    if (useWorktree && !project) {
      alert(t('worktreeNeedProject'));
      return;
    }
    const scope = projectScopeKey(project);
    const liveInScope = threads.filter((th) => th.projectKey === scope && !th.archived && th.client);
    if (liveInScope.length >= MAX_THREADS) {
      alert(t('maxThreads'));
      return;
    }
    const cwdBase = project || (await homeDir());
    const id = nid();
    const seedTitle = initialPrompt
      ? titleFromUserText(initialPrompt) || (project ? t('newThread') : t('inboxChat'))
      : useWorktree
        ? t('worktree')
        : project
          ? t('newThread')
          : t('inboxChat');
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
      },
    ]);
    setActiveId(id);
    try {
      const client = await bootstrapClient();
      wireClient(id, client);
      const session = await client.newSession(cwdBase);
      rememberModels(session);
      let sessionId = session.sessionId;
      let cwd = cwdBase;
      let worktreePath: string | null = null;

      if (modelId && modelId !== session.models?.currentModelId) {
        try {
          await client.setModel(sessionId, modelId);
        } catch {
          /* keep default */
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

      const mid = modelId || session.models?.currentModelId || null;
      const baseTitle = project
        ? project.split('/').filter(Boolean).pop() ?? t('newThread')
        : t('inboxChat');
      const title = initialPrompt
        ? titleFromUserText(initialPrompt) || baseTitle
        : useWorktree
          ? `wt · ${baseTitle}`
          : chatMode === 'plan'
            ? `plan · ${baseTitle}`
            : baseTitle;
      patchThread(id, {
        client,
        sessionId,
        modelId: mid,
        busy: Boolean(initialPrompt),
        cwd,
        projectKey: scope,
        worktreePath,
        chatMode,
        title,
      });

      // Home-style: first message creates the session
      if (initialPrompt) {
        appendLine(id, { id: nid(), role: 'user', text: initialPrompt });
        try {
          const result = await client.prompt(sessionId, initialPrompt);
          if (result?.stopReason && result.stopReason !== 'end_turn') {
            appendLine(id, {
              id: nid(),
              role: 'system',
              text: `stop: ${result.stopReason}`,
            });
          }
        } catch (e) {
          patchThread(id, {
            error: e instanceof Error ? e.message : String(e),
          });
        } finally {
          patchThread(id, { busy: false });
        }
      }
    } catch (e) {
      patchThread(id, {
        busy: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  createThreadRef.current = createThread;

  const resumeSession = async (sessionId: string, title?: string | null) => {
    const scope = projectScopeKey(project);
    const liveInScope = threads.filter((th) => th.projectKey === scope && th.client);
    if (liveInScope.length >= MAX_THREADS) {
      alert(t('maxThreads'));
      return;
    }
    // already open?
    const existing = threads.find((th) => th.sessionId === sessionId && th.client);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    const cwdBase = project || (await homeDir());
    const id = nid();
    setThreads((p) => [
      ...p,
      {
        id,
        title: title || sessionId.slice(0, 8),
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
      },
    ]);
    setActiveId(id);
    try {
      const client = await bootstrapClient();
      wireClient(id, client);
      const session = await client.loadSession(sessionId, cwdBase);
      rememberModels(session);
      await new Promise((r) => setTimeout(r, 400));
      const mid = session.models?.currentModelId ?? modelId ?? null;
      if (modelId && mid && modelId !== mid) {
        try {
          await client.setModel(session.sessionId || sessionId, modelId);
        } catch {
          /* keep */
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
        modelId: modelId || mid,
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
    if (!text) return;
    // No active session: create one and send (Codex home composer)
    if (!active?.client || !active.sessionId) {
      if (active?.busy) return;
      setDraft('');
      setSlashOpen(false);
      setAtOpen(false);
      await createThread({ initialPrompt: text });
      return;
    }
    if (active.busy) return;

    // Silent auto-compact near model threshold (always on; no UI toggle)
    if (!text.startsWith('/') && active.sessionId && active.client && !compactingRef.current) {
      const limit = modelCtx?.contextWindow || active.usage?.contextLimit || 500_000;
      const used = estimateContextUsed(active.usage);
      const thr = (modelCtx?.autoCompactPercent ?? 80) / 100;
      if (limit > 0 && used / limit >= thr) {
        compactingRef.current = true;
        try {
          await active.client.compact(active.sessionId);
          appendLine(active.id, {
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
        patchThread(active.id, { busy: true, error: null });
        appendLine(active.id, { id: nid(), role: 'user', text });
        try {
          await active.client.compact(active.sessionId, arg || undefined);
          appendLine(active.id, {
            id: nid(),
            role: 'system',
            text: arg ? `compact requested (${arg})` : 'compact requested',
          });
        } catch (e) {
          // Fallback: send as normal slash to agent
          try {
            await active.client.prompt(active.sessionId, text);
          } catch (e2) {
            patchThread(active.id, {
              error: e2 instanceof Error ? e2.message : String(e2),
            });
          }
        } finally {
          patchThread(active.id, { busy: false });
        }
        return;
      }
      if (name === 'clear' || name === 'new') {
        setDraft('');
        setSlashOpen(false);
        void createThread();
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
    }

    setDraft('');
    setSlashOpen(false);
    setAtOpen(false);
    const userCount = active.lines.filter((l) => l.role === 'user').length;
    appendLine(active.id, { id: nid(), role: 'user', text });
    if (userCount === 0) {
      const nice = titleFromUserText(text);
      if (nice) patchThread(active.id, { title: nice });
    }
    patchThread(active.id, { busy: true, error: null });
    try {
      const result = await active.client.prompt(active.sessionId, text);
      if (result?.stopReason && result.stopReason !== 'end_turn') {
        appendLine(active.id, {
          id: nid(),
          role: 'system',
          text: `stop: ${result.stopReason}`,
        });
      }
    } catch (e) {
      patchThread(active.id, {
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      patchThread(active.id, { busy: false });
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
  };

  // @file fuzzy search
  useEffect(() => {
    const cwd = active?.cwd || project;
    if (!atOpen || !cwd) return;
    const handle = window.setTimeout(() => {
      void listWorkspaceFiles(cwd, atQuery, 40)
        .then(setAtHits)
        .catch(() => setAtHits([]));
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
    appendLine(active.id, { id: nid(), role: 'system', text: 'cancel requested' });
  };

  /** Plan gate: leave plan mode → agent mode, then prompt to implement selected steps. */
  const applyPlan = async () => {
    if (!active?.client || !active.sessionId || active.busy) return;
    const planLines = active.lines.filter((l) => l.role === 'plan');
    const last = planLines[planLines.length - 1];
    const selected =
      last?.planEntries?.filter((e) => e.checked).map((e, i) => `${i + 1}. ${e.text}`) ?? [];
    const planBody =
      selected.length > 0
        ? selected.join('\n')
        : last?.text ?? '';
    patchThread(active.id, { busy: true, error: null, chatMode: 'agent' });
    try {
      await active.client.setMode(active.sessionId, 'default');
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text:
          selected.length > 0
            ? `plan approved (${selected.length} steps) → agent mode`
            : 'plan approved → agent mode',
      });
      const body = planBody
        ? `${t('applyPlanPrompt')}\n\n--- plan ---\n${planBody}`
        : t('applyPlanPrompt');
      appendLine(active.id, { id: nid(), role: 'user', text: body });
      const result = await active.client.prompt(active.sessionId, body);
      if (result?.stopReason && result.stopReason !== 'end_turn') {
        appendLine(active.id, {
          id: nid(),
          role: 'system',
          text: `stop: ${result.stopReason}`,
        });
      }
    } catch (e) {
      patchThread(active.id, {
        error: e instanceof Error ? e.message : String(e),
        chatMode: 'plan',
      });
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

  const switchThreadToAgent = async () => {
    if (!active?.client || !active.sessionId) return;
    try {
      await active.client.setMode(active.sessionId, 'default');
      patchThread(active.id, { chatMode: 'agent' });
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text: 'switched to agent mode (no auto-implement)',
      });
    } catch (e) {
      patchThread(active.id, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const changeModel = async (next: string) => {
    setModelId(next);
    if (!active?.client || !active.sessionId || !next) return;
    try {
      await active.client.setModel(active.sessionId, next);
      patchThread(active.id, { modelId: next });
      appendLine(active.id, {
        id: nid(),
        role: 'system',
        text: `model → ${next}`,
      });
    } catch (e) {
      appendLine(active.id, {
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
    if (activeId === id) setActiveId(null);
  };

  /** Archive: hide in gorkX only — keeps Grok session files. */
  const archiveThread = async (id: string) => {
    const th = threads.find((x) => x.id === id);
    if (!th) return;
    if (th.client) await th.client.stop();
    const next = { ...th, client: null, busy: false, archived: true };
    persistThread(next);
    setThreads((p) => p.filter((x) => x.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const reconnectThread = async (id: string) => {
    const th = threadsRef.current.find((x) => x.id === id);
    if (!th?.sessionId || th.busy) return;
    patchThread(id, { busy: true, error: null });
    appendLine(id, { id: nid(), role: 'system', text: 'reconnecting agent…' });
    try {
      if (th.client) {
        try {
          await th.client.stop();
        } catch {
          /* already dead */
        }
      }
      const client = await AcpClient.start(perm, grokCmd || undefined, th.effort || effort);
      await client.initialize();
      await client.authenticate('cached_token');
      wireClient(id, client);
      await client.loadSession(th.sessionId, th.cwd || project);
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
      patchThread(id, { client, busy: false, error: null });
      appendLine(id, { id: nid(), role: 'system', text: 'reconnected' });
      autoReconnectTried.current.delete(id);
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

  // Close context usage popover on outside click / Escape
  useEffect(() => {
    if (!ctxPopOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('.ctx-ring-wrap');
      if (!el) setCtxPopOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxPopOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctxPopOpen]);

  useEffect(() => {
    setCtxPopOpen(false);
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

  return (
    <div className={`shell${reviewOpen ? ' with-review' : ''}`}>
      {status && (!status.installed || !status.authenticated) ? (
        <div className="banner warn">
          {!status.installed
            ? t('statusMissing') + ' — ' + (status.detail || '')
            : t('statusNeedLogin') + ' — ' + t('subLogin')}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setKernelOpen(true)}
          >
            {t('subLogin')}
          </button>
          <button type="button" className="btn btn-sm" onClick={refreshStatus}>
            {t('kernelRefresh')}
          </button>
        </div>
      ) : null}

      {/* Codex-style single left sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">gX</div>
          <div>
            <div className="brand-name">{t('appName')}</div>
            <div className="brand-sub">{t('tagline')}</div>
          </div>
        </div>

        <nav className="nav-stack" aria-label="main">
          <button
            type="button"
            className="nav-item primary"
            disabled={
              threads.filter((th) => th.projectKey === scopeKey && th.client).length >= MAX_THREADS
            }
            title={t('newTask')}
            onClick={() => void createThread()}
          >
            <span className="nav-ico">＋</span>
            {t('newSession')}
          </button>
          <button
            type="button"
            className={extOpen ? 'nav-item on' : 'nav-item'}
            title={t('extHubHint')}
            onClick={() => setExtOpen(true)}
          >
            <span className="nav-ico">✦</span>
            {t('navPlugins')}
          </button>
          <button
            type="button"
            className={reviewOpen ? 'nav-item on' : 'nav-item'}
            title={t('reviewTitle')}
            onClick={() => setReviewOpen((v) => !v)}
          >
            <span className="nav-ico">±</span>
            {t('reviewTitle')}
            {(activeTools.length > 0 || activePlanEntries.length > 0) ? (
              <span className="nav-badge">
                {activeTools.length + activePlanEntries.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="nav-item"
            disabled={!project || threads.length >= MAX_THREADS}
            title={t('worktreeHint')}
            onClick={() => void createThread({ worktree: true })}
          >
            <span className="nav-ico">⎇</span>
            {t('worktree')}
          </button>
          <button
            type="button"
            className={terminalOpen ? 'nav-item on' : 'nav-item'}
            title={t('terminalTitle')}
            onClick={() => setTerminalOpen((v) => !v)}
          >
            <span className="nav-ico">{'>_'}</span>
            {t('terminalTitle')}
          </button>
        </nav>

        <div className="nav-divider" />

        {/* Codex-style: 项目 (folder-based) + 任务 (no project) */}
        <section className="block grow">
          {/* ── 项目 ── */}
          <div className="block-head">
            <span className="block-title">{t('projectsSection')}</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void pickProject()}
              title={t('pickFolder')}
            >
              +
            </button>
          </div>

          {(() => {
            const projectList = orderedProjects(project, recentProjects, pinnedProjects);
            if (projectList.length === 0) {
              return <div className="hint">{t('noProjectsYet')}</div>;
            }
            return projectList.map((p) => {
              const name = projectDisplayName(p, projectAliases);
              const selected = p === project;
              const pinned = pinnedProjects.includes(p);
              const live = threads.filter(
                (th) => th.projectKey === projectScopeKey(p) && !th.archived,
              );
              const remote =
                selected && showGrokHistory
                  ? (projectSessions[p] || []).filter(
                      (s) => !live.some((th) => th.sessionId === s.sessionId),
                    )
                  : [];
              return (
                <div key={p} className="proj-group">
                  <div className={selected ? 'thread on project-row' : 'thread project-row'}>
                    <button
                      type="button"
                      className="thread-main"
                      title={p}
                      onClick={() => setProject(p)}
                    >
                      <span className="thread-title">
                        <span className="proj-folder-ico" aria-hidden>
                          {pinned ? '📌' : '📁'}
                        </span>
                        {name}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="thread-x"
                      title={t('projectMenu')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectMenuPath((cur) => (cur === p ? null : p));
                      }}
                    >
                      ···
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
                        {pinned ? t('unpinProject') : t('pinProject')}
                      </button>
                      <button
                        type="button"
                        className="pop-menu-item"
                        onClick={() => {
                          void revealInFinder(p).catch(() => {});
                          setProjectMenuPath(null);
                        }}
                      >
                        {t('revealFinder')}
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
                        {t('createWorktreeMenu')}
                      </button>
                      <button
                        type="button"
                        className="pop-menu-item"
                        onClick={() => {
                          const next = window.prompt(t('renameProjectPrompt'), name);
                          if (next != null) setProjectAliases(setProjectAlias(p, next));
                          setProjectMenuPath(null);
                        }}
                      >
                        {t('renameProject')}
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
                        {t('archiveProjectTasks')}
                      </button>
                      <button
                        type="button"
                        className="pop-menu-item danger"
                        onClick={() => {
                          if (confirm(t('removeProjectConfirm'))) removeProjectFromApp(p);
                          setProjectMenuPath(null);
                        }}
                      >
                        {t('removeProjectMenu')}
                      </button>
                    </div>
                  ) : null}
                  <div className="proj-threads">
                      {live.map((th) => (
                        <div
                          key={th.id}
                          className={
                            th.id === activeId ? 'thread on project-row' : 'thread project-row'
                          }
                        >
                          <button
                            type="button"
                            className="thread-main"
                            onClick={() => {
                              if (!selected) setProject(p);
                              setActiveId(th.id);
                            }}
                          >
                            <span className="thread-title">
                              {th.busy ? '● ' : ''}
                              {th.title}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="thread-x"
                            title={t('archiveThread')}
                            onClick={(e) => {
                              e.stopPropagation();
                              void archiveThread(th.id);
                            }}
                          >
                            ⬇
                          </button>
                          <button
                            type="button"
                            className="thread-x"
                            title={t('deleteThread')}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(t('deleteThreadConfirm'))) void deleteThread(th.id);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {live.length === 0 && !(selected && showGrokHistory) ? (
                        <div className="hint">{t('noProjectTasks')}</div>
                      ) : null}
                      {selected ? (
                        <button
                          type="button"
                          className="btn btn-sm side-link"
                          disabled={grokHistoryLoading}
                          title={t('grokHistoryHint')}
                          onClick={() => {
                            if (showGrokHistory) {
                              setShowGrokHistory(false);
                              return;
                            }
                            setShowGrokHistory(true);
                            setGrokHistoryLoading(true);
                            void loadSessionsForProject(p).finally(() =>
                              setGrokHistoryLoading(false),
                            );
                          }}
                        >
                          {grokHistoryLoading
                            ? '…'
                            : showGrokHistory
                              ? t('hideGrokHistory')
                              : t('showGrokHistory')}
                        </button>
                      ) : null}
                      {remote.map((s) => {
                        const raw = (s.title || '').trim();
                        const looksId = !raw || /^[0-9a-f-]{8,}$/i.test(raw);
                        const label = looksId
                          ? t('inboxChat')
                          : titleFromUserText(raw) || raw.slice(0, 28);
                        return (
                          <div key={s.sessionId} className="thread project-row">
                            <button
                              type="button"
                              className="thread-main"
                              onClick={() =>
                                void resumeSession(s.sessionId, looksId ? label : raw)
                              }
                            >
                              <span className="thread-title">○ {label}</span>
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
                              ⬇
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
                              ×
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
            {threads
              .filter((th) => th.projectKey === NO_PROJECT_KEY && !th.archived)
              .map((th) => (
                <div
                  key={th.id}
                  className={th.id === activeId ? 'thread on project-row' : 'thread project-row'}
                >
                  <button
                    type="button"
                    className="thread-main"
                    onClick={() => {
                      setProject('');
                      setActiveId(th.id);
                    }}
                  >
                    <span className="thread-title">
                      {th.busy ? '● ' : ''}
                      {th.title}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="thread-x"
                    title={t('archiveThread')}
                    onClick={(e) => {
                      e.stopPropagation();
                      void archiveThread(th.id);
                    }}
                  >
                    ⬇
                  </button>
                  <button
                    type="button"
                    className="thread-x"
                    title={t('deleteThread')}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(t('deleteThreadConfirm'))) void deleteThread(th.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            {threads.filter((th) => th.projectKey === NO_PROJECT_KEY && !th.archived).length ===
            0 ? (
              <div className="hint">{t('noTasksYet')}</div>
            ) : null}
          </div>
        </section>

        <footer className="status">
          <div className="account-menu-wrap">
            <button
              type="button"
              className="account-chip"
              title={account?.email || t('subBadgeFull')}
              onClick={() => setAccountMenuOpen((v) => !v)}
            >
              <span
                className={
                  status?.authenticated || account?.authenticated
                    ? 'account-avatar'
                    : 'account-avatar guest'
                }
                aria-hidden
              >
                {(account?.displayName || account?.email || '?').trim().slice(0, 1).toUpperCase() ||
                  '?'}
              </span>
              <span className="account-meta">
                <span className="account-name">
                  {!status?.installed
                    ? t('statusMissing')
                    : !status?.authenticated && !account?.authenticated
                      ? t('statusNeedLogin')
                      : account?.displayName ||
                        account?.email?.split('@')[0] ||
                        t('subBadgeFull')}
                </span>
                <span className="account-quota">
                  {account?.quotaLabel ||
                    (account?.creditUsagePercent != null
                      ? `${t('remainingQuota')} ${Math.max(0, Math.round(100 - account.creditUsagePercent))}%`
                      : status?.authenticated
                        ? t('subBadgeFull')
                        : '—')}
                </span>
              </span>
              {status?.authenticated || account?.authenticated ? (
                <span className="account-sub-badge" title={t('subBadgeFull')}>
                  {t('subBadge')}
                </span>
              ) : null}
            </button>
            {accountMenuOpen ? (
              <div className="account-menu" role="menu">
                <div className="account-menu-head">
                  <span className="account-avatar" aria-hidden>
                    {(account?.displayName || account?.email || '?').trim().slice(0, 1).toUpperCase()}
                  </span>
                  <div className="account-meta">
                    <div className="account-name">
                      {account?.displayName || account?.email || '—'}
                    </div>
                    <div className="account-quota">{account?.email || t('subBadgeFull')}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="account-menu-item"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setKernelOpen(true);
                  }}
                >
                  {t('remainingQuota')}
                  <span className="muted">
                    {account?.quotaLabel ||
                      (account?.creditUsagePercent != null
                        ? `${Math.round(account.creditUsagePercent)}%`
                        : '—')}
                  </span>
                </button>
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
                        const { shellExec } = await import('./lib/terminal');
                        const bin = (status?.grokPath || grokCmd || 'grok').trim() || 'grok';
                        await shellExec(`${JSON.stringify(bin)} logout`);
                      } catch {
                        /* */
                      }
                      refreshStatus();
                      setAccount(null);
                    })();
                  }}
                >
                  {t('logout')}
                </button>
              </div>
            ) : null}
          </div>
        </footer>
      </aside>

      <main className="main">
        {!active ? (
          <div className="main-home">
            <div className="empty">
              <div className="empty-icon">gX</div>
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
                <button
                  type="button"
                  className="home-project-chip"
                  onClick={() => void pickProject()}
                  title={project || t('selectProject')}
                >
                  📁{' '}
                  {project
                    ? projectDisplayName(project, projectAliases)
                    : t('selectProject')}
                </button>
              </div>
              <div className="composer">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('homeComposerPlaceholder')}
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="composer-send-row">
                  <div className="composer-toolbar">
                    <div className="plus-wrap">
                      <button
                        type="button"
                        className="btn-icon"
                        title={t('plusMenu')}
                        onClick={() => setPlusMenuOpen((v) => !v)}
                      >
                        ＋
                      </button>
                      {plusMenuOpen ? (
                        <div className="pop-menu plus-pop-menu home-plus" role="menu">
                          <div className="pop-menu-label">{t('plusMenu')}</div>
                          <button
                            type="button"
                            className="pop-menu-item"
                            onClick={() => void attachFiles()}
                          >
                            {t('attachFilesFolders')}
                          </button>
                          <button
                            type="button"
                            className="pop-menu-item"
                            onClick={() => void attachFiles({ images: true })}
                          >
                            {t('attachImages')}
                          </button>
                          <button
                            type="button"
                            className="pop-menu-item"
                            onClick={() => {
                              setPlusMenuOpen(false);
                              void pickProject();
                            }}
                          >
                            {t('chooseProjectForTask')}
                          </button>
                          <button
                            type="button"
                            className="pop-menu-item"
                            onClick={() => {
                              setPlusMenuOpen(false);
                              setChatMode('plan');
                            }}
                          >
                            {t('enablePlanMode')}
                          </button>
                          <div className="pop-menu-label">{t('pluginsSection')}</div>
                          <button
                            type="button"
                            className="pop-menu-item"
                            onClick={() => {
                              setPlusMenuOpen(false);
                              setExtOpen(true);
                            }}
                          >
                            {t('openPlugins')}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <label className="chip" title={t('modelFromSub')}>
                      <select
                        value={modelId}
                        onChange={(e) => setModelId(e.target.value)}
                        disabled={availableModels.length === 0 && !modelId}
                      >
                        {availableModels.length === 0 ? (
                          <option value={modelId || ''}>{modelId || 'Grok 4.5'}</option>
                        ) : (
                          availableModels.map((m) => (
                            <option key={m.modelId} value={m.modelId}>
                              {m.name || m.modelId}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <label className="chip" title={t('effortHintReal')}>
                      <select
                        value={effort}
                        onChange={(e) => setEffort(e.target.value as ReasoningEffort)}
                      >
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    className="btn-send"
                    title={t('send')}
                    disabled={!draft.trim()}
                    onClick={() => void send()}
                  >
                    ↑
                  </button>
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
              {active.chatMode === 'plan' ? <span className="pill plan">Plan</span> : null}
              {active.worktreePath ? (
                <button
                  type="button"
                  className="pill"
                  title={active.worktreePath}
                  onClick={() =>
                    void revealInFinder(active.worktreePath!).catch(() => {})
                  }
                >
                  worktree
                </button>
              ) : null}
              <div className="main-bar-spacer" />
              {active.busy ? (
                <button type="button" className="btn btn-sm" onClick={() => void cancelTurn()}>
                  {t('stop')}
                </button>
              ) : null}
              {active.chatMode === 'plan' && !active.busy ? (
                <>
                  <button
                    type="button"
                    className="btn btn-sm primary-sm"
                    title={t('applyPlanHint')}
                    onClick={() => void applyPlan()}
                  >
                    {t('applyPlan')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => void switchThreadToAgent()}
                  >
                    {t('switchToAgent')}
                  </button>
                </>
              ) : null}
              {active.error ? (
                <span className="pill err" title={active.error}>
                  {t('error')}
                </span>
              ) : null}
              {!active.client && active.sessionId && !active.busy ? (
                <button
                  type="button"
                  className="btn btn-sm primary-sm"
                  onClick={() => void reconnectThread(active.id)}
                >
                  {t('reconnect')}
                </button>
              ) : null}
            </header>
            {active.chatMode === 'plan' || activePlanEntries.length > 0 ? (
              <div className="goal-banner">
                <strong>Plan</strong>
                <span>
                  {activePlanEntries.length > 0
                    ? `${activePlanEntries.filter((e) => e.checked).length}/${activePlanEntries.length} steps selected`
                    : t('modePlanHint')}
                </span>
                {active.chatMode === 'plan' && !active.busy ? (
                  <button
                    type="button"
                    className="btn btn-sm primary-sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => void applyPlan()}
                  >
                    {t('applyPlan')}
                  </button>
                ) : null}
              </div>
            ) : null}
            <ToolTimeline tools={activeTools} />
            <MessageList
              lines={active.lines}
              bottomRef={bottomRef}
              onTogglePlanEntry={togglePlanEntry}
              onToggleAllPlan={toggleAllPlanEntries}
            />
            <div className="composer-dock">
              <div className="composer">
                {slashOpen ? (
                  <div className="slash-menu">
                    <div className="hint">{t('slashHint')} · skills · builtins</div>
                    {(() => {
                      const q = draft.replace(/^\//, '').toLowerCase();
                      const builtins = [
                        { name: 'compact', description: 'Compress context', source: 'builtin' as const },
                        { name: 'clear', description: 'New session', source: 'builtin' as const },
                        { name: 'diff', description: 'Open review panel', source: 'builtin' as const },
                        { name: 'skills', description: 'Open extensions hub', source: 'builtin' as const },
                      ];
                      const fromSession = (active.commands ?? []).map((c) => ({
                        name: c.name,
                        description: c.description,
                        source: 'session' as const,
                      }));
                      const names = new Set(
                        [...builtins, ...fromSession].map((c) => c.name.toLowerCase()),
                      );
                      const fromDisk = diskSkillCommands.filter(
                        (c) => !names.has(c.name.toLowerCase()),
                      );
                      const merged = [...builtins, ...fromSession, ...fromDisk]
                        .filter((c) => !q || c.name.toLowerCase().includes(q))
                        .slice(0, 18);
                      if (merged.length === 0) {
                        return <div className="hint">{t('extNoSkills')}</div>;
                      }
                      return merged.map((c) => (
                        <button
                          key={`${c.source}:${c.name}`}
                          type="button"
                          className="slash-item"
                          onClick={() => insertSlash(c.name)}
                        >
                          <span className="mono">
                            /{c.name}
                            {c.source !== 'session' ? (
                              <span className="muted"> · {c.source}</span>
                            ) : null}
                          </span>
                          {c.description ? (
                            <span className="muted">{c.description}</span>
                          ) : null}
                        </button>
                      ));
                    })()}
                  </div>
                ) : null}
                {atOpen ? (
                  <div className="slash-menu">
                    <div className="hint">@ files · {atQuery || '*'}</div>
                    {atHits.length === 0 ? (
                      <div className="hint">…</div>
                    ) : (
                      atHits.map((h) => (
                        <button
                          key={h.path}
                          type="button"
                          className="slash-item"
                          onClick={() => insertAtFile(h.path)}
                        >
                          <span className="mono">{h.path}</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
                <textarea
                  value={draft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft(v);
                    setSlashOpen(v.startsWith('/') && !v.includes('\n'));
                    const at = v.match(/(^|\s)@([^\s@]*)$/);
                    if (at) {
                      setAtOpen(true);
                      setAtQuery(at[2] || '');
                    } else {
                      setAtOpen(false);
                      setAtQuery('');
                    }
                  }}
                  placeholder={t('composerPlaceholder')}
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSlashOpen(false);
                      setAtOpen(false);
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
                  <div className="composer-toolbar">
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
                      {plusMenuOpen ? (
                        <div className="pop-menu plus-pop-menu" role="menu">
                          <div className="pop-menu-label">{t('plusMenu')}</div>
                          <button
                            type="button"
                            className="pop-menu-item"
                            onClick={() => void attachFiles()}
                          >
                            {t('attachFilesFolders')}
                          </button>
                          <button
                            type="button"
                            className="pop-menu-item"
                            onClick={() => void attachFiles({ folders: true })}
                          >
                            📁 {t('attachFilesFolders')}
                          </button>
                          <button
                            type="button"
                            className="pop-menu-item"
                            onClick={() => void attachFiles({ images: true })}
                          >
                            {t('attachImages')}
                          </button>
                          <button
                            type="button"
                            className="pop-menu-item"
                            onClick={() => {
                              setPlusMenuOpen(false);
                              void pickProject();
                            }}
                          >
                            {t('chooseProjectForTask')}
                          </button>
                          <button
                            type="button"
                            className="pop-menu-item"
                            onClick={() => {
                              setPlusMenuOpen(false);
                              setChatMode('plan');
                              setDraft((d) =>
                                d.trim()
                                  ? d
                                  : '请先列出清晰的分步计划，等我确认后再实现。',
                              );
                            }}
                          >
                            {t('enablePlanMode')}
                          </button>
                          <button
                            type="button"
                            className="pop-menu-item"
                            onClick={() => {
                              setPlusMenuOpen(false);
                              setDraft((d) =>
                                d.trim()
                                  ? d
                                  : '目标：请把本会话当作持续目标跟踪，先复述目标再推进。',
                              );
                            }}
                          >
                            {t('setGoal')}
                          </button>
                          <div className="pop-menu-label">{t('pluginsSection')}</div>
                          <button
                            type="button"
                            className="pop-menu-item"
                            onClick={() => {
                              setPlusMenuOpen(false);
                              setExtOpen(true);
                            }}
                          >
                            {t('openPlugins')}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <label
                      className="chip"
                      title={
                        availableModels.length <= 1
                          ? t('modelSubOnlyOneHint')
                          : t('modelFromSub')
                      }
                    >
                      <select
                        value={modelId}
                        onChange={(e) => void changeModel(e.target.value)}
                        disabled={availableModels.length === 0 && !modelId}
                      >
                        {availableModels.length === 0 ? (
                          <option value={modelId || ''}>{modelId || 'model'}</option>
                        ) : (
                          availableModels.map((m) => (
                            <option key={m.modelId} value={m.modelId}>
                              {m.name || m.modelId}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
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
                            onClick={() => setCtxPopOpen((v) => !v)}
                          />
                          {ctxPopOpen ? (
                            <div className="ctx-popover" role="dialog">
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
                    <label className="chip" title={t('effortHintReal')}>
                      <select
                        value={active ? active.effort : effort}
                        onChange={(e) => void changeEffort(e.target.value as ReasoningEffort)}
                      >
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </label>
                    <label className="chip" title={t('permHintReal')}>
                      <select
                        value={perm}
                        onChange={(e) => setPerm(e.target.value as PermissionMode)}
                      >
                        <option value="default">{t('permDefault')}</option>
                        <option value="auto">{t('permAuto')}</option>
                        <option value="full">{t('permFull')}</option>
                      </select>
                    </label>
                    <label className="chip" title={t('modeHintReal')}>
                      <select
                        value={chatMode}
                        onChange={(e) => setChatMode(e.target.value as ChatMode)}
                      >
                        <option value="agent">{t('modeAgent')}</option>
                        <option value="plan">{t('modePlan')}</option>
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    className="btn-send"
                    title={t('send')}
                    disabled={!draft.trim() || active.busy || !active.client}
                    onClick={() => void send()}
                  >
                    ↑
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      <ReviewPanel
        open={reviewOpen}
        cwd={active?.cwd || project}
        tools={activeTools}
        planEntries={activePlanEntries}
        onClose={() => setReviewOpen(false)}
        onApplyPlan={
          active?.chatMode === 'plan' && !active.busy ? () => void applyPlan() : undefined
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
        account={account}
        onModelsRefreshed={() => void loadSubscriptionModels(true)}
        perm={perm}
        onPerm={setPerm}
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

      {permReq ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>{t('permissionTitle')}</h2>
            <pre className="modal-body">
              {JSON.stringify(permReq.toolCall ?? permReq.raw, null, 2)}
            </pre>
            <div className="modal-actions">
              <button
                type="button"
                className="btn primary"
                onClick={() => void answerPermission('allow')}
              >
                {t('allow')}
              </button>
              <button type="button" className="btn" onClick={() => void answerPermission('reject')}>
                {t('reject')}
              </button>
              {(permReq.options ?? []).map((opt) => (
                <button
                  key={opt.optionId}
                  type="button"
                  className="btn"
                  onClick={() => void answerPermission(opt.optionId)}
                >
                  {opt.name ?? opt.optionId}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
