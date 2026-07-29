import { invoke } from '@tauri-apps/api/core';

export type AgentProfileSummary = {
  name: string;
  displayName: string;
  description: string;
  source: string;
  editable: boolean;
  content?: string | null;
};

export const listAgentProfiles = () => invoke<AgentProfileSummary[]>('agent_profiles_list');
export const saveAgentProfile = (displayName: string, description: string, instructions: string) =>
  invoke<AgentProfileSummary>('agent_profile_save', { displayName, description, instructions });
export const removeAgentProfile = (name: string) => invoke('agent_profile_remove', { name });
