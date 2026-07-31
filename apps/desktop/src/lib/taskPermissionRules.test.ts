import assert from 'node:assert/strict';
import {
  decodePermissionRules,
  encodePermissionRules,
  isValidPermissionRuleBody,
  parsePermissionRulesForm,
  sanitizePermissionRules,
  splitPermissionRules,
  togglePermissionPreset,
} from './taskPermissionRules.ts';

assert.equal(isValidPermissionRuleBody('Bash'), true);
assert.equal(isValidPermissionRuleBody('Bash(git status)'), true);
assert.equal(isValidPermissionRuleBody('Edit(src/**)'), true);
assert.equal(isValidPermissionRuleBody('*'), false);
assert.equal(isValidPermissionRuleBody('Bash; rm -rf /'), false);
assert.equal(isValidPermissionRuleBody('UnknownTool'), false);

assert.deepEqual(
  parsePermissionRulesForm('deny Bash\nallow Read\n# comment\nallow: Edit(src/**)'),
  [
    { action: 'deny', rule: 'Bash' },
    { action: 'allow', rule: 'Read' },
    { action: 'allow', rule: 'Edit(src/**)' },
  ],
);

assert.throws(() => parsePermissionRulesForm('Bash'), /allow or deny/);

const toggled = togglePermissionPreset([], 'deny-bash');
assert.deepEqual(toggled, [{ action: 'deny', rule: 'Bash' }]);
assert.deepEqual(togglePermissionPreset(toggled, 'deny-bash'), []);

assert.deepEqual(splitPermissionRules([
  { action: 'allow', rule: 'Read' },
  { action: 'deny', rule: 'Bash' },
]), { allow: ['Read'], deny: ['Bash'] });

const encoded = encodePermissionRules([{ action: 'deny', rule: 'WebSearch' }]);
assert.deepEqual(decodePermissionRules(encoded), [{ action: 'deny', rule: 'WebSearch' }]);
assert.deepEqual(sanitizePermissionRules([{ action: 'allow', rule: '*' }]), []);

console.log('taskPermissionRules.test.ts: ok');
