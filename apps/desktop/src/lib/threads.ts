/** Thread metadata + chat snapshot persistence (SQLite via Tauri, localStorage migrate). */

import { invoke } from '@tauri-apps/api/core';
import type { ReasoningEffort } from './acpClient';

const LS_KEY = 'gorkx.threadMeta.v1';
const MAX_PER_PROJECT = 48;

/** SQLite / meta key when user chats without a project folder. */
export const NO_PROJECT_KEY = '__none__';

export function projectScopeKey(project: string | null | undefined): string {
  const p = (project || '').trim();
  return p || NO_PROJECT_KEY;
}

export interface ThreadMeta {
  id: string;
  title: string;
  sessionId: string | null;
  modelId: string | null;
  cwd: string;
  worktreePath?: string | null;
  effort: ReasoningEffort;
  chatMode: 'agent' | 'plan';
  updatedAt: number;
  /** optional project path when loaded from sqlite */
  project?: string;
  archived?: boolean;
}

export interface ChatLineSnap {
  id: string;
  role: string;
  text: string;
  toolKey?: string | null;
  toolStatus?: string | null;
  toolKind?: string | null;
}

type LsStore = Record<string, ThreadMeta[]>;

function loadLsStore(): LsStore {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as LsStore;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

let migrated = false;

async function migrateLocalStorageOnce(): Promise<void> {
  if (migrated || !isTauri()) return;
  migrated = true;
  try {
    const flag = await invoke<string | null>('store_kv_get', { key: 'migrated_ls_v1' });
    if (flag === '1') return;
    const store = loadLsStore();
    for (const [project, list] of Object.entries(store)) {
      if (!Array.isArray(list)) continue;
      for (const m of list) {
        await invoke('store_upsert_thread', {
          meta: {
            id: m.id,
            project,
            title: m.title || '',
            sessionId: m.sessionId,
            modelId: m.modelId,
            cwd: m.cwd || project,
            worktreePath: m.worktreePath ?? null,
            effort: m.effort || 'high',
            chatMode: m.chatMode || 'agent',
            updatedAt: m.updatedAt || Date.now(),
          },
        });
      }
    }
    await invoke('store_kv_set', { key: 'migrated_ls_v1', value: '1' });
  } catch {
    /* ignore migration errors */
  }
}

function rowToMeta(r: {
  id: string;
  project?: string;
  title: string;
  sessionId?: string | null;
  modelId?: string | null;
  cwd: string;
  worktreePath?: string | null;
  effort: string;
  chatMode: string;
  updatedAt: number;
  archived?: boolean;
}): ThreadMeta {
  return {
    id: r.id,
    project: r.project,
    title: r.title,
    sessionId: r.sessionId ?? null,
    modelId: r.modelId ?? null,
    cwd: r.cwd,
    worktreePath: r.worktreePath,
    effort: (r.effort as ReasoningEffort) || 'high',
    chatMode: r.chatMode === 'plan' ? 'plan' : 'agent',
    updatedAt: r.updatedAt,
    archived: Boolean(r.archived),
  };
}

export async function loadThreadMetas(project: string): Promise<ThreadMeta[]> {
  const scope = projectScopeKey(project);
  await migrateLocalStorageOnce();
  if (isTauri()) {
    try {
      const rows = await invoke<
        Array<{
          id: string;
          project: string;
          title: string;
          sessionId?: string | null;
          modelId?: string | null;
          cwd: string;
          worktreePath?: string | null;
          effort: string;
          chatMode: string;
          updatedAt: number;
          archived?: boolean;
        }>
      >('store_list_threads', { project: scope });
      return rows.map(rowToMeta);
    } catch {
      /* fall through */
    }
  }
  const store = loadLsStore();
  return Array.isArray(store[scope]) ? store[scope] : [];
}

export async function upsertThreadMeta(project: string, meta: ThreadMeta): Promise<void> {
  const scope = projectScopeKey(project);
  const payload = {
    id: meta.id,
    project: scope,
    title: meta.title,
    sessionId: meta.sessionId,
    modelId: meta.modelId,
    cwd: meta.cwd,
    worktreePath: meta.worktreePath ?? null,
    effort: meta.effort,
    chatMode: meta.chatMode,
    updatedAt: Date.now(),
    archived: Boolean(meta.archived),
  };
  if (isTauri()) {
    try {
      await invoke('store_upsert_thread', { meta: payload });
      return;
    } catch {
      /* fall through */
    }
  }
  const store = loadLsStore();
  const list = (store[scope] ?? []).filter((m) => m.id !== meta.id);
  list.unshift({ ...meta, updatedAt: Date.now(), project: scope });
  store[scope] = list.slice(0, MAX_PER_PROJECT);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* */
  }
}

export async function removeThreadMeta(project: string, id: string): Promise<void> {
  const scope = projectScopeKey(project);
  if (isTauri()) {
    try {
      await invoke('store_remove_thread', { project: scope, id });
      return;
    } catch {
      /* */
    }
  }
  const store = loadLsStore();
  store[scope] = (store[scope] ?? []).filter((m) => m.id !== id);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* */
  }
}

export async function homeDir(): Promise<string> {
  if (isTauri()) {
    try {
      return await invoke<string>('home_dir');
    } catch {
      /* */
    }
  }
  return '/';
}

export async function clearProjectStore(scope: string): Promise<void> {
  const key = projectScopeKey(scope);
  if (isTauri()) {
    try {
      await invoke('store_clear_project', { project: key });
    } catch {
      /* */
    }
  }
  const store = loadLsStore();
  delete store[key];
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* */
  }
}

export async function saveChatSnapshot(
  project: string,
  threadId: string,
  lines: ChatLineSnap[],
): Promise<void> {
  if (!threadId || !isTauri()) return;
  const scope = projectScopeKey(project);
  try {
    await invoke('store_save_chat', {
      project: scope,
      threadId,
      lines: lines.map((l) => ({
        id: l.id,
        role: l.role,
        text: l.text,
        toolKey: l.toolKey ?? null,
        toolStatus: l.toolStatus ?? null,
        toolKind: l.toolKind ?? null,
      })),
    });
  } catch {
    /* */
  }
}

export async function loadChatSnapshot(
  project: string,
  threadId: string,
): Promise<ChatLineSnap[]> {
  if (!threadId || !isTauri()) return [];
  try {
    return await invoke<ChatLineSnap[]>('store_load_chat', {
      project: projectScopeKey(project),
      threadId,
    });
  } catch {
    return [];
  }
}

export async function storeDbPath(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>('store_db_path');
  } catch {
    return null;
  }
}

export async function storeDataDir(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>('store_data_dir');
  } catch {
    return null;
  }
}

export async function clearChatCache(project?: string): Promise<number> {
  if (!isTauri()) return 0;
  try {
    const scope = project ? projectScopeKey(project) : null;
    return await invoke<number>('store_clear_chat', { project: scope });
  } catch {
    return 0;
  }
}
