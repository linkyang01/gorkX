/**
 * Appearance palette helpers.
 * Run: node --experimental-strip-types src/lib/appearance.test.ts
 */
import assert from 'node:assert/strict';
import {
  applyNamedTheme,
  applyPreset,
  buildCustomFontStack,
  clampContrast,
  copyPaletteSide,
  defaultAppearance,
  deleteNamedTheme,
  exportThemePackage,
  extractPrimaryFontName,
  isValidHexInput,
  loadSavedThemes,
  matchFontOptionId,
  mergeThemePackage,
  mixHex,
  normalizeHex,
  normalizePresetId,
  paletteCssVars,
  parseThemePackage,
  sanitizeFontFamilyName,
  sanitizePalette,
  saveNamedTheme,
  syncAccent,
  themeCardPreviewStyle,
  themePreviewLines,
  updatePaletteField,
  workspacePreviewStyle,
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

assert.equal(sanitizeFontFamilyName('  Foo "Bar"  '), 'Foo Bar');
const customStack = buildCustomFontStack('JetBrains Mono', 'code');
assert.match(customStack, /^"JetBrains Mono"/);
assert.equal(extractPrimaryFontName(customStack), 'JetBrains Mono');
assert.equal(matchFontOptionId(base.light.uiFont, [{ id: 'system', stack: base.light.uiFont }]), 'system');
assert.equal(matchFontOptionId(customStack, [{ id: 'system', stack: base.light.uiFont }]), 'custom');

const accentSynced = syncAccent(
  updatePaletteField(base, 'light', 'accent', '#0169cc'),
  'light',
  'both',
);
assert.equal(accentSynced.light.accent, '#0169cc');
assert.equal(accentSynced.dark.accent, '#0169cc');

const previewStyle = workspacePreviewStyle(base.dark, 'dark');
assert.equal(previewStyle['--bg-app'], base.dark.background);
assert.equal(previewStyle['--accent'], base.dark.accent);

console.log('appearance.test.ts: ok');
