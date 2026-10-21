// Enter, done the way people expect from a notes app:
//  1. "/Heading 2" + Enter applies the command even if you pressed Enter before the menu caught up.
//     (Completion results are async and CodeMirror ignores Enter for a moment after each update,
//     so fast typists used to get a literal "/Heading 2" and a new line.)
//  2. ":smile" + Enter inserts the emoji the same way.
import { completionStatus, selectedCompletionIndex, closeCompletion } from '@codemirror/autocomplete';
import { slashBefore, matchSlash, applySlash } from './slash.js';
import { searchEmoji } from '../lib/emoji.js';

const EMOJI_RE = /(?:^|\s):([a-z0-9_+-]{2,})$/i;

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

export const smartEnter = (view) => acceptTyped(view);
