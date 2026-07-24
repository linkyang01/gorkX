/**
 * ACP JSON-RPC client over Tauri agent bridge (NDJSON stdio).
 * Verified against grok 0.2.x agent stdio (2026-07).
 *
 * Lifecycle: start → initialize → authenticate(cached_token) → session/new → session/prompt
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { readTextFile } from '@tauri-apps/plugin-fs';

export type PermissionMode = 'default' | 'auto' | 'full';

export interface AgentInfo {
  id: string;
  pid: number;
  permissionMode: string;
  workingDirectory: string;
}

export interface GrokStatus {
  installed: boolean;
  version: string;
  authenticated: boolean;
  authPath: string;
  grokPath: string;
  detail: string;
  channel: string;
  sourceRepoHint: string;
  upgradeOfficial: string;
  upgradeSource: string;
  docsUrl: string;
  sourceUrl: string;
  /** App-owned engine data home */
  grokHome?: string;
  engineAppOwned?: boolean;
  independentReady?: boolean;
}

export interface KernelDoctor {
  status: GrokStatus;
  grokHomeWritable: boolean;
  issues: string[];
  repairHint: string;
}

export interface HookInfo {
  name: string;
  event: string;
  handlerType: string;
  matcher?: string | null;
  command?: string | null;
  url?: string | null;
  timeoutMs: number;
  sourceDir: string;
  disabled: boolean;
}

/** A real kernel-level copy of a local session, returned by `_x.ai/session/fork`. */
export interface ForkSessionResult {
  newSessionId: string;
  chatMessagesCopied: number;
  updatesCopied: number;
  planStateCopied: boolean;
  newCwd: string;
  parentSessionId: string;
  newModelId?: string | null;
}

export type RewindMode = 'all' | 'conversation_only' | 'files_only';

/** A kernel-provided checkpoint; prompt indexes are stable ACP identifiers, not UI row indexes. */
export interface RewindPoint {
  promptIndex: number;
  createdAt: string;
  numFileSnapshots: number;
  hasFileChanges: boolean;
  promptPreview?: string | null;
}

export interface RewindConflict {
  path: string;
  conflictType: string;
}

export interface RewindResult {
  success: boolean;
  targetPromptIndex: number;
  mode: RewindMode;
  revertedFiles: string[];
  cleanFiles: string[];
  conflicts: RewindConflict[];
  promptText?: string | null;
  error?: string | null;
}

/** A `/btw` answer is deliberately outside the main conversation turn. */
export interface BtwResult {
  answer: string;
}

/** Read-only snapshot returned by `_x.ai/session/info`. */
export interface SessionSnapshot {
  sessionId: string;
  cwd: string;
  agentName?: string | null;
  model?: string | null;
  modelDisplayName?: string | null;
  resolvedModelId?: string | null;
  turns?: number;
  turnIndex?: number;
  context?: {
    used?: number;
    total?: number;
    freeTokens?: number;
    usagePct?: number;
    compactionCount?: number;
    turnCount?: number;
    toolCallCount?: number;
    messageCount?: number;
    autoCompactThresholdPercent?: number;
    usageCategories?: Array<{ label?: string; tokens?: number; detail?: string | null }>;
  };
}

export interface HooksSnapshot {
  hooks: HookInfo[];
  projectTrusted: boolean;
  loadErrors?: string[];
}

export type SessionUpdate = {
  sessionUpdate: string;
  content?: { type?: string; text?: string } | string;
  toolCallId?: string;
  title?: string;
  status?: string;
  kind?: string;
  [k: string]: unknown;
};

export interface PermissionRequest {
  jsonrpcId: number | string;
  sessionId?: string;
  toolCall?: unknown;
  options?: Array<{ optionId: string; name?: string; kind?: string }>;
  raw: unknown;
}

/** A structured decision request emitted by Grok Build's ask_user_question tool. */
export interface UserQuestionOption {
  label: string;
  description: string;
  /** Optional comparison content. Rendered as text only by the desktop client. */
  preview?: string;
  id?: string;
}

export interface UserQuestion {
  question: string;
  options: UserQuestionOption[];
  multiSelect?: boolean;
  id?: string;
}

export type UserQuestionMode = 'default' | 'plan';

export interface UserQuestionRequest {
  jsonrpcId: number | string;
  sessionId?: string;
  toolCallId?: string;
  questions: UserQuestion[];
  mode: UserQuestionMode;
  raw: unknown;
}

export type UserQuestionAnswers = Record<string, string[]>;
export type UserQuestionAnnotations = Record<string, { preview?: string; notes?: string }>;

/** Exact Grok Build ACP response for `x.ai/ask_user_question` (kernel 0.2.110). */
export function userQuestionAcceptedResult(
  answers: UserQuestionAnswers,
  annotations?: UserQuestionAnnotations,
) {
  const cleanAnnotations = annotations && Object.keys(annotations).length ? annotations : undefined;
  return cleanAnnotations
    ? { outcome: 'accepted', answers, annotations: cleanAnnotations }
    : { outcome: 'accepted', answers };
}

export function userQuestionPlanResult(
  outcome: 'chat_about_this' | 'skip_interview',
  partialAnswers: Record<string, string>,
) {
  return { outcome, partial_answers: partialAnswers };
}

export function userQuestionCancelledResult() {
  return { outcome: 'cancelled' };
}

/** A blocking plan approval emitted after Grok Build has written its plan file. */
export interface PlanApprovalRequest {
  jsonrpcId: number | string;
  sessionId?: string;
  toolCallId?: string;
  planContent?: string;
  raw: unknown;
}

/** Exact Grok Build ACP response for `x.ai/exit_plan_mode` (kernel 0.2.110). */
export function planApprovalResult(
  outcome: 'approved' | 'cancelled' | 'abandoned',
  feedback?: string,
) {
  const cleanFeedback = feedback?.trim();
  return cleanFeedback && outcome === 'cancelled'
    ? { outcome, feedback: cleanFeedback.slice(0, 4_000) }
    : { outcome };
}

/** A folder safety gate emitted before project-local MCP, hooks, or LSP config is loaded. */
export interface FolderTrustRequest {
  jsonrpcId: number | string;
  sessionId?: string;
  cwd: string;
  workspace: string;
  configKinds: string[];
  raw: unknown;
}

/** Exact Grok Build ACP response for `x.ai/folder_trust/request` (fail-closed). */
export function folderTrustResult(outcome: 'trust' | 'reject') {
  return { outcome };
}

function extMethodParams(method: string, rawParams: unknown): { method: string; params: Record<string, unknown> } {
  const outer = rawParams && typeof rawParams === 'object' ? rawParams as Record<string, unknown> : {};
  const wrapped = typeof outer.method === 'string' && outer.params && typeof outer.params === 'object';
  return {
    method: wrapped ? String(outer.method) : method.replace(/^_/, ''),
    params: (wrapped ? outer.params : outer) as Record<string, unknown>,
  };
}

