/**
 * Stage F: real multi-provider verification records.
 * Non-secret only — never stores API keys. Web subscriptions are never “API connected”.
 */

export type ModelAuthKind = 'api_key' | 'oauth_grok' | 'subscription_web' | 'local';

export interface ModelCapabilities {
  /** true / false when known; unknown until a real tool-call probe exists. */
  tools: boolean | 'unknown';
  vision: boolean | 'unknown';
  streaming: boolean | 'unknown';
}

export interface ModelVerifyRecord {
  key: string;
  providerLabel: string;
  model: string;
  baseUrl: string;
  apiBackend: string;
  ok: boolean;
  status: number;
  checkedAt: number;
  failReason?: string;
  latencyMs?: number;
  capabilities: ModelCapabilities;
  authKind: ModelAuthKind;
}

const STORAGE_KEY = 'gorkx.modelVerify.v1';
/** Legacy key from SettingsPanel — still read for migration. */
const LEGACY_KEY = 'gorkx.modelTestStatus.v1';
const MAX_RECORDS = 80;

export function modelVerifyKey(model: {
  apiBackend: string;
  baseUrl: string;
  model: string;
}): string {
  return [
    (model.apiBackend || '').trim().toLowerCase(),
    (model.baseUrl || '').trim().toLowerCase(),
    (model.model || '').trim().toLowerCase(),
  ].join('|');
}

/** Stable provider bucket for “≥2 providers verified” — not the model id. */
export function providerFingerprint(input: {
  providerLabel?: string;
  baseUrl?: string;
  apiBackend?: string;
}): string {
  const label = (input.providerLabel || '').trim().toLowerCase();
  if (label) return label;
  try {
    const host = new URL(input.baseUrl || 'http://local').host.toLowerCase();
    return `${input.apiBackend || 'unknown'}@${host}`;
  } catch {
    return `${input.apiBackend || 'unknown'}@${(input.baseUrl || 'local').toLowerCase()}`;
  }
}

export function inferAuthKind(input: {
  baseUrl?: string;
  providerLabel?: string;
  apiKey?: string;
  hasKeychainSecret?: boolean;
}): ModelAuthKind {
  const url = (input.baseUrl || '').toLowerCase();
  const label = (input.providerLabel || '').toLowerCase();
  if (!url && /subscription|plus|pro|web/.test(label)) return 'subscription_web';
  if (/ollama|127\.0\.0\.1|localhost/.test(url) || /ollama|local/.test(label)) return 'local';
  if (/grok|x\.ai/.test(label) && !url) return 'oauth_grok';
  return 'api_key';
}

/**
 * Best-effort capability hints from ids (non-sensitive).
 * Does not claim tool-use works until a live tool turn succeeds.
 */
export function inferCapabilities(modelId: string, apiBackend?: string): ModelCapabilities {
  const m = (modelId || '').toLowerCase();
  if (/embed|whisper|tts|dall-e|image-1|moderation/.test(m)) {
    return { tools: false, vision: false, streaming: false };
  }
  const vision =
    /vision|gpt-4o|gpt-4\.1|claude-3|claude-4|gemini|llava|pixtral|sonnet|opus|flash|4o/.test(m)
      ? true
      : 'unknown';
  const tools = /instruct|chat|sonnet|opus|gpt|claude|grok|gemini|qwen|deepseek|llama|mistral/.test(m)
    ? 'unknown'
    : 'unknown';
  const streaming = apiBackend === 'messages' || apiBackend === 'responses' || apiBackend === 'chat_completions'
    ? true
    : 'unknown';
  return { tools, vision, streaming };
}

/** Web Plus/Pro style rows must never be treated as API-verified providers. */
export function isApiEligibleAuth(kind: ModelAuthKind): boolean {
  return kind === 'api_key' || kind === 'local';
}

export function countVerifiedApiProviders(records: readonly ModelVerifyRecord[]): number {
  const set = new Set<string>();
  for (const r of records) {
    if (!r.ok || !isApiEligibleAuth(r.authKind)) continue;
    set.add(providerFingerprint(r));
  }
  return set.size;
}

