import { invoke } from '@tauri-apps/api/core';

export interface GitFileEntry {
  path: string;
  status: string;
}

export interface GitSnapshot {
  ok: boolean;
  branch: string;
  dirty: boolean;
  files: GitFileEntry[];
  diff: string;
  error: string;
}

export async function fetchGitSnapshot(cwd: string): Promise<GitSnapshot> {
  return invoke<GitSnapshot>('git_snapshot', { cwd });
}
