import { invoke } from '@tauri-apps/api/core';

export type AgentProfileSummary = {
  name: string;
  displayName: string;
  description: string;
  source: string;
  scope: 'user' | 'project';
  editable: boolean;
  content?: string | null;
};

export const listAgentProfiles = (project?: string) => invoke<AgentProfileSummary[]>('agent_profiles_list', { project });
export const saveAgentProfile = (displayName: string, description: string, instructions: string, existingName?: string) =>
  invoke<AgentProfileSummary>('agent_profile_save', { displayName, description, instructions, existingName });
export const removeAgentProfile = (name: string) => invoke('agent_profile_remove', { name });
