/**
 * Stage A design-token contract.
 * The live values live in App.css (`:root` / `[data-theme="dark"]`).
 * This module is the machine-readable checklist for the token source of truth.
 */

/** Color / surface tokens required in both light and dark themes. */
export const COLOR_TOKEN_NAMES = [
  '--bg-app',
  '--bg-sidebar',
  '--bg-main',
  '--bg-elevated',
  '--bg-hover',
  '--bg-active',
  '--text',
  '--text-2',
  '--muted',
  '--accent',
  '--accent-ink',
  '--accent-soft',
  '--danger',
  '--ok',
  '--warn',
  '--plan',
  '--info',
  '--user-bg',
  '--user-fg',
  '--assistant-fg',
  '--sb-text',
  '--sb-muted',
  '--sb-active',
  '--glass',
  '--glass-border',
  '--hairline',
  '--icon-muted',
  '--icon-strong',
  '--meta-surface',
  '--status-ok',
  '--status-warn',
  '--status-danger',
  '--status-plan',
  '--status-info',
  '--status-ok-soft',
  '--status-warn-soft',
  '--status-danger-soft',
  '--status-plan-soft',
  '--status-info-soft',
] as const;

/** Type scale tokens (shared; density may override sizes). */
export const TYPE_TOKEN_NAMES = [
  '--type-xs',
  '--type-sm',
  '--type-md',
  '--type-lg',
  '--type-xl',
  '--leading-tight',
  '--leading-body',
  '--font',
  '--mono',
] as const;

/** Spacing, radius, focus, and elevation tokens. */
export const STRUCTURE_TOKEN_NAMES = [
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--radius',
  '--radius-sm',
  '--radius-xs',
  '--radius-pill',
  '--radius-composer',
  '--focus-ring-width',
  '--focus-ring-offset',
  '--focus-ring-color',
  '--shadow-sm',
  '--shadow',
  '--shadow-lg',
  '--border',
] as const;

export const ALL_TOKEN_NAMES = [
  ...COLOR_TOKEN_NAMES,
  ...TYPE_TOKEN_NAMES,
  ...STRUCTURE_TOKEN_NAMES,
] as const;

/** CSS selectors that define theme-scoped token values. */
export const THEME_SELECTORS = [':root', ':root[data-theme="dark"]'] as const;

/**
 * Extract custom-property definitions from a CSS source string for one selector block.
 * Returns a map of `--name` → value for declarations immediately under that selector.
 */
export function extractTokenBlock(css: string, selector: string): Map<string, string> {
  const out = new Map<string, string>();
  // Match the first block that starts with the exact selector and `{`.
  const re = new RegExp(
    `${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`,
    'm',
  );
  // Prefer scanning from selector occurrences and balanced braces (CSS has nested-ish media later).
  let idx = 0;
  while (idx < css.length) {
    const found = css.indexOf(selector, idx);
    if (found === -1) break;
    const after = css.slice(found + selector.length).match(/^\s*\{/);
    if (!after) {
      idx = found + selector.length;
      continue;
    }
    const braceStart = found + selector.length + (after[0].length - 1);
    let depth = 0;
    let end = -1;
    for (let i = braceStart; i < css.length; i++) {
      const ch = css[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;
    const body = css.slice(braceStart + 1, end);
    // Only treat as the token root if it defines --bg-app (theme surfaces).
    if (body.includes('--bg-app')) {
      parseCustomProperties(body, out);
      return out;
    }
    idx = end + 1;
  }
  // Fallback: simpler single-pass regex if brace walk missed (keep re used).
  const m = css.match(re);
  if (m) parseCustomProperties(m[1], out);
  return out;
}

/** Parse `--name: value;` including multi-line values. */
function parseCustomProperties(body: string, out: Map<string, string>): void {
  const re = /(--[\w-]+)\s*:\s*([\s\S]*?);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.set(m[1], m[2].replace(/\s+/g, ' ').trim());
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Assert Stage A token coverage for light (`:root`) and dark theme blocks.
 * Returns missing token names keyed by selector; empty maps mean pass.
 */
export function findMissingThemeTokens(css: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const selector of THEME_SELECTORS) {
    const block = extractTokenBlock(css, selector);
    // Dark block only needs color tokens (type/structure inherit from :root).
    const required =
      selector === ':root'
        ? ALL_TOKEN_NAMES
        : COLOR_TOKEN_NAMES;
    const missing = required.filter((name) => !block.has(name));
    if (missing.length) result[selector] = [...missing];
  }
  return result;
}

/** Light hex fills that flash white on dark theme when used as component backgrounds. */
const FORBIDDEN_LIGHT_SURFACE_HEX =
  '#(?:fafafa|f8f8f9|f4f4f5|f0f0f1|f0f0f2|eaeaec|e4e4e7|e2e8f0|ffffff|fff)\\b';

/**
 * Strip `:root` / theme variable blocks so token definitions are not reported
 * as component hardcodes.
 */
export function stripThemeTokenBlocks(css: string): string {
  let out = css;
  for (const selector of [
    ':root[data-theme="dark"]',
    ':root[data-density="compact"]',
    ':root[data-density="spacious"]',
    ':root',
  ]) {
    let idx = 0;
    while (idx < out.length) {
      const found = out.indexOf(selector, idx);
      if (found === -1) break;
      const beforeOk = found === 0 || /[\s}]/.test(out[found - 1] ?? '');
      const after = out.slice(found + selector.length).match(/^\s*\{/);
      if (!beforeOk || !after) {
        idx = found + selector.length;
        continue;
      }
      const braceStart = found + selector.length + (after[0].length - 1);
      let depth = 0;
      let end = -1;
      for (let i = braceStart; i < out.length; i++) {
        if (out[i] === '{') depth++;
        else if (out[i] === '}') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end === -1) break;
      out = out.slice(0, found) + out.slice(end + 1);
      idx = found;
    }
  }
  return out;
}

/**
 * Find component-level light surface hex hardcodes on `background` properties.
 * Text colors are ignored. Empty array = pass.
 */
export function findLightSurfaceHardcodes(css: string): string[] {
  const body = stripThemeTokenBlocks(css);
  const found = new Set<string>();
  const re = new RegExp(
    `background(?:-color)?\\s*:\\s*[^;\\n]*?(${FORBIDDEN_LIGHT_SURFACE_HEX})`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    found.add(m[1].toLowerCase());
  }
  return [...found].sort();
}
