import assert from 'node:assert/strict';
import {
  ACCEPTANCE_SHIFT_META_ACTIONS,
  DESKTOP_SHORTCUT_SPECS,
  desktopShortcutHelpTable,
  matchDesktopShortcut,
} from './desktopShortcuts.ts';

// A2 acceptance: ⇧⌘ A/B/M/S/P/I must be defined once.
for (const id of ACCEPTANCE_SHIFT_META_ACTIONS) {
  const spec = DESKTOP_SHORTCUT_SPECS.find((row) => row.id === id);
  assert.ok(spec, `missing acceptance shortcut ${id}`);
  assert.equal(spec!.meta, true);
  assert.equal(spec!.shift, true);
}

// Help table includes every global product chord.
const helpKeys = new Set(desktopShortcutHelpTable().map((row) => row.keys));
for (const spec of DESKTOP_SHORTCUT_SPECS) {
  assert.ok(helpKeys.has(spec.keysLabel), `help missing ${spec.keysLabel}`);
}

// Matcher: shift-meta letters
assert.equal(
  matchDesktopShortcut({ key: 'P', code: 'KeyP', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }),
  'process',
);
assert.equal(
  matchDesktopShortcut({ key: 'i', code: 'KeyI', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }),
  'task-info',
);
assert.equal(
  matchDesktopShortcut({ key: 'b', code: 'KeyB', metaKey: false, ctrlKey: true, shiftKey: true, altKey: false }),
  'spawn-subagent',
);
assert.equal(
  matchDesktopShortcut({ key: '/', code: 'Slash', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }),
  'help',
);
assert.equal(
  matchDesktopShortcut({ key: 'n', code: 'KeyN', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }),
  'new-task',
);
// Shift+N must not match plain ⌘N
assert.equal(
  matchDesktopShortcut({ key: 'n', code: 'KeyN', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }),
  null,
);
// Voice only when enabled
assert.equal(
  matchDesktopShortcut(
    { key: 'F8', code: 'F8', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false },
    { voiceEnabled: true },
  ),
  'voice',
);
assert.equal(
  matchDesktopShortcut(
    { key: 'F8', code: 'F8', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false },
    { voiceEnabled: false },
  ),
  null,
);
assert.equal(
  matchDesktopShortcut(
    { key: ' ', code: 'Space', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false },
    { voiceEnabled: true },
  ),
  'voice',
);

// No accidental alt chords
assert.equal(
  matchDesktopShortcut({ key: 'n', code: 'KeyN', metaKey: true, ctrlKey: false, shiftKey: false, altKey: true }),
  null,
);

console.log('desktopShortcuts.test.ts: ok');
