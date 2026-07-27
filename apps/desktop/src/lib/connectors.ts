/**
 * Stage D connector catalog and security-contract helpers.
 * Availability is explicit: only fully wired connectors are `real`.
 */

export type ConnectorId =
  | 'github'
  | 'calendar'
  | 'slack'
  | 'feishu'
  | 'notion'
  | 'drive';

export type ConnectorAvailability = 'real' | 'soon';

export type ConnectorAuthMode = 'oauth' | 'token';

export interface ConnectorContract {
  id: ConnectorId;
  /** real = closed-loop shipped; soon = shown but not pretend-connected. */
  availability: ConnectorAvailability;
  /** Human-readable permission scopes the user must understand. */
  scopes: readonly string[];
  /** Write actions that always require per-action confirmation. */
  writeActions: readonly string[];
  authModes: readonly ConnectorAuthMode[];
  /** Official auth preference (device OAuth / app install). */
  preferredAuth: ConnectorAuthMode;
}

/** Ordered product catalog — GitHub is the Stage D template. */
export const CONNECTOR_CATALOG: readonly ConnectorContract[] = [
  {
    id: 'github',
    availability: 'real',
    scopes: [
      'read:user',
      'public_repo (read open PRs/checks; create PR/comment on authorized repos)',
    ],
    writeActions: ['create_pull_request', 'create_pr_comment'],
    authModes: ['oauth', 'token'],
    preferredAuth: 'oauth',
  },
  {
    id: 'calendar',
    availability: 'soon',
    scopes: ['calendar.readonly', 'calendar.events (write after confirm)'],
    writeActions: ['update_event', 'create_event'],
    authModes: ['oauth'],
    preferredAuth: 'oauth',
  },
  {
    id: 'slack',
    availability: 'soon',
    scopes: ['channels:read', 'chat:write (send after confirm)'],
    writeActions: ['post_message'],
    authModes: ['oauth'],
    preferredAuth: 'oauth',
  },
  {
    id: 'feishu',
    availability: 'soon',
    scopes: ['im:message (send after confirm)'],
    writeActions: ['post_message'],
    authModes: ['oauth'],
    preferredAuth: 'oauth',
  },
  {
    id: 'notion',
    availability: 'soon',
    scopes: ['read content', 'insert content (write after confirm)'],
    writeActions: ['create_page', 'update_page'],
    authModes: ['oauth'],
    preferredAuth: 'oauth',
  },
  {
    id: 'drive',
    availability: 'soon',
    scopes: ['drive.readonly', 'drive.file (write after confirm)'],
    writeActions: ['create_file', 'update_file'],
    authModes: ['oauth'],
    preferredAuth: 'oauth',
  },
] as const;

export function getConnector(id: ConnectorId): ConnectorContract | undefined {
  return CONNECTOR_CATALOG.find((c) => c.id === id);
}

export function realConnectors(): ConnectorContract[] {
  return CONNECTOR_CATALOG.filter((c) => c.availability === 'real');
}

export function soonConnectors(): ConnectorContract[] {
  return CONNECTOR_CATALOG.filter((c) => c.availability === 'soon');
}

export type ConnectorUiState =
  | 'soon'
  | 'disconnected'
  | 'configured'
  | 'connected'
  | 'error';

/** Map live GitHub-style status into catalog UI state. Soon connectors never look connected. */
export function deriveConnectorUiState(
  contract: ConnectorContract,
  live?: {
    connected?: boolean;
    configured?: boolean;
    error?: string | null;
  } | null,
): ConnectorUiState {
  if (contract.availability === 'soon') return 'soon';
  if (live?.error && String(live.error).trim()) return 'error';
  if (live?.connected) return 'connected';
  if (live?.configured) return 'configured';
  return 'disconnected';
}

/** Whether a write action is declared on the contract (must still be user-confirmed in UI). */
export function isDeclaredWriteAction(contract: ConnectorContract, action: string): boolean {
  return contract.writeActions.includes(action);
}

/**
 * Build a one-line confirmation summary for a GitHub write.
 * Never includes tokens or full secret material.
 */
export function githubWriteConfirmSummary(input: {
  action: 'create_pull_request' | 'create_pr_comment';
  titleOrBody: string;
  base?: string;
  prNumber?: number;
  draft?: boolean;
}): string {
  const preview = input.titleOrBody.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (input.action === 'create_pull_request') {
    const base = (input.base || 'main').trim() || 'main';
    const draft = input.draft ? ' [draft]' : '';
    return `Create GitHub pull request${draft} → base ${base}: ${preview || '(no title)'}`;
  }
  const n = input.prNumber ?? 0;
  return `Comment on GitHub PR #${n}: ${preview || '(empty comment)'}`;
}
