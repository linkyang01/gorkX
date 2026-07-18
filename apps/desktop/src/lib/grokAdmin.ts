/** Thin wrappers over `grok` CLI for desktop-complete Grok Build admin surface. */

import { shellExec } from './terminal';

function bin(grokCmd?: string): string {
  return (grokCmd || 'grok').trim() || 'grok';
}

function q(s: string): string {
  return JSON.stringify(s);
}

export interface CliSessionRow {
  sessionId: string;
  summary: string;
  status?: string;
  created?: string;
  updated?: string;
}

/** Parse `grok sessions list` table text into rows. */
export function parseSessionsTable(raw: string): CliSessionRow[] {
  const lines = raw.split('\n').map((l) => l.trimEnd());
  const out: CliSessionRow[] = [];
  for (const line of lines) {
    // UUID-ish first token
    const m = line.match(
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+(\S+)?\s+(\S+)?\s+(\S+)?\s+(.*)$/i,
    );
    if (!m) continue;
    out.push({
      sessionId: m[1],
      created: m[2],
      updated: m[3],
      status: m[4],
      summary: (m[5] || '').trim() || m[1].slice(0, 8),
    });
  }
  return out;
}

export async function sessionsList(
  grokCmd?: string,
  limit = 40,
): Promise<{ raw: string; rows: CliSessionRow[] }> {
  const r = await shellExec(`${q(bin(grokCmd))} sessions list -n ${limit}`);
  const raw = [r.stdout, r.stderr].filter(Boolean).join('\n');
  if (r.exitCode != null && r.exitCode !== 0 && !raw.includes('SESSION ID')) {
    throw new Error(raw || `sessions list exit ${r.exitCode}`);
  }
  return { raw, rows: parseSessionsTable(r.stdout || raw) };
}

export async function sessionsSearch(
  query: string,
  grokCmd?: string,
  limit = 40,
): Promise<{ raw: string; rows: CliSessionRow[] }> {
  const r = await shellExec(
    `${q(bin(grokCmd))} sessions search -n ${limit} ${q(query.trim())}`,
  );
  const raw = [r.stdout, r.stderr].filter(Boolean).join('\n');
  if (r.exitCode != null && r.exitCode !== 0 && !raw.includes('SESSION')) {
    throw new Error(raw || `sessions search exit ${r.exitCode}`);
  }
  return { raw, rows: parseSessionsTable(r.stdout || raw) };
}

export async function sessionsDelete(
  sessionId: string,
  grokCmd?: string,
): Promise<string> {
  const r = await shellExec(`${q(bin(grokCmd))} sessions delete ${q(sessionId)}`);
  const raw = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
  if (r.exitCode != null && r.exitCode !== 0) {
    throw new Error(raw || `delete exit ${r.exitCode}`);
  }
  return raw || 'deleted';
}

export async function exportSessionMarkdown(
  sessionId: string,
  outputPath: string,
  grokCmd?: string,
): Promise<string> {
  const r = await shellExec(
    `${q(bin(grokCmd))} export ${q(sessionId)} ${q(outputPath)}`,
  );
  const raw = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
  if (r.exitCode != null && r.exitCode !== 0) {
    throw new Error(raw || `export exit ${r.exitCode}`);
  }
  return outputPath;
}

export async function exportSessionClipboard(
  sessionId: string,
  grokCmd?: string,
): Promise<string> {
  const r = await shellExec(`${q(bin(grokCmd))} export ${q(sessionId)} --clipboard`);
  const raw = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
  if (r.exitCode != null && r.exitCode !== 0) {
    throw new Error(raw || `export clipboard exit ${r.exitCode}`);
  }
  return raw || 'copied';
}

export async function worktreeListJson(
  grokCmd?: string,
  repo?: string,
): Promise<unknown[]> {
  const args = [`${q(bin(grokCmd))} worktree list --json`];
  if (repo) args.push(`--repo ${q(repo)}`);
  const r = await shellExec(args.join(' '));
  const raw = (r.stdout || '').trim();
  if (r.exitCode != null && r.exitCode !== 0 && !raw) {
    throw new Error((r.stderr || `worktree list exit ${r.exitCode}`).trim());
  }
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && Array.isArray((v as { worktrees?: unknown }).worktrees)) {
      return (v as { worktrees: unknown[] }).worktrees;
    }
    return [v];
  } catch {
    return [];
  }
}

export async function worktreeRemove(
  ids: string[],
  grokCmd?: string,
  force = false,
): Promise<string> {
  if (!ids.length) return '';
  const idArgs = ids.map(q).join(' ');
  const r = await shellExec(
    `${q(bin(grokCmd))} worktree rm ${force ? '-f ' : ''}${idArgs}`,
  );
  const raw = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
  if (r.exitCode != null && r.exitCode !== 0) {
    throw new Error(raw || `worktree rm exit ${r.exitCode}`);
  }
  return raw || 'removed';
}

export async function worktreeGc(grokCmd?: string): Promise<string> {
  const r = await shellExec(`${q(bin(grokCmd))} worktree gc`);
  const raw = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
  if (r.exitCode != null && r.exitCode !== 0) {
    throw new Error(raw || `worktree gc exit ${r.exitCode}`);
  }
  return raw || 'gc done';
}

export async function inspectProject(
  cwd: string,
  grokCmd?: string,
): Promise<string> {
  const r = await shellExec(`${q(bin(grokCmd))} inspect --json`, cwd);
  const raw = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
  if (r.exitCode != null && r.exitCode !== 0 && !r.stdout) {
    throw new Error(raw || `inspect exit ${r.exitCode}`);
  }
  return r.stdout?.trim() || raw;
}

export async function memoryClear(
  scope: 'workspace' | 'global' | 'all',
  grokCmd?: string,
  cwd?: string,
): Promise<string> {
  const flag =
    scope === 'all' ? '--all' : scope === 'global' ? '--global' : '--workspace';
  const r = await shellExec(`${q(bin(grokCmd))} memory clear ${flag} -y`, cwd);
  const raw = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
  if (r.exitCode != null && r.exitCode !== 0) {
    throw new Error(raw || `memory clear exit ${r.exitCode}`);
  }
  return raw || 'cleared';
}

export async function modelsList(grokCmd?: string): Promise<string> {
  const r = await shellExec(`${q(bin(grokCmd))} models`);
  return [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
}
