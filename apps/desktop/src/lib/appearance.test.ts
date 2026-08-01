/**
 * Appearance palette helpers.
 * Run: node --experimental-strip-types src/lib/appearance.test.ts
 */
import assert from 'node:assert/strict';
import {
  applyNamedTheme,
  applyPreset,
  clampContrast,
  copyPaletteSide,
  defaultAppearance,
  deleteNamedTheme,
  exportThemePackage,
  isValidHexInput,
  loadSavedThemes,
  mergeThemePackage,
  mixHex,
  normalizeHex,
  normalizePresetId,
  paletteCssVars,
  parseThemePackage,
  sanitizePalette,
  saveNamedTheme,
  themeCardPreviewStyle,
  themePreviewLines,
  updatePaletteField,
} from './appearance.ts';

// Isolation: clear theme library keys between assertions when localStorage exists.
try {
  localStorage?.removeItem?.('gorkx.theme-library');
} catch {
  /* node without localStorage */
}

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

assert.equal(normalizePresetId('codex'), 'codex');
assert.equal(normalizePresetId('custom'), 'custom');
assert.equal(normalizePresetId('saved:abc'), 'saved:abc');
assert.equal(isValidHexInput('#339cff'), true);
assert.equal(isValidHexInput('zzz'), false);

const card = themeCardPreviewStyle(base.dark);
assert.equal(card.shell.background, base.dark.background);
assert.equal(card.accent.background, base.dark.accent);

const swapped = copyPaletteSide(base, 'dark', 'light');
assert.equal(swapped.light.accent, base.dark.accent);
assert.equal(swapped.lightPreset, 'custom');

// Named theme library only when localStorage is available (browser / --localstorage-file).
if (typeof localStorage !== 'undefined') {
  const saved = saveNamedTheme(preset, 'My Codex');
  assert.ok(saved.some((t) => t.name === 'My Codex'));
  const id = saved[0].id;
  const applied = applyNamedTheme(base, id, 'both');
  assert.equal(applied.light.accent, preset.light.accent);
  assert.equal(applied.lightPreset, id);
  const afterDelete = deleteNamedTheme(id);
  assert.ok(!afterDelete.some((t) => t.id === id));
  assert.equal(loadSavedThemes().length, afterDelete.length);
  assert.throws(() => saveNamedTheme(base, '   '), /EMPTY_THEME_NAME/);
}

console.log('appearance.test.ts: ok');