/** Accept both direct and Grok Build leader-wrapped plan approval requests. */
export function parsePlanApprovalRequest(
  jsonrpcId: number | string,
  method: string,
  rawParams: unknown,
  raw: unknown,
): PlanApprovalRequest | null {
  const ext = extMethodParams(method, rawParams);
  if (ext.method !== 'x.ai/exit_plan_mode') return null;
  return {
    jsonrpcId,
    sessionId: typeof ext.params.sessionId === 'string' ? ext.params.sessionId : typeof ext.params.session_id === 'string' ? ext.params.session_id : undefined,
    toolCallId: typeof ext.params.toolCallId === 'string' ? ext.params.toolCallId : typeof ext.params.tool_call_id === 'string' ? ext.params.tool_call_id : undefined,
    planContent: typeof ext.params.planContent === 'string' ? ext.params.planContent.slice(0, 100_000) : typeof ext.params.plan_content === 'string' ? ext.params.plan_content.slice(0, 100_000) : undefined,
    raw,
  };
}

export function parseFolderTrustRequest(
  jsonrpcId: number | string,
  method: string,
  rawParams: unknown,
  raw: unknown,
): FolderTrustRequest | null {
  const ext = extMethodParams(method, rawParams);
  if (ext.method !== 'x.ai/folder_trust/request') return null;
  const cwd = typeof ext.params.cwd === 'string' ? ext.params.cwd : '';
  const workspace = typeof ext.params.workspace === 'string' ? ext.params.workspace : cwd;
  if (!cwd || !workspace) return null;
  const configKinds = Array.isArray(ext.params.configKinds)
    ? ext.params.configKinds.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : Array.isArray(ext.params.config_kinds)
      ? ext.params.config_kinds.filter((item): item is string => typeof item === 'string').slice(0, 12)
      : [];
  return {
    jsonrpcId,
    sessionId: typeof ext.params.sessionId === 'string' ? ext.params.sessionId : typeof ext.params.session_id === 'string' ? ext.params.session_id : undefined,
    cwd: cwd.slice(0, 4_000),
    workspace: workspace.slice(0, 4_000),
    configKinds,
    raw,
  };
}

function readUserQuestions(value: unknown): UserQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Record<string, unknown>;
    const question = typeof raw.question === 'string' ? raw.question.trim().slice(0, 800) : '';
    if (!question) return [];
    const options = Array.isArray(raw.options)
      ? raw.options.flatMap((option) => {
          if (!option || typeof option !== 'object') return [];
          const item = option as Record<string, unknown>;
          const label = typeof item.label === 'string' ? item.label.trim().slice(0, 240) : '';
          if (!label) return [];
          return [{
            label,
            description: typeof item.description === 'string' ? item.description.trim().slice(0, 800) : '',
            preview: typeof item.preview === 'string' ? item.preview.slice(0, 4_000) : undefined,
            id: typeof item.id === 'string' ? item.id : undefined,
          }];
        }).slice(0, 12)
      : [];
    return [{
      question,
      options,
      multiSelect: raw.multiSelect === true || raw.multi_select === true,
      id: typeof raw.id === 'string' ? raw.id : undefined,
    }];
  }).slice(0, 8);
}

/** Accept both direct and Grok Build leader-wrapped extension requests. */
export function parseUserQuestionRequest(
  jsonrpcId: number | string,
  method: string,
  rawParams: unknown,
  raw: unknown,
): UserQuestionRequest | null {
  const ext = extMethodParams(method, rawParams);
  if (ext.method !== 'x.ai/ask_user_question') return null;
  const params = ext.params;
  const questions = readUserQuestions(params.questions);
  if (!questions.length) return null;
  return {
    jsonrpcId,
    sessionId: typeof params.sessionId === 'string' ? params.sessionId : typeof params.session_id === 'string' ? params.session_id : undefined,
    toolCallId: typeof params.toolCallId === 'string' ? params.toolCallId : typeof params.tool_call_id === 'string' ? params.tool_call_id : undefined,
    questions,
    mode: params.mode === 'plan' ? 'plan' : 'default',
    raw,
  };
}

export interface PromptResult {
  stopReason?: string;
  _meta?: Record<string, unknown>;
}

export interface ModelInfo {
  modelId: string;
  name?: string;
  description?: string;
  _meta?: {
    supportsReasoningEffort?: boolean;
    reasoningEffort?: string;
    reasoningEfforts?: Array<{
      id: string;
      value: string;
      label?: string;
      description?: string;
      default?: boolean;
    }>;
    totalContextTokens?: number;
  };
}

export interface SessionInfo {
  sessionId: string;
  models?: {
    currentModelId?: string;
    availableModels?: ModelInfo[];
  };
}

export type ReasoningEffort = 'low' | 'medium' | 'high';

/** ACP baseline prompt attachment: every agent supports resource links. */
export interface PromptResourceLink {
  name: string;
  path: string;
  mimeType?: string;
  size?: number;
}

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};

function textOf(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object' && content !== null && 'text' in content) {
    const t = (content as { text?: unknown }).text;
    return typeof t === 'string' ? t : '';
  }
  return '';
}

/** Pick best allow/reject option id from ACP permission options. */
export function pickPermissionOption(
  options: PermissionRequest['options'] | undefined,
  prefer: 'allow' | 'reject',
): string {
  const opts = options ?? [];
  if (prefer === 'reject') {
    const r =
      opts.find((o) => /reject|deny|cancel/i.test(o.optionId) || /reject|deny/i.test(o.name ?? '')) ??
      opts.find((o) => /reject|deny/i.test(o.optionId));
    return r?.optionId ?? 'reject-once';
  }
  // Prefer allow-once over allow-always for "auto" safety; full can still use first allow.
  const allowOnce = opts.find(
    (o) => /allow-once|allow_once|once/i.test(o.optionId) || /once/i.test(o.name ?? ''),
  );
  if (allowOnce) return allowOnce.optionId;
  const allow = opts.find(
    (o) => /allow|approve|accept/i.test(o.optionId) || /allow|approve/i.test(o.name ?? ''),
  );
  return allow?.optionId ?? opts[0]?.optionId ?? 'allow-once';
}

export function permissionResult(optionId: string) {
  return { outcome: { outcome: 'selected', optionId } };
}

export class AcpClient {
  readonly agentId: string;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private unlistenLine: UnlistenFn | null = null;
  private unlistenExit: UnlistenFn | null = null;
  private sessionCwd = '';

  onSessionUpdate: ((update: SessionUpdate, sessionId?: string) => void) | null = null;
  onPermissionRequest: ((req: PermissionRequest) => void) | null = null;
  onUserQuestionRequest: ((req: UserQuestionRequest) => void) | null = null;
  onPlanApprovalRequest: ((req: PlanApprovalRequest) => void) | null = null;
  onFolderTrustRequest: ((req: FolderTrustRequest) => void) | null = null;
  onStderr: ((line: string) => void) | null = null;
  onExit: (() => void) | null = null;
  onNotification: ((method: string, params: unknown) => void) | null = null;
  onWorktreeStatus:
    | ((status: {
        status?: string;
        sessionId?: string;
        message?: string;
        worktreePath?: string;
      }) => void)
    | null = null;
  onTerminalCreated: ((terminalId: string) => void) | null = null;
  onAvailableCommands:
    | ((commands: Array<{ name: string; description?: string; input?: unknown }>) => void)
    | null = null;
  onUsageMeta: ((meta: unknown) => void) | null = null;

