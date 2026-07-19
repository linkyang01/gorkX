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
  ): Promise<AcpClient> {
    const info = await invoke<AgentInfo>('agent_start', {
      permissionMode,
      grokCmd: grokCmd ?? null,
      reasoningEffort: reasoningEffort ?? null,
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

  /** Grok Build ACP extension. Hooks are discovered and executed by the engine. */
  async listHooks(sessionId: string): Promise<HooksSnapshot> {
    const raw = (await this.request('x.ai/hooks/list', { sessionId }, 15_000)) as
      | HooksSnapshot
      | { result?: HooksSnapshot };
    return ('result' in raw && raw.result ? raw.result : raw) as HooksSnapshot;
  }

  async manageHooks(
    sessionId: string,
    action: { type: 'reload' | 'trust' | 'untrust' } | { type: 'enable' | 'disable'; hookName: string },
  ): Promise<HooksSnapshot> {
    const raw = (await this.request('x.ai/hooks/action', { sessionId, action }, 15_000)) as
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
    const raw = (await this.request('x.ai/subagent/cancel', { subagentId }, 15_000)) as {
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
    const raw = (await this.request('x.ai/subagent/list_running', { sessionId }, 15_000)) as {
      result?: { subagents?: unknown[] };
      subagents?: unknown[];
    };
    return raw.result?.subagents ?? raw.subagents ?? [];
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

  if (event === 'subagent_spawned') {
    const type = String(raw.subagent_type ?? raw.subagentType ?? 'general-purpose');
    const description = String(raw.description ?? '').trim();
    return {
      subagentId,
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
