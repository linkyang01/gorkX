import { invoke } from '@tauri-apps/api/core';

export const HOOK_VERIFICATION_HOOK_FILE = 'gorkx-session-start-verification.json';
export const HOOK_VERIFICATION_MARKER_DIR = '.grok/gorkx-hook-verification';
export const HOOK_VERIFICATION_TASK_PROMPT =
  'Hook verification task. Reply exactly HOOK_VERIFICATION_TASK_OK. Do not call tools, modify files, or inspect project files.';

export interface HookVerificationProject {
  projectPath: string;
  markerRelativePath: string;
  markerToken: string;
  hookFileName: string;
}

export type HookVerificationMarkerStatus = 'missing' | 'match' | 'mismatch';

export interface HookVerificationMarker {
  status: HookVerificationMarkerStatus;
  path: string;
}

export function createHookVerificationProject(): Promise<HookVerificationProject> {
  return invoke<HookVerificationProject>('workspace_create_hook_verification_project');
}

export function readHookVerificationMarker(
  projectPath: string,
  markerRelativePath: string,
  markerToken: string,
): Promise<HookVerificationMarker> {
  return invoke<HookVerificationMarker>('workspace_read_hook_verification_marker', {
    cwd: projectPath,
    markerRelativePath,
    markerToken,
  });
}

export function removeHookVerificationProject(projectPath: string): Promise<void> {
  return invoke<void>('workspace_remove_hook_verification_project', { projectPath });
}
