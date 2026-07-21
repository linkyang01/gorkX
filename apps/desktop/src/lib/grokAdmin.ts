/** App-owned Grok Build administration surface (never shell-string execution). */
import { invoke } from '@tauri-apps/api/core';

export interface CliSessionRow {
  sessionId: string;
  summary: string;
  status?: string;
  created?: string;
  updated?: string;
}

type AdminResult = { stdout: string; stderr: string; exitCode: number | null };

async function admin(args: string[], grokCmd?: string, cwd?: string): Promise<AdminResult> {
  return invoke<AdminResult>('grok_admin_exec', {
    args,
    grokCmd: grokCmd || null,
    cwd: cwd || null,
  });
}

function output(result: AdminResult): string {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
}

function requireSuccess(result: AdminResult, action: string): string {
  const raw = output(result);
  if (result.exitCode != null && result.exitCode !== 0) {
    throw new Error(raw || `${action} exit ${result.exitCode}`);
  }
  return raw;
}

/** Parse `grok sessions list` table text into rows. */
export function parseSessionsTable(raw: string): CliSessionRow[] {
  const out: CliSessionRow[] = [];
  for (const line of raw.split('\n').map((entry) => entry.trimEnd())) {
    const match = line.match(
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+(\S+)?\s+(\S+)?\s+(\S+)?\s+(.*)$/i,
    );
    if (!match) continue;
    out.push({
      sessionId: match[1],
      created: match[2],
      updated: match[3],
      status: match[4],
      summary: (match[5] || '').trim() || match[1].slice(0, 8),
    });
  }
  return out;
}

export async function sessionsList(grokCmd?: string, limit = 40) {
  const result = await admin(['sessions', 'list', '-n', String(limit)], grokCmd);
  const raw = output(result);
  if (result.exitCode != null && result.exitCode !== 0 && !raw.includes('SESSION ID')) {
    throw new Error(raw || `sessions list exit ${result.exitCode}`);
  }
  return { raw, rows: parseSessionsTable(result.stdout || raw) };
}

export async function sessionsSearch(query: string, grokCmd?: string, limit = 40) {
  const result = await admin(['sessions', 'search', '-n', String(limit), '--', query.trim()], grokCmd);
  const raw = output(result);
  if (result.exitCode != null && result.exitCode !== 0 && !raw.includes('SESSION')) {
    throw new Error(raw || `sessions search exit ${result.exitCode}`);
  }
  return { raw, rows: parseSessionsTable(result.stdout || raw) };
}

export async function sessionsDelete(sessionId: string, grokCmd?: string): Promise<string> {
  return requireSuccess(await admin(['sessions', 'delete', sessionId], grokCmd), 'sessions delete') || 'deleted';
}

export async function exportSessionMarkdown(sessionId: string, outputPath: string, grokCmd?: string): Promise<string> {
  requireSuccess(await admin(['export', sessionId, outputPath], grokCmd), 'export');
  return outputPath;
}

export async function exportSessionClipboard(sessionId: string, grokCmd?: string): Promise<string> {
  return requireSuccess(await admin(['export', sessionId, '--clipboard'], grokCmd), 'export clipboard') || 'copied';
}

export async function worktreeListJson(grokCmd?: string, repo?: string): Promise<unknown[]> {
  const args = ['worktree', 'list', '--json'];
  if (repo) args.push('--repo', repo);
  const result = await admin(args, grokCmd);
  const raw = result.stdout.trim();
  if (result.exitCode != null && result.exitCode !== 0 && !raw) {
    throw new Error((result.stderr || `worktree list exit ${result.exitCode}`).trim());
  }
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object' && Array.isArray((value as { worktrees?: unknown }).worktrees)) {
      return (value as { worktrees: unknown[] }).worktrees;
    }
    return [value];
  } catch {
    return [];
  }
}

export async function worktreeRemove(ids: string[], grokCmd?: string, force = false): Promise<string> {
  if (!ids.length) return '';
  return requireSuccess(await admin(['worktree', 'rm', ...(force ? ['-f'] : []), ...ids], grokCmd), 'worktree rm') || 'removed';
}

export async function worktreeGc(grokCmd?: string): Promise<string> {
  return requireSuccess(await admin(['worktree', 'gc'], grokCmd), 'worktree gc') || 'gc done';
}

export async function inspectProject(cwd: string, grokCmd?: string): Promise<string> {
  const result = await admin(['inspect', '--json'], grokCmd, cwd);
  const raw = output(result);
  if (result.exitCode != null && result.exitCode !== 0 && !result.stdout) {
    throw new Error(raw || `inspect exit ${result.exitCode}`);
  }
  return result.stdout.trim() || raw;
}

export async function memoryClear(scope: 'workspace' | 'global' | 'all', grokCmd?: string, cwd?: string): Promise<string> {
  const flag = scope === 'all' ? '--all' : scope === 'global' ? '--global' : '--workspace';
  return requireSuccess(await admin(['memory', 'clear', flag, '-y'], grokCmd, cwd), 'memory clear') || 'cleared';
}

export async function modelsList(grokCmd?: string): Promise<string> {
  return output(await admin(['models'], grokCmd));
}