  private worktreeWaiters = new Map<
    string,
    { resolve: (v: { worktreePath?: string; sessionId?: string }) => void }
  >();

  private constructor(agentId: string) {
    this.agentId = agentId;
  }

  static async start(
    permissionMode: PermissionMode,
    grokCmd?: string,
    reasoningEffort?: ReasoningEffort | string,
    workingDirectory?: string,
  ): Promise<AcpClient> {
    const info = await invoke<AgentInfo>('agent_start', {
      permissionMode,
      grokCmd: grokCmd ?? null,
      reasoningEffort: reasoningEffort ?? null,
      workingDirectory: workingDirectory ?? null,
    });
    const client = new AcpClient(info.id);
    await client.attachListener();
    return client;
  }

  private async attachListener() {
    this.unlistenLine = await listen<{ agentId: string; line: string; stream: string }>(
      'gorkx://agent-line',
      (ev) => {
        if (ev.payload.agentId !== this.agentId) return;
        if (ev.payload.stream === 'stderr') {
          this.onStderr?.(ev.payload.line);
          return;
        }
        this.onStdoutLine(ev.payload.line);
      },
    );
    this.unlistenExit = await listen<{ agentId: string }>('gorkx://agent-exit', (ev) => {
      if (ev.payload.agentId !== this.agentId) return;
      this.onExit?.();
    });
  }

