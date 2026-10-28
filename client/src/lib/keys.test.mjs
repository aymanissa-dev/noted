import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EditorState, EditorSelection } from '@codemirror/state';
import { keyParts, keyLabel } from './keys.js';
import { SHORTCUT_GROUPS, keysFor } from './shortcutList.js';
import { toggleWrap, toggleTask } from '../editor/formatting.js';

// Platform-aware labels
assert.deepEqual(keyParts('Mod+Shift+K', true), ['⌘', '⇧', 'K']);
assert.deepEqual(keyParts('Mod+Shift+K', false), ['Ctrl', 'Shift', 'K']);
assert.equal(keyLabel('Mod+K', true), '⌘K');
assert.equal(keyLabel('Mod+K', false), 'Ctrl+K');
assert.equal(keyLabel('G N', false), 'G then N');

// The reference lists the six groups, and every editor/formatting binding we document is really bound.
assert.deepEqual(SHORTCUT_GROUPS.map((g) => g.title), ['Navigation', 'Notes', 'Editor', 'Formatting', 'Search', 'App']);
const src = readFileSync(new URL('../editor/MarkdownEditor.jsx', import.meta.url), 'utf8');
for (const k of ['Mod-b', 'Mod-i', 'Mod-e', 'Mod-Shift-x', 'Mod-Shift-h', 'Mod-Enter']) assert.ok(src.includes(`'${k}'`), `${k} bound`);
const shortcuts = readFileSync(new URL('./useShortcuts.js', import.meta.url), 'utf8');
for (const k of ["k === 'n'", "e.key === '/'", "e.key === '?'", "=== 'k'", 'GO[k]']) assert.ok(shortcuts.includes(k), `${k} handled`);
for (const g of SHORTCUT_GROUPS) for (const i of g.items) { assert.ok(i.label); assert.ok(keysFor(i, true).length && keysFor(i, false).length); }

// Formatting commands
const run = (doc, from, to, cmd) => {
  let state = EditorState.create({ doc, selection: EditorSelection.single(from, to) });
  const view = { get state() { return state; }, dispatch: (tr) => { state = tr.state ? tr.state : state.update(tr).state; } };
  cmd(view); return state;
};
let s = run('a word b', 2, 6, toggleWrap('**'));
assert.equal(s.doc.toString(), 'a **word** b');
s = run(s.doc.toString(), 4, 8, toggleWrap('*'));
assert.equal(s.doc.toString(), 'a ***word*** b', 'italic nests inside bold');
s = run(s.doc.toString(), 5, 9, toggleWrap('**'));
assert.equal(s.doc.toString(), 'a *word* b', 'bold toggles off, italic stays');
assert.equal(run('buy milk', 0, 0, toggleTask).doc.toString(), '- [ ] buy milk');
assert.equal(run('- [ ] buy milk', 3, 3, toggleTask).doc.toString(), '- [x] buy milk');
assert.equal(run('- buy milk', 3, 3, toggleTask).doc.toString(), '- [ ] buy milk');
console.log('keys + shortcuts + formatting tests passed');
