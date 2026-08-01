/**
 * Renderer-only appearance preferences.
 * Never affect the agent kernel, project files, or GROK_HOME config.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type DensityPreference = 'compact' | 'comfortable' | 'spacious';
export type ThemeSide = 'light' | 'dark';

/** Per-mode palette (Codex-style light/dark independent customisation). */
export interface ThemePalette {
  /** Primary accent (buttons, focus, selected chrome). */
  accent: string;
  /** Workspace background (--bg-app root). */
  background: string;
  /** Primary text / foreground. */
  foreground: string;
  /** UI font stack. */
  uiFont: string;
  /** Monospace / code font stack. */
  codeFont: string;
  /** Soften sidebar with translucency where supported. */
  translucentSidebar: boolean;
  /** 0–100: higher = stronger borders and contrast between surfaces. */
  contrast: number;
}

export interface AppearancePreferences {
  theme: ThemePreference;
  density: DensityPreference;
  light: ThemePalette;
  dark: ThemePalette;
  /** Named preset id currently selected for the light editor (cosmetic). */
  lightPreset: string;
  darkPreset: string;
}

const THEME_KEY = 'gorkx.theme';
const DENSITY_KEY = 'gorkx.density';
const PALETTE_KEY = 'gorkx.theme-palettes';
const SAVED_THEMES_KEY = 'gorkx.theme-library';
const THEME_DEFAULT_VERSION_KEY = 'gorkx.theme-default-version';
const THEME_DEFAULT_VERSION = '3';
const MAX_SAVED_THEMES = 24;

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** User-named theme snapshot (independent of built-in presets). */
export interface SavedTheme {
  id: string;
  name: string;
  light: ThemePalette;
  dark: ThemePalette;
  updatedAt: number;
}