  private onStdoutLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      this.onStderr?.(`[non-json] ${trimmed}`);
      return;
    }

    // Response
    if ('id' in msg && (msg.result !== undefined || msg.error !== undefined) && !msg.method) {
      const id = Number(msg.id);
      const p = this.pending.get(id);
      if (p) {
        this.pending.delete(id);
        if (msg.error) {
          p.reject(new Error(JSON.stringify(msg.error)));
        } else {
          p.resolve(msg.result);
        }
      }
      return;
    }

    const method = msg.method as string | undefined;
    if (!method) return;

    // Server → client request (needs response)
    if ('id' in msg && msg.id !== undefined && msg.id !== null) {
      void this.handleServerRequest(method, msg);
      return;
    }

    // Notifications
    // Grok Build sends its extended lifecycle updates (including native
    // subagent events) on x.ai/session/update. Treat it exactly like baseline
    // ACP session/update rather than dropping it as an unknown notification.
    if (method === 'session/update' || method === 'x.ai/session/update' || method === '_x.ai/session/update') {
      const params = (msg.params ?? {}) as {
        sessionId?: string;
        session_id?: string;
        update?: SessionUpdate;
        _meta?: unknown;
      };
      const update = (params.update ?? params) as SessionUpdate;
      if (update.sessionUpdate === 'available_commands_update') {
        const cmds =
          (update as { availableCommands?: Array<{ name: string; description?: string }> })
            .availableCommands ?? [];
        this.onAvailableCommands?.(cmds);
      }
      if (params._meta) this.onUsageMeta?.(params);
      else if ((update as { _meta?: unknown })._meta) {
        this.onUsageMeta?.(update);
      }
      this.onSessionUpdate?.(update, params.sessionId ?? params.session_id);
      return;
    }

    // Older/leader-routed Grok Build sessions use the compatibility envelope.
    // Its body is the same SessionNotification shape as x.ai/session/update.
    if (method === 'x.ai/session_notification' || method === '_x.ai/session_notification') {
      const outer = (msg.params ?? {}) as Record<string, unknown>;
      const params = (
        typeof outer.params === 'object' &&
        outer.params !== null &&
        typeof outer.method === 'string' &&
        String(outer.method).endsWith('session_notification')
          ? outer.params
          : outer
      ) as {
        sessionId?: string;
        session_id?: string;
        update?: SessionUpdate;
        _meta?: unknown;
      };
      const update = (params.update ?? params) as SessionUpdate;
      if (params._meta) this.onUsageMeta?.(params);
      else if ((update as { _meta?: unknown })._meta) this.onUsageMeta?.(update);
      this.onSessionUpdate?.(update, params.sessionId ?? params.session_id);
      return;
    }

    if (
      method === '_x.ai/session/prompt_complete' ||
      method === '_x.ai/session_notification'
    ) {
      this.onUsageMeta?.(msg.params);
    }

    if (
      method === '_x.ai/git/worktree/status' ||
      method === 'x.ai/git/worktree/status'
    ) {
      const p = (msg.params ?? {}) as {
        status?: string;
        sessionId?: string;
        message?: string;
        worktreePath?: string;
      };
      this.onWorktreeStatus?.(p);
      const sid = p.sessionId ?? '';
      if (
        sid &&
        (p.status === 'ready' ||
          p.status === 'done' ||
          p.status === 'completed' ||
          p.status === 'error' ||
          p.status === 'failed')
      ) {
        const w = this.worktreeWaiters.get(sid);
        if (w) {
          this.worktreeWaiters.delete(sid);
          w.resolve({ worktreePath: p.worktreePath, sessionId: p.sessionId });
        }
      }
    }

    this.onNotification?.(method, msg.params);
  }

  private async handleServerRequest(method: string, msg: Record<string, unknown>) {
    const id = msg.id as number | string;
    const params = (msg.params ?? {}) as Record<string, unknown>;

    const userQuestion = parseUserQuestionRequest(id, method, params, msg);
    if (userQuestion) {
      this.onUserQuestionRequest?.(userQuestion);
      return;
    }

    const planApproval = parsePlanApprovalRequest(id, method, params, msg);
    if (planApproval) {
      this.onPlanApprovalRequest?.(planApproval);
      return;
    }

    const folderTrust = parseFolderTrustRequest(id, method, params, msg);
    if (folderTrust) {
      this.onFolderTrustRequest?.(folderTrust);
      return;
    }

    if (
      method === 'session/request_permission' ||
      method === 'session/requestPermission' ||
      method.endsWith('request_permission')
    ) {
      const options = (params.options as PermissionRequest['options']) ?? [
        { optionId: 'allow-once', name: 'Allow once' },
        { optionId: 'allow-always', name: 'Allow always' },
        { optionId: 'reject-once', name: 'Reject' },
      ];
      this.onPermissionRequest?.({
        jsonrpcId: id,
        sessionId: params.sessionId as string | undefined,
        toolCall: params.toolCall ?? params.tool_call,
        options,
        raw: msg,
      });
      return;
    }

    // Client FS capabilities advertised in initialize
    if (method === 'fs/read_text_file' || method === 'fs/readTextFile') {
      try {
        const path = String(params.path ?? '');
        // Prefer absolute; if relative, join session cwd
        const full =
          path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
            ? path
            : `${this.sessionCwd.replace(/\/$/, '')}/${path}`;
        const text = await readTextFile(full);
        await this.respond(id, { content: text });
      } catch (e) {
        await this.respondError(id, -32000, e instanceof Error ? e.message : String(e));
      }
      return;
    }

    if (method === 'fs/write_text_file' || method === 'fs/writeTextFile') {
      // Not implemented in P1 — reject so agent can fall back to its tools
      await this.respondError(id, -32601, `Method not implemented: ${method}`);
      return;
    }

    // ACP terminal/* — Client implements these for the Agent
    if (method === 'terminal/create') {
      try {
        const command = String(params.command ?? '');
        const args = (params.args as string[] | undefined) ?? [];
        const cwd =
          (params.cwd as string | null | undefined) || this.sessionCwd || undefined;
        const env = params.env as unknown[] | undefined;
        const outputByteLimit = params.outputByteLimit as number | undefined;
        const r = (await invoke('terminal_create', {
          command,
          args,
          cwd: cwd ?? null,
          env: env ?? null,
          outputByteLimit: outputByteLimit ?? null,
        })) as { terminalId: string };
        this.onTerminalCreated?.(r.terminalId);
        await this.respond(id, { terminalId: r.terminalId });
      } catch (e) {
        await this.respondError(id, -32000, e instanceof Error ? e.message : String(e));
      }
      return;
    }

    if (method === 'terminal/output') {
      try {
        const terminalId = String(params.terminalId ?? '');
        const r = await invoke('terminal_output', { terminalId });
        await this.respond(id, r);
      } catch (e) {
        await this.respondError(id, -32000, e instanceof Error ? e.message : String(e));
      }
      return;
    }

    if (method === 'terminal/kill') {
      try {
        await invoke('terminal_kill', { terminalId: String(params.terminalId ?? '') });
        await this.respond(id, {});
      } catch (e) {
        await this.respondError(id, -32000, e instanceof Error ? e.message : String(e));
      }
      return;
    }

    if (method === 'terminal/release') {
      try {
        await invoke('terminal_release', { terminalId: String(params.terminalId ?? '') });
        await this.respond(id, {});
      } catch (e) {
        await this.respondError(id, -32000, e instanceof Error ? e.message : String(e));
      }
      return;
    }

    if (method === 'terminal/wait_for_exit') {
      try {
        const r = await invoke('terminal_wait_for_exit', {
          terminalId: String(params.terminalId ?? ''),
        });
        await this.respond(id, r);
      } catch (e) {
        await this.respondError(id, -32000, e instanceof Error ? e.message : String(e));
      }
      return;
    }

    // Unknown server request
    await this.respondError(id, -32601, `Method not found: ${method}`);
  }

  private async request(method: string, params: unknown, timeoutMs = 600_000): Promise<unknown> {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`ACP request timeout: ${method}`));
        }
      }, timeoutMs);
    });
    await invoke('agent_write', { agentId: this.agentId, line: payload });
    return promise;
  }

  async respond(id: number | string, result: unknown) {
    const payload = JSON.stringify({ jsonrpc: '2.0', id, result });
    await invoke('agent_write', { agentId: this.agentId, line: payload });
  }

  async respondError(id: number | string, code: number, message: string) {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code, message },
    });
    await invoke('agent_write', { agentId: this.agentId, line: payload });
  }

  async initialize() {
    return this.request(
      'initialize',
      {
        protocolVersion: 1,
        clientInfo: { name: 'gorkX', version: '0.1.0' },
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: false },
          terminal: true,
          meta: { 'x.ai/folderTrust': { interactive: true } },
        },
      },
      30_000,
    );
  }

  /**
   * Use cached ~/.grok/auth.json — required by grok agent after initialize.
   */
  async authenticate(methodId = 'cached_token') {
    return this.request('authenticate', { methodId }, 30_000);
  }

  async newSession(cwd: string): Promise<SessionInfo> {
    this.sessionCwd = cwd;
    const result = (await this.request('session/new', {
      cwd,
      mcpServers: [],
    })) as SessionInfo;
    return result;
  }

  async loadSession(sessionId: string, cwd: string): Promise<SessionInfo> {
    this.sessionCwd = cwd;
    const raw = (await this.request('session/load', {
      sessionId,
      cwd,
      mcpServers: [],
    })) as SessionInfo & { _meta?: { sessionId?: string } };
    // grok may return sessionId only under _meta on load
    const sid = raw.sessionId || raw._meta?.sessionId || sessionId;
    return { ...raw, sessionId: sid };
  }

  /**
   * List recent sessions for a cwd (Grok extension).
   * Method: `_x.ai/sessions/list`
   * Note: without cwd this can return a large global list — always prefer cwd when possible.
   */
  async listSessions(cwd?: string): Promise<
    Array<{
      sessionId: string;
      title?: string | null;
      cwd?: string;
      modelId?: string;
      lastChangeUnixMs?: number;
    }>
  > {
    const raw = (await this.request(
      '_x.ai/sessions/list',
      cwd ? { cwd } : {},
      15_000,
    )) as {
      result?: { sessions?: Array<Record<string, unknown>> };
      sessions?: Array<Record<string, unknown>>;
    };
    const list = raw?.result?.sessions ?? raw?.sessions ?? [];
    return list.map((s) => ({
      sessionId: String(s.sessionId ?? ''),
      title: (s.title as string | null) ?? null,
      cwd: s.cwd as string | undefined,
      modelId: s.modelId as string | undefined,
      lastChangeUnixMs: s.lastChangeUnixMs as number | undefined,
    }));
  }

  /**
   * Delete a Grok session from the local session store (real delete).
   * Prefer `_x.ai/session/delete`; fall back to ACP `session/delete`.
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!sessionId) return;
    try {
      await this.request('_x.ai/session/delete', { sessionId }, 15_000);
      return;
    } catch {
      /* try standard ACP */
    }
    try {
      await this.request('session/delete', { sessionId }, 15_000);
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  /**
   * Copy a saved Grok Build session into a new local session. This is not a
   * slash prompt: the kernel copies the persisted transcript and plan state,
   * while the source session remains untouched.
   */
  async forkSession(sessionId: string, cwd: string): Promise<ForkSessionResult> {
    const raw = (await this.request('_x.ai/session/fork', {
      sourceSessionId: sessionId,
      sourceCwd: cwd,
      newCwd: cwd,
    }, 30_000)) as ForkSessionResult | { result?: ForkSessionResult };
    const result = ('result' in raw && raw.result ? raw.result : raw) as ForkSessionResult;
    if (!result?.newSessionId) throw new Error('Kernel did not return a forked session ID');
    return result;
  }

  /**
   * Ask the kernel's native non-blocking side-question endpoint. This does
   * not enqueue a normal `session/prompt`, so an active task keeps running
   * and the returned answer does not become part of the main turn.
   */
  async askBtw(sessionId: string, question: string): Promise<BtwResult> {
    const params = { sessionId, question };
    let raw: unknown;
    try {
      raw = await this.request('x.ai/btw', params, 120_000);
    } catch (error) {
      // Some stdio builds retain underscored compatibility routes. Only try
      // it after an explicit method error, never after an answer/model error.
      if (!/method not found/i.test(error instanceof Error ? error.message : String(error))) throw error;
      raw = await this.request('_x.ai/btw', params, 120_000);
    }
    const value = raw && typeof raw === 'object' && 'result' in raw && (raw as { result?: unknown }).result
      ? (raw as { result: unknown }).result
      : raw;
    const answer = value && typeof value === 'object' && typeof (value as { answer?: unknown }).answer === 'string'
      ? (value as { answer: string }).answer
      : '';
    if (!answer) throw new Error('Kernel returned an empty /btw answer');
    return { answer };
  }

  /**
   * Read the engine's live task snapshot. This is a local ACP query, not a
   * model prompt: it exposes the current model, turns and context capacity.
   */
  async getSessionInfo(sessionId: string): Promise<SessionSnapshot> {
    let raw: unknown;
    try {
      raw = await this.request('x.ai/session/info', { sessionId }, 15_000);
    } catch (error) {
      // The bundled 0.2.110 compatibility server exposes this endpoint under
      // the underscored route. Only fall back for a missing method so actual
      // session errors remain visible to the person using the app.
      if (!/method not found/i.test(error instanceof Error ? error.message : String(error))) throw error;
      raw = await this.request('_x.ai/session/info', { sessionId }, 15_000);
    }
    const value = raw && typeof raw === 'object' && 'result' in raw && (raw as { result?: unknown }).result
      ? (raw as { result: unknown }).result
      : raw;
    if (!value || typeof value !== 'object') throw new Error('Kernel returned an invalid task info snapshot');
    const info = value as SessionSnapshot;
    if (!info.sessionId || !info.cwd || !info.context) throw new Error('Kernel returned an incomplete task info snapshot');
    return info;
  }

  /** List the kernel's durable checkpoints. No conversation or files are changed. */
  async rewindPoints(sessionId: string): Promise<RewindPoint[]> {
    const raw = (await this.request('_x.ai/rewind/points', { sessionId }, 15_000)) as Record<string, unknown>;
    const nested = raw.result && typeof raw.result === 'object' ? raw.result as Record<string, unknown> : {};
    const points = raw.rewindPoints ?? raw.rewind_points ?? nested.rewindPoints ?? nested.rewind_points;
    if (!Array.isArray(points)) return [];
    return points.flatMap((point: unknown) => {
      const row = point as Record<string, unknown>;
      const promptIndex = typeof row.promptIndex === 'number' ? row.promptIndex : row.prompt_index;
      if (typeof promptIndex !== 'number' || !Number.isInteger(promptIndex) || promptIndex < 0) return [];
      return [{
        promptIndex,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : typeof row.created_at === 'string' ? row.created_at : '',
        numFileSnapshots: typeof row.numFileSnapshots === 'number' ? row.numFileSnapshots : typeof row.num_file_snapshots === 'number' ? row.num_file_snapshots : 0,
        hasFileChanges: row.hasFileChanges === true || row.has_file_changes === true,
        promptPreview: typeof row.promptPreview === 'string' ? row.promptPreview : typeof row.prompt_preview === 'string' ? row.prompt_preview : null,
      }];
    });
  }

  /**
   * Execute an explicit, user-selected rollback. `force` stays false: callers
   * must never silently overwrite a file conflict.
   */
  async rewind(
    sessionId: string,
    targetPromptIndex: number,
    mode: RewindMode,
  ): Promise<RewindResult> {
    const raw = (await this.request('_x.ai/rewind/execute', {
      sessionId,
      targetPromptIndex,
      mode,
      force: false,
    }, 30_000)) as Record<string, unknown>;
    const result = raw.result && typeof raw.result === 'object' ? raw.result as Record<string, unknown> : raw;
    const files = (value: unknown) => Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, 500)
      : [];
    const conflicts = Array.isArray(result.conflicts)
      ? result.conflicts.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const row = item as Record<string, unknown>;
          const path = typeof row.path === 'string' ? row.path : '';
          const conflictType = typeof row.conflictType === 'string'
            ? row.conflictType
            : typeof row.conflict_type === 'string' ? row.conflict_type : 'unknown';
          return path ? [{ path, conflictType }] : [];
        })
      : [];
    return {
      success: result.success === true,
      targetPromptIndex: typeof result.targetPromptIndex === 'number'
        ? result.targetPromptIndex
        : typeof result.target_prompt_index === 'number' ? result.target_prompt_index : targetPromptIndex,
      mode: result.mode === 'conversation_only' || result.mode === 'files_only' || result.mode === 'all'
        ? result.mode
        : mode,
      revertedFiles: files(result.revertedFiles ?? result.reverted_files),
      cleanFiles: files(result.cleanFiles ?? result.clean_files),
      conflicts,
      promptText: typeof result.promptText === 'string'
        ? result.promptText
        : typeof result.prompt_text === 'string' ? result.prompt_text : null,
      error: typeof result.error === 'string' ? result.error : null,
    };
  }

  async prompt(
    sessionId: string,
    text: string,
    resources: PromptResourceLink[] = [],
  ): Promise<PromptResult> {
    const prompt: unknown[] = [{ type: 'text', text }];
    for (const resource of resources) {
      const path = resource.path.trim();
      if (!path) continue;
      // file:///... URI with every path segment escaped; resource_link is ACP baseline.
      const uri = `file://${path.split('/').map(encodeURIComponent).join('/')}`;
      prompt.push({
        type: 'resource_link',
        name: resource.name || path.split('/').pop() || 'attachment',
        uri,
        ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
        ...(typeof resource.size === 'number' ? { size: resource.size } : {}),
      });
    }
    const result = (await this.request('session/prompt', {
      sessionId,
      prompt,
    })) as PromptResult;
    if (result) this.onUsageMeta?.(result);
    return result;
  }

  async cancel(sessionId: string) {
    try {
      await this.request('session/cancel', { sessionId }, 10_000);
    } catch {
      // optional method
    }
  }

  /** Compress history — Grok `_x.ai/compact_conversation`. */
  async compact(sessionId: string, instructions?: string) {
    const params: Record<string, unknown> = { sessionId };
    if (instructions) params.instructions = instructions;
    // Some builds expect a string field; try object first.
    try {
      return await this.request('_x.ai/compact_conversation', params, 120_000);
    } catch {
      return this.request(
        '_x.ai/compact_conversation',
        instructions ? { sessionId, context: instructions } : { sessionId },
        120_000,
      );
    }
  }

  /** Codex-like plan vs agent. Verified: session/set_mode { modeId: "plan"|"default"|… } */
  async setMode(sessionId: string, modeId: string) {
    return this.request(
      'session/set_mode',
      { sessionId, modeId },
      15_000,
    );
  }

  /** Verified: session/set_model { sessionId, modelId } */
  async setModel(sessionId: string, modelId: string) {
    return this.request(
      'session/set_model',
      { sessionId, modelId },
      15_000,
    );
  }

  /**
   * Re-read App GROK_HOME `config.toml` in this live Grok Build process.
   * This makes a newly saved custom provider selectable without requiring the
   * user to abandon or restart an existing task.
   */
  async reloadModels(): Promise<{ models?: number }> {
    const raw = (await this.request('_x.ai/internal/reload_models', {}, 15_000)) as
      | { models?: number; result?: { models?: number } }
      | null;
    return raw?.result ?? raw ?? {};
  }

  /** Grok Build ACP extension. Hooks are discovered and executed by the engine. */
  async listHooks(sessionId: string): Promise<HooksSnapshot> {
    const raw = (await this.request('_x.ai/hooks/list', { sessionId }, 15_000)) as
      | HooksSnapshot
      | { result?: HooksSnapshot };
    return ('result' in raw && raw.result ? raw.result : raw) as HooksSnapshot;
  }

  async manageHooks(
    sessionId: string,
    action: { type: 'reload' | 'trust' | 'untrust' } | { type: 'enable' | 'disable'; hookName: string },
  ): Promise<HooksSnapshot> {
    const raw = (await this.request('_x.ai/hooks/action', { sessionId, action }, 15_000)) as
      | HooksSnapshot
      | { result?: HooksSnapshot };
    return ('result' in raw && raw.result ? raw.result : raw) as HooksSnapshot;
  }

  /**
   * Create an isolated git worktree + linked session.
   * Verified: `_x.ai/git/worktree/create` needs sessionId + sourcePath.
   * Returns async "creating" then progress on `_x.ai/git/worktree/status`.
   */
  async createWorktree(
    sessionId: string,
    sourcePath: string,
    name?: string,
  ): Promise<{
    status?: string;
    sessionId?: string;
    worktreePath?: string;
    sourceGitRoot?: string;
  }> {
    const raw = (await this.request(
      '_x.ai/git/worktree/create',
      {
        sessionId,
        sourcePath,
        ...(name ? { name } : {}),
      },
      60_000,
    )) as { result?: Record<string, unknown> } & Record<string, unknown>;
    const r = (raw?.result ?? raw) as Record<string, unknown>;
    const created = {
      status: r.status as string | undefined,
      sessionId: (r.sessionId as string | undefined) ?? sessionId,
      worktreePath: r.worktreePath as string | undefined,
      sourceGitRoot: r.sourceGitRoot as string | undefined,
    };

    // Async CoW — wait for ready/error notification (or short timeout).
    if (created.status === 'creating' && created.sessionId) {
      const waitSid = created.sessionId;
      await Promise.race([
        new Promise<{ worktreePath?: string; sessionId?: string }>((resolve) => {
          this.worktreeWaiters.set(waitSid, { resolve });
        }),
        new Promise<{ worktreePath?: string; sessionId?: string }>((resolve) =>
          setTimeout(() => resolve({}), 12_000),
        ),
      ]).then((extra) => {
        if (extra.worktreePath) created.worktreePath = extra.worktreePath;
        if (extra.sessionId) created.sessionId = extra.sessionId;
        if (!created.status || created.status === 'creating') {
          created.status = extra.worktreePath ? 'ready' : created.status;
        }
      });
      this.worktreeWaiters.delete(waitSid);
    }
    return created;
  }

  async listWorktrees(): Promise<unknown[]> {
    const raw = (await this.request('_x.ai/git/worktree/list', {}, 15_000)) as {
      result?: unknown[];
    };
    return (raw?.result as unknown[]) ?? [];
  }

  /** Native Grok Build control plane for a child created by its task tool. */
  async cancelSubagent(subagentId: string): Promise<{
    subagentId: string;
    cancelled: boolean;
    outcome?: { kind?: string; status?: string };
  }> {
    const raw = (await this.request('_x.ai/subagent/cancel', { subagentId }, 15_000)) as {
      result?: Record<string, unknown>;
    } & Record<string, unknown>;
    const result = (raw.result ?? raw) as Record<string, unknown>;
    const outcome = result.outcome;
    return {
      subagentId: String(result.subagentId ?? subagentId),
      cancelled: Boolean(result.cancelled),
      outcome:
        outcome && typeof outcome === 'object'
          ? {
              kind: typeof (outcome as Record<string, unknown>).kind === 'string'
                ? String((outcome as Record<string, unknown>).kind)
                : undefined,
              status: typeof (outcome as Record<string, unknown>).status === 'string'
                ? String((outcome as Record<string, unknown>).status)
                : undefined,
            }
          : undefined,
    };
  }

  /** Read-only reconciliation after reconnect; returns only engine-owned state. */
  async listRunningSubagents(sessionId: string): Promise<unknown[]> {
    const raw = (await this.request('_x.ai/subagent/list_running', { sessionId }, 15_000)) as {
      result?: { subagents?: unknown[] };
      subagents?: unknown[];
    };
    return raw.result?.subagents ?? raw.subagents ?? [];
  }

  /** Fetch an engine-owned snapshot; completed output is returned only on demand. */
  async getSubagent(subagentId: string): Promise<Record<string, unknown> | null> {
    const raw = (await this.request('_x.ai/subagent/get', { subagentId, block: false }, 15_000)) as {
      result?: { snapshot?: Record<string, unknown> | null };
      snapshot?: Record<string, unknown> | null;
    };
    return raw.result?.snapshot ?? raw.snapshot ?? null;
  }

  async stop() {
    this.unlistenLine?.();
    this.unlistenExit?.();
    this.unlistenLine = null;
    this.unlistenExit = null;
    for (const [, p] of this.pending) {
      p.reject(new Error('agent stopped'));
    }
    this.pending.clear();
    await invoke('agent_stop', { agentId: this.agentId });
  }
}

