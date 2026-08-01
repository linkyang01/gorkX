/**
 * Local, non-secret diagnostic summary for Settings → About.
 * Never includes tokens, keys, or full transcripts.
 */

export interface DiagnosticsInputs {
  appVersion: string;
  kernelVersion?: string | null;
  kernelPath?: string | null;
  kernelChannel?: string | null;
  grokHome?: string | null;
  dataDir?: string | null;
  dbPath?: string | null;
  independentReady?: boolean | null;
  authenticated?: boolean | null;
  accountEmail?: string | null;
  githubConnected?: boolean | null;
  githubLogin?: string | null;
  project?: string | null;
}

export function buildDiagnosticsSummary(input: DiagnosticsInputs): string {
  const lines = [
    'gorkX diagnostic summary',
    `generatedAt: ${new Date().toISOString()}`,
    `appVersion: ${input.appVersion || '—'}`,
    `kernelVersion: ${input.kernelVersion || '—'}`,
    `kernelChannel: ${input.kernelChannel || '—'}`,
    `kernelPath: ${input.kernelPath || '—'}`,
    `independentReady: ${input.independentReady ? 'yes' : 'no'}`,
    `authenticated: ${input.authenticated ? 'yes' : 'no'}`,
    `accountEmail: ${input.accountEmail ? '(present)' : '(none)'}`,
    `githubConnected: ${input.githubConnected ? 'yes' : 'no'}`,
    `githubLogin: ${input.githubLogin || '—'}`,
    `grokHome: ${input.grokHome || '—'}`,
    `dataDir: ${input.dataDir || '—'}`,
    `sqlite: ${input.dbPath || '—'}`,
    `project: ${input.project || '—'}`,
    '',
    'Note: this file intentionally omits tokens, API keys, and conversation content.',
  ];
  return lines.join('\n');
}
