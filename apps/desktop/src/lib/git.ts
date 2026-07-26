import { invoke } from '@tauri-apps/api/core';

export interface GitFileEntry {
  path: string;
  status: string;
}

export interface GitSnapshot {
  ok: boolean;
  /** false when cwd is not a git repo — files are a workspace listing */
  isGit?: boolean;
  branch: string;
  dirty: boolean;
  files: GitFileEntry[];
  diff: string;
  error: string;
}

/** A non-Git preview is allowed only for an explicitly selected project. */
export async function fetchGitSnapshot(
  cwd: string,
  allowWorkspacePreview = false,
): Promise<GitSnapshot> {
  return invoke<GitSnapshot>('git_snapshot', { cwd, allowWorkspacePreview });
}
