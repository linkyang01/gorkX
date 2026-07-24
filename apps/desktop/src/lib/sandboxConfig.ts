import { invoke } from '@tauri-apps/api/core';

export type SandboxProfile = 'off' | 'workspace' | 'read-only' | 'strict' | 'devbox';

export interface SandboxConfigSnapshot {
  grokHome: string;
  configPath: string;
  /** Null means Grok Build's documented default: off. */
  profile: string | null;
  note: string;
}

export function fetchSandboxConfig(): Promise<SandboxConfigSnapshot> {
  return invoke<SandboxConfigSnapshot>('sandbox_config_get');
}

export function setSandboxProfile(profile: SandboxProfile): Promise<SandboxConfigSnapshot> {
  return invoke<SandboxConfigSnapshot>('sandbox_config_set_profile', { profile });
}