export const UI_FONT_OPTIONS: Array<{ id: string; label: string; stack: string }> = [
  {
    id: 'system',
    label: 'System',
    stack: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif',
  },
  {
    id: 'inter',
    label: 'Inter',
    stack: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  },
  {
    id: 'sf',
    label: 'SF Pro',
    stack: '"SF Pro Text", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  },
  {
    id: 'pingfang',
    label: 'PingFang SC',
    stack: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", system-ui, sans-serif',
  },
];

export const CODE_FONT_OPTIONS: Array<{ id: string; label: string; stack: string }> = [
  {
    id: 'system-mono',
    label: 'System Mono',
    stack: '"SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace',
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    stack: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Monaco, monospace',
  },
  {
    id: 'fira',
    label: 'Fira Code',
    stack: '"Fira Code", "SF Mono", ui-monospace, Menlo, Monaco, monospace',
  },
  {
    id: 'cascadia',
    label: 'Cascadia Code',
    stack: '"Cascadia Code", "SF Mono", ui-monospace, Consolas, monospace',
  },
];

/** Built-in palettes — defaults match current gorkX CSS tokens. */
export const THEME_PRESETS: Record<
  string,
  { label: string; light: ThemePalette; dark: ThemePalette }
> = {
  gorkx: {
    label: 'gorkX',
    light: {
      accent: '#111113',
      background: '#f6f6f7',
      foreground: '#111113',
      uiFont: UI_FONT_OPTIONS[0].stack,
      codeFont: CODE_FONT_OPTIONS[0].stack,
      translucentSidebar: false,
      contrast: 45,
    },
    dark: {
      accent: '#f4f4f5',
      background: '#0d0d0e',
      foreground: '#f1f1f3',
      uiFont: UI_FONT_OPTIONS[0].stack,
      codeFont: CODE_FONT_OPTIONS[0].stack,
      translucentSidebar: false,
      contrast: 55,
    },
  },
  codex: {
    label: 'Codex',
    light: {
      accent: '#0169cc',
      background: '#ffffff',
      foreground: '#0d0d0d',
      uiFont: UI_FONT_OPTIONS[0].stack,
      codeFont: CODE_FONT_OPTIONS[0].stack,
      translucentSidebar: true,
      contrast: 45,
    },
    dark: {
      accent: '#339cff',
      background: '#181818',
      foreground: '#ffffff',
      uiFont: UI_FONT_OPTIONS[0].stack,
      codeFont: CODE_FONT_OPTIONS[0].stack,
      translucentSidebar: true,
      contrast: 60,
    },
  },
  graphite: {
    label: 'Graphite',
    light: {
      accent: '#3f3f46',
      background: '#f4f4f5',
      foreground: '#18181b',
      uiFont: UI_FONT_OPTIONS[0].stack,
      codeFont: CODE_FONT_OPTIONS[0].stack,
      translucentSidebar: false,
      contrast: 50,
    },
    dark: {
      accent: '#e4e4e7',
      background: '#09090b',
      foreground: '#fafafa',
      uiFont: UI_FONT_OPTIONS[0].stack,
      codeFont: CODE_FONT_OPTIONS[0].stack,
      translucentSidebar: false,
      contrast: 62,
    },
  },
  ocean: {
    label: 'Ocean',
    light: {
      accent: '#0e7490',
      background: '#f0f9ff',
      foreground: '#0c4a6e',
      uiFont: UI_FONT_OPTIONS[0].stack,
      codeFont: CODE_FONT_OPTIONS[0].stack,
      translucentSidebar: true,
      contrast: 48,
    },
    dark: {
      accent: '#38bdf8',
      background: '#0b1220',
      foreground: '#e0f2fe',
      uiFont: UI_FONT_OPTIONS[0].stack,
      codeFont: CODE_FONT_OPTIONS[0].stack,
      translucentSidebar: true,
      contrast: 58,
    },
  },
};

export function defaultAppearance(): AppearancePreferences {
  const base = THEME_PRESETS.gorkx;
  return {
    theme: 'dark',
    density: 'comfortable',
    light: { ...base.light },
    dark: { ...base.dark },
    lightPreset: 'gorkx',
    darkPreset: 'gorkx',
  };
}

function stored<T extends string>(key: string, values: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return values.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Normalize #RGB → #RRGGBB; reject invalid. */
export function normalizeHex(input: string, fallback: string): string {
  const raw = String(input || '').trim();
  if (!HEX.test(raw)) return fallback;
  if (raw.length === 4) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return raw.toLowerCase();
}

export function clampContrast(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 50;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function sanitizePalette(input: Partial<ThemePalette> | null | undefined, fallback: ThemePalette): ThemePalette {
  const src = input && typeof input === 'object' ? input : {};
  return {
    accent: normalizeHex(String(src.accent ?? ''), fallback.accent),
    background: normalizeHex(String(src.background ?? ''), fallback.background),
    foreground: normalizeHex(String(src.foreground ?? ''), fallback.foreground),
    uiFont: String(src.uiFont || fallback.uiFont).slice(0, 240) || fallback.uiFont,
    codeFont: String(src.codeFont || fallback.codeFont).slice(0, 240) || fallback.codeFont,
    translucentSidebar: Boolean(src.translucentSidebar ?? fallback.translucentSidebar),
    contrast: clampContrast(src.contrast ?? fallback.contrast),
  };
}

function parseStoredPalettes(): { light?: ThemePalette; dark?: ThemePalette; lightPreset?: string; darkPreset?: string } {
  try {
    const raw = localStorage.getItem(PALETTE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      light: data.light as ThemePalette | undefined,
      dark: data.dark as ThemePalette | undefined,
      lightPreset: typeof data.lightPreset === 'string' ? data.lightPreset : undefined,
      darkPreset: typeof data.darkPreset === 'string' ? data.darkPreset : undefined,
    };
  } catch {
    return {};
  }
}

export function loadAppearance(): AppearancePreferences {
  const defaults = defaultAppearance();
  const savedTheme = stored(THEME_KEY, ['system', 'light', 'dark'] as const, 'dark');
  let theme = savedTheme;

  try {
    if (localStorage.getItem(THEME_DEFAULT_VERSION_KEY) !== THEME_DEFAULT_VERSION) {
      if (savedTheme === 'system') {
        theme = 'dark';
        localStorage.setItem(THEME_KEY, theme);
      }
      localStorage.setItem(THEME_DEFAULT_VERSION_KEY, THEME_DEFAULT_VERSION);
    }
  } catch {
    /* keep launch preference */
  }

  const storedPalettes = parseStoredPalettes();
  return {
    theme,
    density: stored(DENSITY_KEY, ['compact', 'comfortable', 'spacious'] as const, 'comfortable'),
    light: sanitizePalette(storedPalettes.light, defaults.light),
    dark: sanitizePalette(storedPalettes.dark, defaults.dark),
    lightPreset: normalizePresetId(storedPalettes.lightPreset),
    darkPreset: normalizePresetId(storedPalettes.darkPreset),
  };
}

/** Built-in preset id, saved theme id (`saved:…`), or `custom`. */
export function normalizePresetId(raw: string | undefined | null): string {
  const id = String(raw || '').trim();
  if (!id) return 'gorkx';
  if (id === 'custom') return 'custom';
  if (THEME_PRESETS[id]) return id;
  if (id.startsWith('saved:')) return id;
  return 'custom';
}

export function resolvedThemeMode(theme: ThemePreference): ThemeSide {
  if (theme === 'light' || theme === 'dark') return theme;
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  return systemDark ? 'dark' : 'light';
}

/** Mix two hex colours; amount 0 = a, 1 = b. */
export function mixHex(a: string, b: string, amount: number): string {
  const pa = parseRgb(a);
  const pb = parseRgb(b);
  if (!pa || !pb) return a;
  const t = Math.max(0, Math.min(1, amount));
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

function parseRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex, '');
  if (!n || n.length !== 7) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
}

export function relativeLuminance(hex: string): number {
  const rgb = parseRgb(hex);
  if (!rgb) return 0.5;
  const lin = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Build CSS custom-property overrides for the active palette. */
export function paletteCssVars(palette: ThemePalette, side: ThemeSide): Record<string, string> {
  const bg = palette.background;
  const fg = palette.foreground;
  const accent = palette.accent;
  const contrast = clampContrast(palette.contrast) / 100;
  const isDark = side === 'dark';
  const elevMix = isDark ? 0.08 + contrast * 0.12 : 0.04 + contrast * 0.08;
  const elevated = mixHex(bg, isDark ? '#ffffff' : '#000000', elevMix);
  const main = mixHex(bg, isDark ? '#ffffff' : '#000000', elevMix * 0.45);
  const sidebar = mixHex(bg, isDark ? '#ffffff' : '#000000', elevMix * 0.7);
  const meta = mixHex(bg, isDark ? '#ffffff' : '#000000', elevMix * 1.1);
  const mutedMix = isDark ? 0.45 : 0.4;
  const muted = mixHex(fg, bg, mutedMix);
  const text2 = mixHex(fg, bg, mutedMix * 0.55);
  const hairA = 0.05 + contrast * 0.12;
  const hoverA = 0.04 + contrast * 0.1;
  const inkOnAccent = relativeLuminance(accent) > 0.55 ? '#111112' : '#ffffff';

  const fill = isDark
    ? `rgba(255, 255, 255, ${0.04 + contrast * 0.08})`
    : `rgba(0, 0, 0, ${0.03 + contrast * 0.06})`;
  const fillStrong = isDark
    ? `rgba(255, 255, 255, ${0.08 + contrast * 0.1})`
    : `rgba(0, 0, 0, ${0.05 + contrast * 0.08})`;
  const hairline = isDark
    ? `rgba(255, 255, 255, ${hairA})`
    : `rgba(0, 0, 0, ${hairA})`;
  const hairlineStrong = isDark
    ? `rgba(255, 255, 255, ${hairA + 0.06})`
    : `rgba(0, 0, 0, ${hairA + 0.05})`;
  const hover = isDark
    ? `rgba(255, 255, 255, ${hoverA})`
    : `rgba(0, 0, 0, ${hoverA})`;
  const active = isDark
    ? `rgba(255, 255, 255, ${hoverA + 0.05})`
    : `rgba(0, 0, 0, ${hoverA + 0.04})`;

  return {
    '--bg-app': bg,
    '--bg-main': main,
    '--bg-elevated': elevated,
    '--bg-sidebar': palette.translucentSidebar
      ? (isDark ? `color-mix(in srgb, ${sidebar} 88%, transparent)` : `color-mix(in srgb, ${sidebar} 92%, transparent)`)
      : sidebar,
    '--bg-hover': hover,
    '--bg-active': active,
    '--text': fg,
    '--text-2': text2,
    '--muted': muted,
    '--accent': accent,
    '--accent-ink': inkOnAccent,
    '--accent-soft': isDark ? `color-mix(in srgb, ${accent} 22%, transparent)` : `color-mix(in srgb, ${accent} 14%, transparent)`,
    '--focus-ring-color': accent,
    '--sb-text': fg,
    '--sb-text-2': text2,
    '--sb-muted': muted,
    '--sb-fill': fill,
    '--sb-fill-strong': fillStrong,
    '--sb-border': hairline,
    '--sb-active': active,
    '--sb-active-text': fg,
    '--glass': elevated,
    '--glass-strong': elevated,
    '--glass-soft': main,
    '--glass-fill': fill,
    '--glass-hover': hover,
    '--glass-active': active,
    '--glass-border': hairline,
    '--glass-border-dim': hairlineStrong,
    '--hairline': hairline,
    '--hairline-strong': hairlineStrong,
    '--border': hairline,
    '--panel': elevated,
    '--meta-surface': meta,
    '--user-bg': mixHex(bg, accent, isDark ? 0.18 : 0.1),
    '--user-fg': fg,
    '--assistant-fg': fg,
    '--icon-muted': muted,
    '--icon-strong': fg,
    '--font': palette.uiFont,
    '--mono': palette.codeFont,
    '--code-bg': isDark ? mixHex(bg, '#000000', 0.35) : mixHex(bg, '#000000', 0.88),
    '--code-fg': isDark ? fg : '#e8e8ed',
  };
}

const OVERRIDE_KEYS = [
  '--bg-app', '--bg-main', '--bg-elevated', '--bg-sidebar', '--bg-hover', '--bg-active',
  '--text', '--text-2', '--muted', '--accent', '--accent-ink', '--accent-soft', '--focus-ring-color',
  '--sb-text', '--sb-text-2', '--sb-muted', '--sb-fill', '--sb-fill-strong', '--sb-border',
  '--sb-active', '--sb-active-text',
  '--glass', '--glass-strong', '--glass-soft', '--glass-fill', '--glass-hover', '--glass-active',
  '--glass-border', '--glass-border-dim', '--hairline', '--hairline-strong', '--border', '--panel',
  '--meta-surface', '--user-bg', '--user-fg', '--assistant-fg', '--icon-muted', '--icon-strong',
  '--font', '--mono', '--code-bg', '--code-fg',
] as const;

export function applyAppearance(next: AppearancePreferences): void {
  const root = document.documentElement;
  const mode = resolvedThemeMode(next.theme);
  root.dataset.theme = mode;
  root.dataset.density = next.density;
  root.dataset.sidebarGlass = next[mode].translucentSidebar ? '1' : '0';

  // Clear previous palette overrides so CSS theme blocks remain the base.
  for (const key of OVERRIDE_KEYS) {
    root.style.removeProperty(key);
  }

  const vars = paletteCssVars(next[mode], mode);
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }

  try {
    localStorage.setItem(THEME_KEY, next.theme);
    localStorage.setItem(DENSITY_KEY, next.density);
    localStorage.setItem(
      PALETTE_KEY,
      JSON.stringify({
        light: next.light,
        dark: next.dark,
        lightPreset: next.lightPreset,
        darkPreset: next.darkPreset,
      }),
    );
  } catch {
    /* private browsing / full storage */
  }
}

export function initializeAppearance(): () => void {
  const refresh = () => applyAppearance(loadAppearance());
  refresh();
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener('change', refresh);
  return () => media?.removeEventListener('change', refresh);
}

export function applyPreset(
  prefs: AppearancePreferences,
  side: ThemeSide,
  presetId: string,
): AppearancePreferences {
  const preset = THEME_PRESETS[presetId];
  if (!preset) return prefs;
  if (side === 'light') {
    return { ...prefs, light: { ...preset.light }, lightPreset: presetId };
  }
  return { ...prefs, dark: { ...preset.dark }, darkPreset: presetId };
}

export function updatePaletteField<K extends keyof ThemePalette>(
  prefs: AppearancePreferences,
  side: ThemeSide,
  key: K,
  value: ThemePalette[K],
): AppearancePreferences {
  const nextPal = sanitizePalette({ ...prefs[side], [key]: value }, prefs[side]);
  if (side === 'light') {
    return { ...prefs, light: nextPal, lightPreset: 'custom' };
  }
  return { ...prefs, dark: nextPal, darkPreset: 'custom' };
}

/** Portable theme package for import / export (clipboard or file). */
export interface ThemePackage {
  version: 1;
  kind: 'gorkx-theme';
  light: ThemePalette;
  dark: ThemePalette;
  lightPreset?: string;
  darkPreset?: string;
}

export function exportThemePackage(prefs: AppearancePreferences): ThemePackage {
  return {
    version: 1,
    kind: 'gorkx-theme',
    light: prefs.light,
    dark: prefs.dark,
    lightPreset: prefs.lightPreset,
    darkPreset: prefs.darkPreset,
  };
}

export function parseThemePackage(raw: string): ThemePackage {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('INVALID_THEME_JSON');
  }
  if (!data || typeof data !== 'object') throw new Error('INVALID_THEME_JSON');
  const obj = data as Record<string, unknown>;
  if (obj.kind !== 'gorkx-theme' && obj.kind !== undefined) throw new Error('INVALID_THEME_KIND');
  const defaults = defaultAppearance();
  return {
    version: 1,
    kind: 'gorkx-theme',
    light: sanitizePalette(obj.light as ThemePalette, defaults.light),
    dark: sanitizePalette(obj.dark as ThemePalette, defaults.dark),
    lightPreset: typeof obj.lightPreset === 'string' ? obj.lightPreset : 'custom',
    darkPreset: typeof obj.darkPreset === 'string' ? obj.darkPreset : 'custom',
  };
}

export function mergeThemePackage(
  prefs: AppearancePreferences,
  pack: ThemePackage,
  side?: ThemeSide | 'both',
): AppearancePreferences {
  const target = side || 'both';
  if (target === 'light') {
    return {
      ...prefs,
      light: pack.light,
      lightPreset: pack.lightPreset || 'custom',
    };
  }
  if (target === 'dark') {
    return {
      ...prefs,
      dark: pack.dark,
      darkPreset: pack.darkPreset || 'custom',
    };
  }
  return {
    ...prefs,
    light: pack.light,
    dark: pack.dark,
    lightPreset: pack.lightPreset || 'custom',
    darkPreset: pack.darkPreset || 'custom',
  };
}

/** Snapshot lines used in the settings “theme preview diff” panel. */
export function themePreviewLines(palette: ThemePalette, side: ThemeSide): string[] {
  return [
    `const themePreview: ThemeConfig = {`,
    `  surface: "${side === 'dark' ? 'sidebar-elevated' : 'sidebar'}",`,
    `  accent: "${palette.accent}",`,
    `  contrast: ${clampContrast(palette.contrast)},`,
    `};`,
  ];
}

/** Inline styles for the live theme-mode preview card. */
export function themeCardPreviewStyle(palette: ThemePalette): {
  shell: Record<string, string>;
  chrome: Record<string, string>;
  line: Record<string, string>;
  card: Record<string, string>;
  accent: Record<string, string>;
} {
  const elevated = mixHex(palette.background, palette.foreground, 0.08);
  const line = mixHex(palette.foreground, palette.background, 0.55);
  return {
    shell: { background: palette.background, borderColor: mixHex(palette.foreground, palette.background, 0.82) },
    chrome: { background: elevated },
    line: { background: line },
    card: {
      background: elevated,
      borderColor: mixHex(palette.foreground, palette.background, 0.78),
    },
    accent: { background: palette.accent },
  };
}

function newSavedThemeId(): string {
  return `saved:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function sanitizeThemeName(name: string): string {
  return String(name || '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 48);
}

export function loadSavedThemes(): SavedTheme[] {
  try {
    const raw = localStorage.getItem(SAVED_THEMES_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const defaults = defaultAppearance();
    return data
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const name = sanitizeThemeName(String(row.name || ''));
        const id = String(row.id || '').trim();
        if (!name || !id.startsWith('saved:')) return null;
        return {
          id,
          name,
          light: sanitizePalette(row.light as ThemePalette, defaults.light),
          dark: sanitizePalette(row.dark as ThemePalette, defaults.dark),
          updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : Date.now(),
        } satisfies SavedTheme;
      })
      .filter((row): row is SavedTheme => Boolean(row))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SAVED_THEMES);
  } catch {
    return [];
  }
}

function persistSavedThemes(list: SavedTheme[]): void {
  try {
    localStorage.setItem(SAVED_THEMES_KEY, JSON.stringify(list.slice(0, MAX_SAVED_THEMES)));
  } catch {
    /* storage full */
  }
}

/** Save current light+dark palettes under a user-facing name. */
export function saveNamedTheme(prefs: AppearancePreferences, name: string, replaceId?: string): SavedTheme[] {
  const clean = sanitizeThemeName(name);
  if (!clean) throw new Error('EMPTY_THEME_NAME');
  const list = loadSavedThemes();
  const now = Date.now();
  if (replaceId) {
    const idx = list.findIndex((t) => t.id === replaceId);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        name: clean,
        light: { ...prefs.light },
        dark: { ...prefs.dark },
        updatedAt: now,
      };
      persistSavedThemes(list);
      return loadSavedThemes();
    }
  }
  const entry: SavedTheme = {
    id: newSavedThemeId(),
    name: clean,
    light: { ...prefs.light },
    dark: { ...prefs.dark },
    updatedAt: now,
  };
  persistSavedThemes([entry, ...list.filter((t) => t.name !== clean)]);
  return loadSavedThemes();
}

export function deleteNamedTheme(id: string): SavedTheme[] {
  const list = loadSavedThemes().filter((t) => t.id !== id);
  persistSavedThemes(list);
  return list;
}

export function applyNamedTheme(
  prefs: AppearancePreferences,
  id: string,
  side: ThemeSide | 'both' = 'both',
): AppearancePreferences {
  const entry = loadSavedThemes().find((t) => t.id === id);
  if (!entry) return prefs;
  if (side === 'light') {
    return { ...prefs, light: { ...entry.light }, lightPreset: id };
  }
  if (side === 'dark') {
    return { ...prefs, dark: { ...entry.dark }, darkPreset: id };
  }
  return {
    ...prefs,
    light: { ...entry.light },
    dark: { ...entry.dark },
    lightPreset: id,
    darkPreset: id,
  };
}

/** Copy one side’s palette onto the other. */
export function copyPaletteSide(
  prefs: AppearancePreferences,
  from: ThemeSide,
  to: ThemeSide,
): AppearancePreferences {
  if (from === to) return prefs;
  const next = { ...prefs[from] };
  if (to === 'light') return { ...prefs, light: next, lightPreset: 'custom' };
  return { ...prefs, dark: next, darkPreset: 'custom' };
}

/** Whether a typed hex is valid enough to commit. */
export function isValidHexInput(raw: string): boolean {
  return HEX.test(String(raw || '').trim());
}
