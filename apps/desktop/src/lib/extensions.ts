/** Extensions hub: Skills / MCP / Plugins — backed by Grok kernel discovery. */
import { invoke } from '@tauri-apps/api/core';

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  scope: string;
  userInvocable: boolean;
  whenToUse: string;
}

export interface McpServerInfo {
  name: string;
  enabled: boolean;
  scope: string;
  command?: string | null;
  url?: string | null;
  args: string[];
  envKeys: string[];
  detail: string;
}

export interface PluginInfo {
  name: string;
  enabled: boolean;
  scope: string;
  version?: string | null;
  path?: string | null;
  description: string;
  raw: unknown;
}

export interface ExtensionsSnapshot {
  skills: SkillInfo[];
  mcp: McpServerInfo[];
  plugins: PluginInfo[];
  skillRoots: string[];
  configPath: string;
  error?: string | null;
}

export async function fetchExtensionsSnapshot(
  project?: string,
  grokCmd?: string,
): Promise<ExtensionsSnapshot> {
  return invoke<ExtensionsSnapshot>('extensions_snapshot', {
    project: project || null,
    grokCmd: grokCmd || null,
  });
}

export async function openSkillsDir(): Promise<string> {
  return invoke('extensions_open_skills_dir');
}

export async function openGrokConfig(): Promise<string> {
  return invoke('extensions_open_config');
}

export async function openExtensionPath(path: string): Promise<string> {
  return invoke('extensions_open_path', { path });
}

export async function runMcpDoctor(grokCmd?: string): Promise<string> {
  return invoke('extensions_mcp_doctor', { grokCmd: grokCmd || null });
}

export async function installPlugin(source: string, grokCmd?: string): Promise<string> {
  return invoke('extensions_plugin_install', {
    source,
    grokCmd: grokCmd || null,
  });
}

export async function setPluginEnabled(
  name: string,
  enabled: boolean,
  grokCmd?: string,
): Promise<string> {
  return invoke('extensions_plugin_set_enabled', {
    name,
    enabled,
    grokCmd: grokCmd || null,
  });
}

export async function uninstallPlugin(name: string, grokCmd?: string): Promise<string> {
  return invoke('extensions_plugin_uninstall', {
    name,
    grokCmd: grokCmd || null,
  });
}

export async function fetchMarketplace(grokCmd?: string): Promise<{
  sources: unknown[];
  raw: string;
}> {
  return invoke('extensions_marketplace', { grokCmd: grokCmd || null });
}

/** Enable an isolated Playwright MCP pointed at Chrome (agent browser control). */
export async function enablePlaywrightChromeMcp(
  grokCmd?: string,
  allowedOrigins?: string,
): Promise<string> {
  return invoke<string>('extensions_mcp_add_playwright_chrome', {
    grokCmd: grokCmd || null,
    allowedOrigins: allowedOrigins?.trim() || null,
  });
}

export async function removeMcp(name: string, grokCmd?: string): Promise<string> {
  return invoke('extensions_mcp_remove', { name, grokCmd: grokCmd || null });
}

export interface FileHit {
  path: string;
  name: string;
}

export async function listWorkspaceFiles(
  cwd: string,
  query?: string,
  limit = 40,
): Promise<FileHit[]> {
  return invoke('workspace_list_files', {
    cwd,
    query: query || null,
    limit,
  });
}
