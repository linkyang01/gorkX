import assert from 'node:assert/strict';
import { withConversationPresentation } from './conversationPresentation.ts';

const empty = withConversationPresentation('   ');
assert.equal(empty, '');

const source = '比较两个方案的成本和风险。';
const rendered = withConversationPresentation(source);
assert.ok(rendered.startsWith(source));
assert.ok(rendered.includes('Markdown 表格'));
assert.ok(rendered.includes('`mermaid`'));
assert.ok(rendered.includes('`chart`'));
assert.ok(rendered.includes('不要要求用户输入斜杠命令'));
console.log('conversationPresentation.test.ts: ok');