export function loadModelVerifyRecords(
  getItem: (k: string) => string | null = defaultGet,
): ModelVerifyRecord[] {
  try {
    const raw = getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(isRecord).sort((a, b) => b.checkedAt - a.checkedAt).slice(0, MAX_RECORDS);
      }
    }
  } catch {
    /* */
  }
  // Migrate legacy ok/status/checkedAt map
  try {
    const legacy = getItem(LEGACY_KEY);
    if (!legacy) return [];
    const map = JSON.parse(legacy) as Record<string, { ok?: boolean; status?: number; checkedAt?: number }>;
    if (!map || typeof map !== 'object') return [];
    const out: ModelVerifyRecord[] = [];
    for (const [key, value] of Object.entries(map)) {
      if (!value || typeof value.checkedAt !== 'number') continue;
      const parts = key.split('|');
      out.push({
        key,
        providerLabel: '',
        model: parts[2] || '',
        baseUrl: parts[1] || '',
        apiBackend: parts[0] || '',
        ok: Boolean(value.ok),
        status: Number(value.status) || 0,
        checkedAt: value.checkedAt,
        failReason: value.ok ? undefined : 'legacy failure',
        capabilities: inferCapabilities(parts[2] || '', parts[0]),
        authKind: inferAuthKind({ baseUrl: parts[1], providerLabel: '' }),
      });
    }
    return out.sort((a, b) => b.checkedAt - a.checkedAt).slice(0, MAX_RECORDS);
  } catch {
    return [];
  }
}

export function upsertModelVerifyRecord(
  input: {
    model: string;
    baseUrl: string;
    apiBackend: string;
    providerLabel?: string;
    apiKey?: string;
    hasKeychainSecret?: boolean;
    ok: boolean;
    status: number;
    note?: string;
    latencyMs?: number;
    checkedAt?: number;
  },
  storage: {
    getItem: (k: string) => string | null;
    setItem: (k: string, v: string) => void;
  } = defaultStorage(),
): ModelVerifyRecord[] {
  const key = modelVerifyKey(input);
  const authKind = inferAuthKind(input);
  // Never record a “successful API verify” for web-subscription placeholders.
  const ok = input.ok && isApiEligibleAuth(authKind);
  const record: ModelVerifyRecord = {
    key,
    providerLabel: (input.providerLabel || '').trim(),
    model: input.model.trim(),
    baseUrl: input.baseUrl.trim(),
    apiBackend: input.apiBackend.trim(),
    ok,
    status: input.status,
    checkedAt: input.checkedAt ?? Date.now(),
    failReason: ok
      ? undefined
      : sanitizeFailReason(
          !isApiEligibleAuth(authKind) && input.ok
            ? 'Web subscription is not an API authorization'
            : input.note || `HTTP ${input.status || 'error'}`,
        ),
    latencyMs: input.latencyMs,
    capabilities: inferCapabilities(input.model, input.apiBackend),
    authKind,
  };
  const prev = loadModelVerifyRecords(storage.getItem).filter((r) => r.key !== key);
  const next = [record, ...prev].slice(0, MAX_RECORDS);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

export function findVerifyRecord(
  records: readonly ModelVerifyRecord[],
  model: { apiBackend: string; baseUrl: string; model: string },
): ModelVerifyRecord | undefined {
  const key = modelVerifyKey(model);
  return records.find((r) => r.key === key);
}

/** Task chrome line: provider · model (actual selection, not only default). */
export function formatTaskModelDisplay(input: {
  modelId?: string | null;
  modelName?: string | null;
  providerLabel?: string | null;
  authSource?: string | null;
}): string {
  const model = (input.modelName || input.modelId || '').trim() || '—';
  const provider = (input.providerLabel || '').trim();
  if (provider) return `${provider} · ${model}`;
  if (input.authSource === 'oauth') return `Grok · ${model}`;
  if (input.authSource === 'api_key') return `API · ${model}`;
  return model;
}

/** Resolve provider label from custom model list for a wire model id. */
export function resolveProviderForModelId(
  modelId: string | null | undefined,
  customModels: readonly { model: string; id: string; providerLabel?: string; baseUrl?: string }[],
): string | null {
  if (!modelId) return null;
  const hit = customModels.find((m) => m.model === modelId || m.id === modelId);
  if (!hit) return null;
  const label = (hit.providerLabel || '').trim();
  if (label) return label;
  try {
    return new URL(hit.baseUrl || '').host || null;
  } catch {
    return null;
  }
}

function sanitizeFailReason(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function isRecord(value: unknown): value is ModelVerifyRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === 'string' &&
    typeof v.model === 'string' &&
    typeof v.ok === 'boolean' &&
    typeof v.checkedAt === 'number'
  );
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
