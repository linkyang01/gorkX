import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface PtyOpenResult {
  sessionId: string;
  cwd: string;
  shell: string;
}

export async function ptyOpen(cwd?: string, cols = 100, rows = 28): Promise<PtyOpenResult> {
  return invoke<PtyOpenResult>('pty_open', {
    cwd: cwd ?? null,
    cols,
    rows,
  });
}

export async function ptyWrite(sessionId: string, data: string): Promise<void> {
  await invoke('pty_write', { sessionId, data });
}

export async function ptyResize(sessionId: string, cols: number, rows: number): Promise<void> {
  await invoke('pty_resize', { sessionId, cols, rows });
}

export async function ptyClose(sessionId: string): Promise<void> {
  await invoke('pty_close', { sessionId });
}

export async function onPtyOutput(
  cb: (sessionId: string, data: string) => void,
): Promise<UnlistenFn> {
  return listen<{ sessionId: string; data: string }>('pty://output', (e) => {
    cb(e.payload.sessionId, e.payload.data);
  });
}

export async function onPtyExit(cb: (sessionId: string) => void): Promise<UnlistenFn> {
  return listen<{ sessionId: string }>('pty://exit', (e) => {
    cb(e.payload.sessionId);
  });
}
