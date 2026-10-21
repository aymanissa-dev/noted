// Enter, done the way people expect from a notes app:
//  1. "/Heading 2" + Enter applies the command even if you pressed Enter before the menu caught up.
//     (Completion results are async and CodeMirror ignores Enter for a moment after each update,
//     so fast typists used to get a literal "/Heading 2" and a new line.)
//  2. ":smile" + Enter inserts the emoji the same way.
//  3. Enter on an empty list item ends the list (or outdents a nested one) instead of leaving a
//     stray "-", "1." or "- [ ]" behind. Works for bullets, numbers and checklist items.
import { completionStatus, selectedCompletionIndex, closeCompletion } from '@codemirror/autocomplete';
import { slashBefore, matchSlash, applySlash } from './slash.js';
import { searchEmoji } from '../lib/emoji.js';

const EMOJI_RE = /(?:^|\s):([a-z0-9_+-]{2,})$/i;
const EMPTY_ITEM = /^(\s*)(?:[-*+]|\d+[.)])(?: \[[ xX]\])?\s*$/;

// The user moved through the menu: let the normal completion accept handle their choice.
const userPicked = (state) => completionStatus(state) === 'active' && (selectedCompletionIndex(state) ?? 0) > 0;

export function acceptTyped(view) {
  const { state } = view;
  const sel = state.selection.main;
  // Only while the menu is open or about to open (Esc closes it, and then Enter is just Enter).
  if (!sel.empty || !completionStatus(state) || userPicked(state)) return false;
  const slash = slashBefore(state);
  if (slash && slash.query.trim()) {
    const cmd = matchSlash(slash.query)[0];
    if (!cmd) return false;
    closeCompletion(view);
    applySlash(view, cmd, slash.from, slash.to);
    return true;
  }
  const line = state.doc.lineAt(sel.head);
  const m = EMOJI_RE.exec(state.sliceDoc(line.from, sel.head));
  if (m) {
    const [hit] = searchEmoji(m[1], 1);
    if (!hit) return false;
    const from = sel.head - m[1].length - 1;
    closeCompletion(view);
    view.dispatch({ changes: { from, to: sel.head, insert: hit.char }, selection: { anchor: from + hit.char.length }, userEvent: 'input.complete' });
    return true;
  }
  return false;
}

export function exitEmptyListItem(view) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.to) return false;
  const m = EMPTY_ITEM.exec(line.text);
  if (!m) return false;
  const indent = m[1];
  if (indent.length) {
    // Nested: step out one level (2 spaces or a tab), keeping the marker.
    const drop = indent.endsWith('\t') ? 1 : Math.min(indent.length, indent.length % 2 ? 1 : 2);
    view.dispatch({ changes: { from: line.from, to: line.from + drop }, userEvent: 'delete.dedent' });
    return true;
  }
  view.dispatch({ changes: { from: line.from, to: line.to }, selection: { anchor: line.from }, userEvent: 'delete' });
  return true;
}

export const smartEnter = (view) => acceptTyped(view) || exitEmptyListItem(view);
