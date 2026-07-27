/**
 * Stage C deliverable index helpers.
 * Run: node --experimental-strip-types src/lib/deliverables.test.ts
 */
import assert from 'node:assert/strict';
import {
  buildDeliverableSummary,
  groupDeliverables,
  indexDeliverables,
  isEditableTextDeliverable,
  isExternalHttpUrl,
  isStructurallySafeLocalPath,
  relativePathWithinProject,
  textEditConflicts,
} from './deliverables.ts';

assert.equal(isStructurallySafeLocalPath('/Users/me/proj/a.md'), true);
assert.equal(isStructurallySafeLocalPath('/Users/me/../etc/passwd'), false);
assert.equal(isStructurallySafeLocalPath('relative/a.md'), false);
assert.equal(isStructurallySafeLocalPath('file:///tmp/x'), false);
assert.equal(isStructurallySafeLocalPath(''), false);

assert.equal(isExternalHttpUrl('https://example.com/a'), true);
assert.equal(isExternalHttpUrl('http://example.com'), true);
assert.equal(isExternalHttpUrl('file:///tmp/x'), false);
assert.equal(isExternalHttpUrl('not a url'), false);

const indexed = indexDeliverables(
  [
    { id: '1', path: '/proj/out/report.md', name: 'report.md', kind: 'text' },
    { id: '2', path: '/proj/src/app.ts', name: 'app.ts', kind: 'text' },
    { id: '3', path: '/proj/shot.png', name: 'shot.png', kind: 'image' },
    // unsafe / traversal — dropped
    { id: '4', path: '/proj/../etc/passwd', name: 'passwd', kind: 'file' },
    { id: '5', path: '', name: 'docs', kind: 'file', href: 'https://docs.example.com' },
  ],
  [{ id: 'l1', href: 'https://example.com/pr/1', name: 'PR' }],
);

assert.equal(indexed.length, 5); // report, app, shot, docs link, PR
const groups = groupDeliverables(indexed);
assert.ok(groups.change.some((i) => i.name === 'report.md' || i.name === 'app.ts'));
assert.ok(groups.file.some((i) => i.name === 'shot.png'));
assert.ok(groups.link.some((i) => i.href?.includes('example.com')));
assert.ok(groups.link.some((i) => i.href?.includes('docs.example.com')));

// Traversal never indexed
assert.ok(!indexed.some((i) => i.path.includes('passwd')));

assert.equal(
  isEditableTextDeliverable({ kind: 'text', path: '/p/a.md' }),
  true,
);
assert.equal(
  isEditableTextDeliverable({ kind: 'image', path: '/p/a.png' }),
  false,
);

assert.equal(textEditConflicts('a', 'a'), false);
assert.equal(textEditConflicts('a', 'b'), true);

assert.equal(relativePathWithinProject('/proj/src/a.ts', '/proj'), 'src/a.ts');
assert.equal(relativePathWithinProject('/other/a.ts', '/proj'), null);
assert.equal(relativePathWithinProject('/proj/../x', '/proj'), null);

const summary = buildDeliverableSummary(
  [
    { id: '1', category: 'file', name: 'a.png', path: '/p/a.png', kind: 'image', source: 'acp_attachment' },
    { id: '2', category: 'link', name: 'PR', path: '', href: 'https://x.test/1', kind: 'link', source: 'acp_link' },
  ],
  { taskTitle: 'Demo task' },
);
assert.match(summary, /Demo task/);
assert.match(summary, /a\.png/);
assert.match(summary, /https:\/\/x\.test\/1/);
assert.equal(buildDeliverableSummary([]), '');

console.log('deliverables.test.ts: ok');
