/** Portable, user-triggered Grok Build session bundle boundary. */

export const SESSION_BUNDLE_KIND = 'gorkx-session-bundle';
export const SESSION_BUNDLE_VERSION = 1 as const;
const MAX_BUNDLE_BYTES = 32 * 1024 * 1024;
const MAX_UPDATES = 100_000;
const MAX_UPDATE_BYTES = 2 * 1024 * 1024;
const MAX_CWD_LENGTH = 4_096;
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SessionBundle {
  kind: typeof SESSION_BUNDLE_KIND;
  version: typeof SESSION_BUNDLE_VERSION;
  exportedAt: string;
  sessionId: string;
  cwd: string;
  state: Record<string, unknown>;
  updates: Array<Record<string, unknown>>;
}

function assertBundle(value: unknown): asserts value is SessionBundle {
  if (!value || typeof value !== 'object') throw new Error('Invalid gorkX task package');
  const row = value as Record<string, unknown>;
  if (row.kind !== SESSION_BUNDLE_KIND || row.version !== SESSION_BUNDLE_VERSION) {
    throw new Error('Unsupported gorkX task package version');
  }
  if (typeof row.sessionId !== 'string' || !SESSION_ID_RE.test(row.sessionId)) {
    throw new Error('Task package has an invalid session id');
  }
  if (typeof row.cwd !== 'string' || !row.cwd.trim() || row.cwd.length > MAX_CWD_LENGTH) {
    throw new Error('Task package has an invalid project path');
  }
  if (typeof row.exportedAt !== 'string' || !row.exportedAt.trim()) {
    throw new Error('Task package has no export timestamp');
  }
  if (!row.state || typeof row.state !== 'object' || Array.isArray(row.state)) {
    throw new Error('Task package has no session state');
  }
  const state = row.state as Record<string, unknown>;
  if (!state.summary || typeof state.summary !== 'object' || Array.isArray(state.summary)) {
    throw new Error('Task package is missing the required session summary');
  }
  if (!Array.isArray(row.updates) || row.updates.length > MAX_UPDATES) {
    throw new Error(`Task package contains too many updates (maximum ${MAX_UPDATES})`);
  }
  for (const update of row.updates) {
    if (!update || typeof update !== 'object' || Array.isArray(update)) {
      throw new Error('Task package contains an invalid update');
    }
    if (JSON.stringify(update).length > MAX_UPDATE_BYTES) {
      throw new Error('Task package contains an oversized update');
    }
  }
}

export function createSessionBundle(input: {
  sessionId: string;
  cwd: string;
  state: Record<string, unknown>;
  updates: Array<Record<string, unknown>>;
  exportedAt?: string;
}): SessionBundle {
  const bundle: SessionBundle = {
    kind: SESSION_BUNDLE_KIND,
    version: SESSION_BUNDLE_VERSION,
    exportedAt: input.exportedAt || new Date().toISOString(),
    sessionId: input.sessionId,
    cwd: input.cwd,
    state: input.state,
    updates: input.updates,
  };
  assertBundle(bundle);
  return bundle;
}

export function parseSessionBundleText(text: string): SessionBundle {
  if (typeof text !== 'string' || text.length > MAX_BUNDLE_BYTES) {
    throw new Error('Task package is too large (maximum 32 MB)');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Task package is not valid JSON');
  }
  assertBundle(value);
  return value;
}

export function serializeSessionBundle(bundle: SessionBundle): string {
  assertBundle(bundle);
  const text = JSON.stringify(bundle, null, 2);
  if (text.length > MAX_BUNDLE_BYTES) throw new Error('Task package is too large (maximum 32 MB)');
  return text;
}
