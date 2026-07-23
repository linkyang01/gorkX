import { invoke } from '@tauri-apps/api/core';

export interface SubagentsConfigSnapshot {
  grokHome: string;
  configPath: string;
  /** Undefined means Grok Build's default: enabled. */
  enabled?: boolean | null;
  exploreEnabled?: boolean | null;
  planEnabled?: boolean | null;
  note: string;
}

export function fetchSubagentsConfig(): Promise<SubagentsConfigSnapshot> {
  return invoke<SubagentsConfigSnapshot>('subagents_config_get');
}

export function setSubagentsEnabled(enabled: boolean): Promise<SubagentsConfigSnapshot> {
  return invoke<SubagentsConfigSnapshot>('subagents_config_set_enabled', { enabled });
}

export function setSubagentTypeEnabled(
  agentType: 'explore' | 'plan',
  enabled: boolean,
): Promise<SubagentsConfigSnapshot> {
  return invoke<SubagentsConfigSnapshot>('subagents_config_set_type_enabled', { agentType, enabled });
}
