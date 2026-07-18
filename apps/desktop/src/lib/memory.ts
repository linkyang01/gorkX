import { invoke } from '@tauri-apps/api/core';

export interface MemoryFileRow {
  path: string;
  name: string;
  scope: string;
  size: number;
}

export interface MemoryStatus {
  enabled: boolean;
  autoLearn: boolean;
  memoryDir: string;
  configPath: string;
  files: MemoryFileRow[];
  note: string;
  userChars: number;
  agentChars: number;
  projectChars: number;
}

function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
}

export async function fetchMemoryStatus(project?: string): Promise<MemoryStatus | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<MemoryStatus>('memory_status', { project: project || null });
  } catch {
    return null;
  }
}

export async function setMemoryEnabled(enabled: boolean): Promise<MemoryStatus | null> {
  if (!isTauri()) return null;
  return invoke<MemoryStatus>('memory_set_enabled', { enabled });
}

export async function setMemoryAutoLearn(enabled: boolean): Promise<MemoryStatus | null> {
  if (!isTauri()) return null;
  return invoke<MemoryStatus>('memory_set_auto_learn', { enabled });
}

export async function readMemoryFile(path: string): Promise<string> {
  return invoke<string>('memory_read_file', { path });
}

export async function openMemoryDir(): Promise<string> {
  return invoke<string>('memory_open_dir');
}

export async function appendMemoryNote(
  scope: 'user' | 'agent' | 'project',
  text: string,
  project?: string,
): Promise<MemoryStatus | null> {
  if (!isTauri()) return null;
  return invoke<MemoryStatus>('memory_append_note', {
    scope,
    text,
    project: project || null,
  });
}

export async function fetchMemoryInjection(project?: string): Promise<string> {
  if (!isTauri()) return '';
  try {
    return await invoke<string>('memory_injection_context', { project: project || null });
  } catch {
    return '';
  }
}

export async function recordSessionMemory(
  project: string | undefined,
  title: string,
  summary: string,
): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('memory_record_session', {
      project: project || null,
      title,
      summary,
    });
  } catch {
    /* best-effort */
  }
}
