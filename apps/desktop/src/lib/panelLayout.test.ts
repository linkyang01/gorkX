/**
 * Drives shipped panelLayout helpers (Stage A defaults).
 * Run: node --experimental-strip-types src/lib/panelLayout.test.ts
 */
import assert from 'node:assert/strict';
import {
  isOptInPanelOpen,
  loadOptInPanelOpen,
  pickHomeRecentTasks,
  OPT_IN_PANEL_KEYS,
} from './panelLayout.ts';

// Fresh / missing storage → closed
assert.equal(isOptInPanelOpen(null), false);
assert.equal(isOptInPanelOpen(undefined), false);
assert.equal(isOptInPanelOpen(''), false);
assert.equal(isOptInPanelOpen('0'), false);
assert.equal(isOptInPanelOpen('false'), false);
assert.equal(isOptInPanelOpen('yes'), false);

// Explicit opt-in only
assert.equal(isOptInPanelOpen('1'), true);
assert.equal(isOptInPanelOpen('true'), true);

const store: Record<string, string> = {};
assert.equal(
  loadOptInPanelOpen(OPT_IN_PANEL_KEYS.review, (k) => store[k] ?? null),
  false,
);
store[OPT_IN_PANEL_KEYS.review] = '1';
assert.equal(
  loadOptInPanelOpen(OPT_IN_PANEL_KEYS.review, (k) => store[k] ?? null),
  true,
);
store[OPT_IN_PANEL_KEYS.terminal] = '0';
assert.equal(
  loadOptInPanelOpen(OPT_IN_PANEL_KEYS.terminal, (k) => store[k] ?? null),
  false,
);

// Home recent ranking
assert.deepEqual(pickHomeRecentTasks([]), []);
const ranked = pickHomeRecentTasks(
  [
    { id: 'a', updatedAt: 10 },
    { id: 'b', updatedAt: 30 },
    { id: 'c', updatedAt: 20 },
    { id: 'd', updatedAt: 5 },
  ],
  3,
);
assert.deepEqual(
  ranked.map((t) => t.id),
  ['b', 'c', 'a'],
);
assert.deepEqual(pickHomeRecentTasks([{ id: 'only' }], 5).map((t) => t.id), ['only']);
assert.deepEqual(pickHomeRecentTasks([{ id: 'x', updatedAt: 1 }], 0), []);

console.log('panelLayout.test.ts: ok');