export async function fetchGrokStatus(grokCmd?: string): Promise<GrokStatus> {
  return invoke<GrokStatus>('grok_status', { grokCmd: grokCmd ?? null });
}

export async function runKernelDoctor(grokCmd?: string): Promise<KernelDoctor> {
  return invoke<KernelDoctor>('kernel_doctor', { grokCmd: grokCmd ?? null });
}

export async function stopAllAgents(): Promise<number> {
  try {
    return await invoke<number>('agent_stop_all');
  } catch {
    return 0;
  }
}

export function extractUpdateText(
  update: SessionUpdate,
): { kind: 'text' | 'thought' | 'user' | null; text: string } {
  const kind = update.sessionUpdate;
  if (kind === 'agent_message_chunk') {
    return { kind: 'text', text: textOf(update.content) };
  }
  if (kind === 'agent_thought_chunk') {
    return { kind: 'thought', text: textOf(update.content) };
  }
  if (kind === 'user_message_chunk') {
    return { kind: 'user', text: textOf(update.content) };
  }
  return { kind: null, text: '' };
}

export type AcpImageBlock = {
  data: string;
  mimeType: string;
};

/**
 * ACP image blocks can arrive as a streamed message or as tool-call content.
 * Keep the parser data-only: only a bounded base64 raster payload may reach
 * the local persistence command.
 */
