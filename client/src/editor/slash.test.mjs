import assert from 'node:assert/strict';
import { matchSlash } from './slash.js';
const ids = (q) => matchSlash(q).map((c) => c.id);
// QA v3 #3: "/Heading 1" with a space must match.
assert.deepEqual(ids('Heading 1'), ['h1']);
assert.deepEqual(ids('heading  2'), ['h2']);
assert.deepEqual(ids('heading1'), ['h1']);
assert.deepEqual(ids('h3'), ['h3']);
assert.ok(ids('head').length === 3);
assert.deepEqual(ids('code block'), ['code']);
assert.deepEqual(ids('bulleted list'), ['bullet']);
assert.equal(ids('nothing here').length, 0);
assert.equal(ids('').length, 9);
console.log('✅ slash tests passed');
