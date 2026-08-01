/**
 * Appearance palette helpers.
 * Run: node --experimental-strip-types src/lib/appearance.test.ts
 */
import assert from 'node:assert/strict';
import {
  applyPreset,
  clampContrast,
  defaultAppearance,
  exportThemePackage,
  mergeThemePackage,
  mixHex,
  normalizeHex,
  paletteCssVars,
  parseThemePackage,
  sanitizePalette,
  themePreviewLines,
  updatePaletteField,
} from './appearance.ts';

assert.equal(normalizeHex('#abc', '#000000'), '#aabbcc');
assert.equal(normalizeHex('#AABBCC', '#000000'), '#aabbcc');
assert.equal(normalizeHex('not-a-color', '#111113'), '#111113');
assert.equal(clampContrast(150), 100);
assert.equal(clampContrast(-3), 0);
assert.equal(clampContrast(42.6), 43);

const base = defaultAppearance();
assert.equal(base.theme, 'dark');
assert.ok(base.light.accent);
assert.ok(base.dark.background);

const mixed = mixHex('#000000', '#ffffff', 0.5);
assert.equal(mixed, '#808080');

const vars = paletteCssVars(base.dark, 'dark');
assert.equal(vars['--bg-app'], base.dark.background);
assert.equal(vars['--accent'], base.dark.accent);
assert.equal(vars['--text'], base.dark.foreground);
assert.ok(vars['--font']);
assert.ok(vars['--mono']);

const custom = updatePaletteField(base, 'light', 'accent', '#0169cc');
assert.equal(custom.light.accent, '#0169cc');
assert.equal(custom.lightPreset, 'custom');

const preset = applyPreset(custom, 'light', 'codex');
assert.equal(preset.light.accent, '#0169cc');
assert.equal(preset.lightPreset, 'codex');

const pack = exportThemePackage(preset);
assert.equal(pack.kind, 'gorkx-theme');
assert.equal(pack.version, 1);
const round = parseThemePackage(JSON.stringify(pack));
assert.equal(round.light.accent, preset.light.accent);

const merged = mergeThemePackage(base, round, 'both');
assert.equal(merged.light.accent, round.light.accent);

assert.throws(() => parseThemePackage('not json'), /INVALID_THEME_JSON/);

const sanitized = sanitizePalette({ accent: 'nope', contrast: 999 }, base.light);
assert.equal(sanitized.accent, base.light.accent);
assert.equal(sanitized.contrast, 100);

const lines = themePreviewLines(base.dark, 'dark');
assert.ok(lines.some((l) => l.includes(base.dark.accent)));
assert.ok(lines[0].includes('ThemeConfig'));

console.log('appearance.test.ts: ok');