export function extractUpdateImages(update: SessionUpdate): AcpImageBlock[] {
  const images: AcpImageBlock[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 3 || images.length >= 8 || !value) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const row = value as Record<string, unknown>;
    if (
      row.type === 'image' &&
      typeof row.data === 'string' &&
      typeof row.mimeType === 'string' &&
      row.data.length > 0 &&
      row.data.length <= 17 * 1024 * 1024 &&
      /^(image\/png|image\/jpeg|image\/gif|image\/webp)$/.test(row.mimeType)
    ) {
      images.push({ data: row.data, mimeType: row.mimeType });
      return;
    }
    if ('content' in row) visit(row.content, depth + 1);
  };
  const raw = update as Record<string, unknown>;
  visit(raw.content);
  return images;
}

/** True if string is a protocol call id (not for humans). */
export function isToolCallIdLike(s: string | undefined | null): boolean {
  if (!s) return true;
  const t = s.trim();
  if (!t) return true;
  if (/^call-[0-9a-f-]{8,}/i.test(t)) return true;
  // "call-xxx · completed" style
  if (/^call-[0-9a-f-]+(\s*·\s*\w+)?$/i.test(t)) return true;
  return false;
}

export type ParsedToolUpdate = {
  toolCallId: string;
  /** Human-readable one-liner; empty when this update only carries status. */
  label: string;
  status?: string;
  kind?: string;
  /** Raw English/protocol detail for expand-if-needed */
  rawDetail?: string;
};

