import assert from 'node:assert/strict';
import { parseQuickCapture, TITLE_MAX } from './quickCapture.js';

assert.equal(parseQuickCapture('   '), null);
assert.deepEqual(parseQuickCapture('Buy milk'), { title: 'Buy milk', content: '', tags: [] });
assert.deepEqual(parseQuickCapture('Idea\nline two\nline three'), { title: 'Idea', content: 'line two\nline three', tags: [] });
assert.deepEqual(parseQuickCapture('Call mom #family #Todo'), { title: 'Call mom', content: '', tags: ['family', 'todo'] });
const long = 'word '.repeat(80).trim();
const p = parseQuickCapture(long);
assert.ok(p.title.length <= TITLE_MAX); assert.equal(`${p.title} ${p.content}`, long);
assert.deepEqual(parseQuickCapture('\r\nTitle\r\nBody\r\n'), { title: 'Title', content: 'Body', tags: [] });
console.log('✅ quick capture tests passed');
