import { invoke } from '@tauri-apps/api/core';

export interface ProjectInstructionsSnapshot {
  path: string;
  exists: boolean;
  content: string;
}

export function readProjectInstructions(cwd: string): Promise<ProjectInstructionsSnapshot> {
  return invoke<ProjectInstructionsSnapshot>('workspace_read_agents_md', { cwd });
}

export function writeProjectInstructions(
  cwd: string,
  content: string,
): Promise<ProjectInstructionsSnapshot> {
  return invoke<ProjectInstructionsSnapshot>('workspace_write_agents_md', { cwd, content });
}