/**
 * Parse Grok Build's native subagent lifecycle events. These events are
 * emitted by the engine's task tool; gorkX only renders their state and does
 * not create a second orchestration loop in the desktop shell.
 */
export type ParsedSubagentUpdate = {
  subagentId: string;
  /** Present only when the kernel reports a nested child task. */
  parentSubagentId?: string;
  label: string;
  status: string;
  kind: 'subagent';
};

export function parseSubagentUpdate(update: SessionUpdate): ParsedSubagentUpdate | null {
  const raw = update as Record<string, unknown>;
  const event = String(update.sessionUpdate ?? '');
  if (
    event !== 'subagent_spawned' &&
    event !== 'subagent_progress' &&
    event !== 'subagent_finished'
  ) {
    return null;
  }
  const subagentId = String(raw.subagent_id ?? raw.subagentId ?? raw.child_session_id ?? '');
  if (!subagentId) return null;
  const parent = String(raw.parent_subagent_id ?? raw.parentSubagentId ?? raw.parent_id ?? '');
  // Keep the protocol field only when it points at another task. A self-link
  // would make a renderer recurse forever and is never useful to the user.
  const parentSubagentId = parent && parent !== subagentId ? parent : undefined;

  if (event === 'subagent_spawned') {
    const type = String(raw.subagent_type ?? raw.subagentType ?? 'general-purpose');
    const description = String(raw.description ?? '').trim();
    return {
      subagentId,
      parentSubagentId,
      label: `子任务 · ${type}${description ? ` · ${description}` : ''}`,
      status: 'running',
      kind: 'subagent',
    };
  }
  if (event === 'subagent_progress') {
    const turns = Number(raw.turn_count ?? raw.turns ?? 0);
    const tools = Number(raw.tool_call_count ?? raw.tool_calls ?? 0);
    const usage = Number(raw.context_usage_pct ?? 0);
    const details = [
      turns > 0 ? `${turns} turns` : '',
      tools > 0 ? `${tools} tools` : '',
      usage > 0 ? `${usage}% context` : '',
    ].filter(Boolean);
    return {
      subagentId,
      parentSubagentId,
      // Keep the spawn description as the row title while progress updates.
      label: '',
      status: details.length ? `running · ${details.join(' · ')}` : 'running',
      kind: 'subagent',
    };
  }

  const outcome = String(raw.status ?? 'completed').toLowerCase();
  const error = typeof raw.error === 'string' ? raw.error.trim() : '';
  const tools = Number(raw.tool_calls ?? 0);
  const turns = Number(raw.turns ?? 0);
  const details = [tools > 0 ? `${tools} tools` : '', turns > 0 ? `${turns} turns` : '']
    .filter(Boolean)
    .join(' · ');
  return {
    subagentId,
    parentSubagentId,
    label: error ? `子任务失败 · ${error}` : '',
    status: details ? `${outcome} · ${details}` : outcome,
    kind: 'subagent',
  };
}

/**
 * Build a human-facing tool summary from ACP tool_call / tool_call_update.
 * Never uses toolCallId as the display label.
 */
