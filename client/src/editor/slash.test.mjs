import assert from 'node:assert/strict';
import { matchSlash, slashBefore } from './slash.js';
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

// QA v4 #2: positions are right with emoji before the slash (same line or the line above).
import { EditorState } from '@codemirror/state';
const at = (doc) => { const st = EditorState.create({ doc, selection: { anchor: doc.length } }); return slashBefore(st); };
assert.deepEqual(at('# Big head\n😄\n/Heading 2'), { from: 14, to: 24, query: 'Heading 2' });
assert.equal(at('😄 /h2').from, 3);
assert.equal(at('👨‍👩‍👧 x /Heading 2').query, 'Heading 2');
assert.equal(at('and/or'), null);
assert.equal(at('a /usr bin x y z'), null);
console.log('✅ slash position tests passed');
