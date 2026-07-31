/**
 * Per-task Grok Build permission rules (`--allow` / `--deny`).
 *
 * Rules use the engine's documented tool-prefix DSL:
 *   Bash, Read, Edit/Write, Grep/Glob, WebFetch, WebSearch, MCPTool
 * Examples: `Bash`, `Bash(git status)`, `Read(src/**)`, `Edit`
 *
 * gorkX only stores and forwards validated rule strings; the kernel evaluates them.
 */

export type PermissionRuleAction = 'allow' | 'deny';

export type PermissionRule = {
  action: PermissionRuleAction;
  /** Original engine rule string without the action prefix (e.g. `Bash` or `Edit(src/**)`). */
  rule: string;
};

const KNOWN_PREFIXES = new Set([
  'Bash',
  'Read',
  'NotebookRead',
  'Edit',
  'Write',
  'NotebookEdit',
  'MCPTool',
  'Grep',
  'Glob',
  'WebFetch',
  'WebSearch',
]);

/** Safe preset chips for ordinary users. */
export const PERMISSION_RULE_PRESETS = [
  {
    id: 'deny-bash',
    action: 'deny' as const,
    rule: 'Bash',
    labelKey: 'permRuleDenyBash' as const,
    hintKey: 'permRuleDenyBashHint' as const,
  },
  {
    id: 'deny-web-search',
    action: 'deny' as const,
    rule: 'WebSearch',
    labelKey: 'permRuleDenyWebSearch' as const,
    hintKey: 'permRuleDenyWebSearchHint' as const,
  },
  {
    id: 'deny-web-fetch',
    action: 'deny' as const,
    rule: 'WebFetch',
    labelKey: 'permRuleDenyWebFetch' as const,
    hintKey: 'permRuleDenyWebFetchHint' as const,
  },
  {
    id: 'allow-read',
    action: 'allow' as const,
    rule: 'Read',
    labelKey: 'permRuleAllowRead' as const,
    hintKey: 'permRuleAllowReadHint' as const,
  },
  {
    id: 'allow-edit',
    action: 'allow' as const,
    rule: 'Edit',
    labelKey: 'permRuleAllowEdit' as const,
    hintKey: 'permRuleAllowEditHint' as const,
  },
] as const;

export type PermissionRulePresetId = (typeof PERMISSION_RULE_PRESETS)[number]['id'];

function toolPrefix(rule: string): string | null {
  const trimmed = rule.trim();
  if (!trimmed) return null;
  const paren = trimmed.indexOf('(');
  const name = (paren >= 0 ? trimmed.slice(0, paren) : trimmed).trim();
  return name || null;
}

/** Reject shell injection and unknown tool families before argv is built. */
export function isValidPermissionRuleBody(rule: string): boolean {
  const trimmed = rule.trim();
  if (!trimmed || trimmed.length > 200) return false;
  // Catch-all allows are dangerous on managed policy; never invent them from the desktop.
  if (trimmed === '*' || trimmed === '**') return false;
  if (/[;|&`$\\\n\r]/.test(trimmed)) return false;
  const prefix = toolPrefix(trimmed);
  if (!prefix || !KNOWN_PREFIXES.has(prefix)) return false;
  // Balanced parentheses for Tool(pattern) form.
  if (trimmed.includes('(')) {
    if (!trimmed.endsWith(')')) return false;
    let depth = 0;
    for (const ch of trimmed) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (depth < 0) return false;
    }
    if (depth !== 0) return false;
  }
  return true;
}

export function sanitizePermissionRules(input: unknown): PermissionRule[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: PermissionRule[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const action = (raw as { action?: unknown }).action;
    const rule = (raw as { rule?: unknown }).rule;
    if (action !== 'allow' && action !== 'deny') continue;
    if (typeof rule !== 'string' || !isValidPermissionRuleBody(rule)) continue;
    const body = rule.trim();
    const key = `${action}:${body}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ action, rule: body });
    if (out.length >= 32) break;
  }
  return out;
}

/**
 * Parse a plain-language form:
 *   allow Read
 *   deny Bash
 *   allow: Edit(src/**)
 *   deny WebSearch
 */
export function parsePermissionRulesForm(text: string): PermissionRule[] {
  const items: PermissionRule[] = [];
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^(allow|deny)\s*:?\s+(.+)$/i.exec(trimmed);
    if (!match) {
      throw new Error(`Each line must start with allow or deny: ${trimmed}`);
    }
    const action = match[1].toLowerCase() as PermissionRuleAction;
    const rule = match[2].trim();
    if (!isValidPermissionRuleBody(rule)) {
      throw new Error(`Invalid or unsupported rule: ${rule}`);
    }
    items.push({ action, rule });
  }
  return sanitizePermissionRules(items);
}

export function permissionRulesToForm(rules: PermissionRule[]): string {
  return sanitizePermissionRules(rules)
    .map((item) => `${item.action} ${item.rule}`)
    .join('\n');
}

export function splitPermissionRules(rules: PermissionRule[]): { allow: string[]; deny: string[] } {
  const clean = sanitizePermissionRules(rules);
  return {
    allow: clean.filter((r) => r.action === 'allow').map((r) => r.rule),
    deny: clean.filter((r) => r.action === 'deny').map((r) => r.rule),
  };
}

export function togglePermissionPreset(
  current: PermissionRule[],
  presetId: PermissionRulePresetId,
): PermissionRule[] {
  const preset = PERMISSION_RULE_PRESETS.find((item) => item.id === presetId);
  if (!preset) return sanitizePermissionRules(current);
  const key = `${preset.action}:${preset.rule}`;
  const existing = sanitizePermissionRules(current);
  const has = existing.some((item) => `${item.action}:${item.rule}` === key);
  if (has) {
    return existing.filter((item) => `${item.action}:${item.rule}` !== key);
  }
  return sanitizePermissionRules([...existing, { action: preset.action, rule: preset.rule }]);
}

export function encodePermissionRules(rules?: PermissionRule[] | null): string | null {
  const clean = sanitizePermissionRules(rules ?? []);
  if (!clean.length) return null;
  return JSON.stringify(clean);
}

export function decodePermissionRules(raw: unknown): PermissionRule[] {
  if (Array.isArray(raw)) return sanitizePermissionRules(raw);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return sanitizePermissionRules(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}