export function parseToolUpdate(update: SessionUpdate): ParsedToolUpdate | null {
  if (update.sessionUpdate !== 'tool_call' && update.sessionUpdate !== 'tool_call_update') {
    return null;
  }
  const anyU = update as Record<string, unknown>;
  const toolCallId = String(update.toolCallId ?? '');
  const status = update.status != null ? String(update.status) : undefined;

  const meta = (anyU._meta && typeof anyU._meta === 'object'
    ? (anyU._meta as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const xai = (meta['x.ai/tool'] && typeof meta['x.ai/tool'] === 'object'
    ? (meta['x.ai/tool'] as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const toolName = String(xai.name ?? anyU.toolName ?? '');
  const toolLabel = String(xai.label ?? '');
  const kindRaw = String(update.kind ?? xai.kind ?? '').toLowerCase();

  const rawIn =
    anyU.rawInput && typeof anyU.rawInput === 'object'
      ? (anyU.rawInput as Record<string, unknown>)
      : undefined;
  const xaiInput =
    xai.input && typeof xai.input === 'object'
      ? (xai.input as Record<string, unknown>)
      : undefined;

  let pathOrTarget = '';
  let command = '';
  let description = '';

  const pickStr = (...vals: unknown[]) => {
    for (const v of vals) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };

  if (rawIn) {
    command = pickStr(rawIn.command, rawIn.cmd);
    pathOrTarget = pickStr(
      rawIn.url,
      rawIn.uri,
      rawIn.target_file,
      rawIn.file_path,
      rawIn.filePath,
      rawIn.path,
      rawIn.target_directory,
      rawIn.directory,
    );
    description = pickStr(rawIn.description);
  }
  if (xaiInput) {
    if (!command) command = pickStr(xaiInput.command, xaiInput.cmd);
    if (!pathOrTarget) {
      pathOrTarget = pickStr(
        xaiInput.url,
        xaiInput.uri,
        xaiInput.path,
        xaiInput.file,
        xaiInput.directory,
        xaiInput.target_file,
      );
    }
  }

  const locations = anyU.locations;
  if (!pathOrTarget && Array.isArray(locations) && locations[0]) {
    const loc = locations[0] as Record<string, unknown>;
    pathOrTarget = pickStr(loc.path, loc.uri, loc.file);
  }

  // content[] sometimes holds a short description
  if (!description && Array.isArray(anyU.content)) {
    for (const block of anyU.content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      const inner = b.content;
      if (inner && typeof inner === 'object' && typeof (inner as { text?: string }).text === 'string') {
        description = pickStr((inner as { text?: string }).text) || description;
      } else if (typeof b.text === 'string') {
        description = pickStr(b.text) || description;
      }
    }
  }

  let title = typeof update.title === 'string' ? update.title.trim() : '';
  if (isToolCallIdLike(title)) title = '';

  // Prefer human pieces over protocol names
  const nameHint = toolLabel || toolName || title || kindRaw;

  // If this is a pure status tick with no new descriptive fields, leave label empty
  // so UI keeps the previous human title.
  const hasDesc =
    Boolean(title) ||
    Boolean(toolName) ||
    Boolean(toolLabel) ||
    Boolean(command) ||
    Boolean(pathOrTarget) ||
    Boolean(description) ||
    (Boolean(kindRaw) && update.sessionUpdate === 'tool_call');

  let label = '';
  if (hasDesc) {
    label = composeToolLabel({
      title,
      toolName: toolName || nameHint,
      toolLabel,
      kind: kindRaw,
      command,
      path: pathOrTarget,
      description,
    });
  }

  const rawDetail = [title, command, pathOrTarget, description].filter(Boolean).join('\n') || undefined;

  return {
    toolCallId: toolCallId || label || 'tool',
    label,
    status,
    kind: kindRaw || undefined,
    rawDetail,
  };
}

function shortPath(p: string): string {
  const s = p.replace(/^file:\/\//, '').trim();
  if (!s) return '';
  try {
    const url = new URL(s);
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`.slice(0, 56);
  } catch {
    // Local path, command target, or a non-URL protocol token.
  }
  const parts = s.split('/').filter(Boolean);
  if (parts.length <= 2) return s.length > 48 ? `…${s.slice(-46)}` : s;
  return parts.slice(-2).join('/');
}

function composeToolLabel(p: {
  title: string;
  toolName: string;
  toolLabel: string;
  kind: string;
  command: string;
  path: string;
  description: string;
}): string {
  const kind = (p.kind || '').toLowerCase();
  const name = (p.toolName || p.toolLabel || '').toLowerCase();
  const blob = `${p.title} ${name} ${kind}`;

  // Chinese action
  let action = '调用工具';
  if (
    kind.includes('read') ||
    /read_file|read\b/.test(name) ||
    /^read\b/i.test(p.title)
  ) {
    action = '读取文件';
  } else if (
    /playwright|browser|navigate|open_page|click|fill|type_text|select_option|press_key|screenshot/.test(blob)
  ) {
    // Browser MCP remains engine-owned; this only makes its already-emitted
    // tool calls visible and intelligible in gorkX's process timeline.
    action = '浏览器操作';
  } else if (
    kind.includes('edit') ||
    kind.includes('write') ||
    /write|edit|search_replace|str_replace/.test(name)
  ) {
    action = '编辑文件';
  } else if (
    kind.includes('exec') ||
    kind === 'execute' ||
    /run_terminal|bash|shell|command/.test(name) ||
    /^execute\b/i.test(p.title)
  ) {
    action = '执行命令';
  } else if (kind.includes('list') || /list_dir|list files/.test(name) || /list\b/i.test(p.title)) {
    action = '列出目录';
  } else if (/grep|search|find|rg\b/.test(blob)) {
    action = '检索代码';
  } else if (/web_search|search web/.test(blob)) {
    action = '检索网页';
  } else if (/web_fetch|fetch|open_page/.test(blob)) {
    action = '获取网页';
  } else if (/git/.test(blob)) {
    action = 'Git 操作';
  } else if (/imagine|image|video/.test(blob)) {
    action = '生成媒体';
  } else if (p.toolLabel) {
    action = p.toolLabel;
  } else if (p.toolName && !isToolCallIdLike(p.toolName)) {
    // map snake_case tool names
    action = p.toolName.replace(/_/g, ' ');
  }

  if (p.command) {
    const cmd = p.command.replace(/\s+/g, ' ').trim();
    const short = cmd.length > 56 ? `${cmd.slice(0, 54)}…` : cmd;
    return `${action} · ${short}`;
  }
  if (p.path) {
    return `${action} · ${shortPath(p.path)}`;
  }
  if (p.description && p.description.length < 80) {
    return `${action} · ${p.description}`;
  }
  // Title like `Read \`/path\`` or `Execute \`cmd\``
  if (p.title && !isToolCallIdLike(p.title)) {
    const m = p.title.match(/`([^`]+)`/);
    if (m) {
      const inner = m[1];
      if (inner.includes('/') || inner.startsWith('~')) {
        return `${action} · ${shortPath(inner)}`;
      }
      const short = inner.length > 56 ? `${inner.slice(0, 54)}…` : inner;
      return `${action} · ${short}`;
    }
    // bare tool name title
    if (!/^[a-z_]+$/.test(p.title)) {
      return p.title.length > 72 ? `${p.title.slice(0, 70)}…` : p.title;
    }
  }
  return action;
}

/** @deprecated Prefer parseToolUpdate — kept for any external callers. */
export function formatToolLine(update: SessionUpdate): string | null {
  const p = parseToolUpdate(update);
  if (!p) return null;
  if (p.label) {
    return p.status ? `${p.label} · ${p.status}` : p.label;
  }
  if (p.status) return p.status;
  return null;
}

export interface PlanEntry {
  id: string;
  text: string;
  status?: string;
  /** User selection for Apply plan */
  checked: boolean;
}

export interface ParsedPlan {
  text: string;
  entries: PlanEntry[];
}

/** Parse ACP plan updates into display text + checkable entries. */
export function parsePlanUpdate(update: SessionUpdate): ParsedPlan | null {
  if (update.sessionUpdate !== 'plan') return null;
  const anyU = update as Record<string, unknown>;

  const raw =
    (anyU.entries as unknown[]) ||
    (anyU.plan as unknown[]) ||
    (anyU.steps as unknown[]) ||
    null;

  if (Array.isArray(raw) && raw.length > 0) {
    const entries: PlanEntry[] = raw.map((e, i) => {
      if (typeof e === 'string') {
        return { id: `p${i}`, text: e, checked: true };
      }
      if (e && typeof e === 'object') {
        const o = e as Record<string, unknown>;
        const content =
          (o.content as string) ||
          (o.text as string) ||
          (o.title as string) ||
          (o.description as string) ||
          JSON.stringify(o);
        const status = o.status ? String(o.status) : undefined;
        const id = String(o.id ?? o.stepId ?? `p${i}`);
        // completed steps default unchecked for "apply remaining"
        const done = status && /done|complete|completed|cancelled/i.test(status);
        return { id, text: content, status, checked: !done };
      }
      return { id: `p${i}`, text: String(e), checked: true };
    });
    const text = entries
      .map((e, i) => {
        const status = e.status ? ` [${e.status}]` : '';
        return `${i + 1}. ${e.text}${status}`;
      })
      .join('\n');
    return { text, entries };
  }

  const text = textOf(anyU.content ?? anyU.text);
  if (text) {
    // Split numbered lines into entries when possible
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const numbered = lines.filter((l) => /^\d+[\).\]]\s+/.test(l) || /^[-*]\s+/.test(l));
    if (numbered.length >= 2) {
      const entries = numbered.map((l, i) => ({
        id: `p${i}`,
        text: l.replace(/^\d+[\).\]]\s+/, '').replace(/^[-*]\s+/, ''),
        checked: true,
      }));
      return { text, entries };
    }
    return { text, entries: [{ id: 'p0', text, checked: true }] };
  }

  try {
    const { sessionUpdate: _, ...rest } = anyU;
    const s = JSON.stringify(rest, null, 2);
    if (s === '{}') return null;
    return { text: s, entries: [{ id: 'p0', text: s, checked: true }] };
  } catch {
    return null;
  }
}

/** @deprecated prefer parsePlanUpdate */
export function formatPlanUpdate(update: SessionUpdate): string | null {
  return parsePlanUpdate(update)?.text ?? null;
}
