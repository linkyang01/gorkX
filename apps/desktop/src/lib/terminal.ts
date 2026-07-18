import { invoke } from '@tauri-apps/api/core';

export interface ShellResult {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
}

export interface TerminalListItem {
  terminalId: string;
  command: string;
  cwd: string;
  outputLen: number;
  running: boolean;
  exitStatus?: { exitCode?: number | null; signal?: string | null } | null;
}

export interface TerminalOutput {
  output: string;
  truncated: boolean;
  exitStatus?: { exitCode?: number | null; signal?: string | null } | null;
  command?: string;
  cwd?: string;
}

export async function shellExec(command: string, cwd?: string): Promise<ShellResult> {
  return invoke<ShellResult>('shell_exec', { command, cwd: cwd ?? null });
}

export async function listTerminals(): Promise<TerminalListItem[]> {
  return invoke<TerminalListItem[]>('terminal_list');
}

export async function getTerminalOutput(terminalId: string): Promise<TerminalOutput> {
  return invoke<TerminalOutput>('terminal_output', { terminalId });
}

export async function killTerminal(terminalId: string): Promise<void> {
  await invoke('terminal_kill', { terminalId });
}

export async function releaseTerminal(terminalId: string): Promise<void> {
  await invoke('terminal_release', { terminalId });
}
