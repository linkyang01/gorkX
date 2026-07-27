/**
 * Local connector audit trail — no tokens, no response bodies with secrets.
 * Stored in localStorage for user-visible accountability (Stage D contract).
 */

import type { ConnectorId } from './connectors.ts';

const STORAGE_KEY = 'gorkx.connectorAudit.v1';
const MAX_EVENTS = 80;

export type ConnectorAuditAction =
  | 'connect'
  | 'disconnect'
  | 'test'
  | 'reauth'
  | 'read'
  | 'write'
  | 'fail';

export interface ConnectorAuditEvent {
  id: string;
  at: number;
  connector: ConnectorId;
  action: ConnectorAuditAction;
  /** Short human summary; never store tokens. */
  summary: string;
  /** Optional non-secret detail (HTTP status text, PR number, etc.). */
  detail?: string;
  /** Public receipt URL when a write succeeded. */
  receiptUrl?: string;
}

export function loadConnectorAudit(
  getItem: (k: string) => string | null = defaultGet,
): ConnectorAuditEvent[] {
  try {
    const raw = getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isAuditEvent)
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_EVENTS);
  } catch {
    return [];
  }
}

export function appendConnectorAudit(
  entry: Omit<ConnectorAuditEvent, 'id' | 'at'> & { at?: number },
  storage: {
    getItem: (k: string) => string | null;
    setItem: (k: string, v: string) => void;
  } = defaultStorage(),
): ConnectorAuditEvent[] {
  const event: ConnectorAuditEvent = {
    id: makeId(),
    at: entry.at ?? Date.now(),
    connector: entry.connector,
    action: entry.action,
    summary: sanitize(entry.summary, 240),
    detail: entry.detail ? sanitize(entry.detail, 400) : undefined,
    receiptUrl: entry.receiptUrl ? sanitizeUrl(entry.receiptUrl) : undefined,
  };
  const prev = loadConnectorAudit(storage.getItem);
  const next = [event, ...prev].slice(0, MAX_EVENTS);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode / full storage */
  }
  return next;
}

function isAuditEvent(value: unknown): value is ConnectorAuditEvent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.at === 'number' &&
    typeof v.connector === 'string' &&
    typeof v.action === 'string' &&
    typeof v.summary === 'string'
  );
}

function sanitize(text: string, max: number): string {
  return text
    .replace(/ghp_[A-Za-z0-9_]+/g, '[redacted-token]')
    .replace(/gho_[A-Za-z0-9_]+/g, '[redacted-token]')
    .replace(/github_pat_[A-Za-z0-9_]+/g, '[redacted-token]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function sanitizeUrl(url: string): string | undefined {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    // Drop query fragments that might hold tokens
    u.search = '';
    u.hash = '';
    return u.toString().slice(0, 500);
  } catch {
    return undefined;
  }
}

function makeId(): string {
  return `ca_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultGet(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(key);
}

function defaultStorage() {
  return {
    getItem: defaultGet,
    setItem: (k: string, v: string) => {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(k, v);
    },
  };
}
