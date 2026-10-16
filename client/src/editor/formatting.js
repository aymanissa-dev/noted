import { EditorSelection } from '@codemirror/state';

// Wraps (or unwraps) each selection in a Markdown marker such as ** or `.
export function toggleWrap(marker) {
  return (view) => {
    const { state } = view;
    const n = marker.length;
    const ch = marker[0];
    const single = [...marker].every((c) => c === ch);
    // How many marker characters touch the selection on each side ("***word***" → 3).
    const run = (pos, dir) => { let k = 0; while (k < 4 && state.sliceDoc(dir < 0 ? pos - k - 1 : pos + k, dir < 0 ? pos - k : pos + k + 1) === ch) k++; return k; };
    // For * and **: italic is a run of 1 or 3, bold a run of 2 or 3 (so bold+italic nest correctly).
    const wrapped = (r) => {
      if (!single || (ch !== '*' && ch !== '_')) return state.sliceDoc(r.from - n, r.from) === marker && state.sliceDoc(r.to, r.to + n) === marker;
      const a = run(r.from, -1), b = run(r.to, 1), k = Math.min(a, b);
      return n === 1 ? k === 1 || k === 3 : k >= 2;
    };
    const tr = state.changeByRange((r) => {
      if (wrapped(r)) {
        return { changes: [{ from: r.from - n, to: r.from }, { from: r.to, to: r.to + n }], range: EditorSelection.range(r.from - n, r.to - n) };
      }
      const text = state.sliceDoc(r.from, r.to);
      if (text.length > 2 * n && text.startsWith(marker) && text.endsWith(marker)) {
        return { changes: { from: r.from, to: r.to, insert: text.slice(n, -n) }, range: EditorSelection.range(r.from, r.to - 2 * n) };
      }
      return { changes: [{ from: r.from, insert: marker }, { from: r.to, insert: marker }], range: EditorSelection.range(r.from + n, r.to + n) };
    });
    view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}

// Mod+Enter: turn the line into a checklist item, or tick/untick an existing one.
export function toggleTask(view) {
  const { state } = view;
  const changes = [];
  const seen = new Set();
  for (const r of state.selection.ranges) {
    const line = state.doc.lineAt(r.head);
    if (seen.has(line.number)) continue; seen.add(line.number);
    const m = /^(\s*)([-*+] )?(\[[ xX]\] )?/.exec(line.text);
    const indent = m[1].length;
    if (m[3]) {
      const at = line.from + indent + (m[2] || '').length + 1;
      changes.push({ from: at, to: at + 1, insert: /[xX]/.test(m[3]) ? ' ' : 'x' });
    } else if (m[2]) {
      const at = line.from + indent + m[2].length;
      changes.push({ from: at, insert: '[ ] ' });
    } else {
      changes.push({ from: line.from + indent, insert: '- [ ] ' });
    }
  }
  view.dispatch({ changes, userEvent: 'input.format' });
  return true;
}
