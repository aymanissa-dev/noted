import { Decoration, EditorView, MatchDecorator, ViewPlugin, WidgetType, showTooltip } from '@codemirror/view';
import { StateField } from '@codemirror/state';

export const HL_COLORS = ['yellow', 'green', 'blue', 'pink'];
const HL_RE = /==(?:\{(yellow|green|blue|pink)\})?([^=\n]+?)==/g;

// Highlights are stored as ==text== (yellow) or =={color}text==, and drawn as marks.
const hlMatcher = new MatchDecorator({
  regexp: HL_RE,
  decoration: (m) => Decoration.mark({ class: `cm-hl cm-hl-${m[1] || 'yellow'}` }),
});
export const highlightMarks = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = hlMatcher.createDeco(view); }
  update(u) { this.decorations = hlMatcher.updateDeco(u, this.decorations); }
}, { decorations: (v) => v.decorations });

// Wrap the selection in a highlight of `color`, or remove highlights inside it (color = null).
export function setHighlight(view, color) {
  const { from, to } = view.state.selection.main;
  if (from === to) return false;
  const text = view.state.sliceDoc(from, to);
  // Expand to a surrounding highlight if the selection is inside one.
  const line = view.state.doc.lineAt(from);
  let start = from; let end = to; let inner = text;
  for (const m of line.text.matchAll(HL_RE)) {
    const s = line.from + m.index; const e = s + m[0].length;
    if (s <= from && e >= to) { start = s; end = e; inner = m[2]; break; }
  }
  inner = inner.replace(HL_RE, '$2');
  const insert = color ? `==${color === 'yellow' ? '' : `{${color}}`}${inner}==` : inner;
  const offset = color ? insert.indexOf(inner) : 0;
  view.dispatch({ changes: { from: start, to: end, insert }, selection: { anchor: start + offset, head: start + offset + inner.length }, userEvent: 'input.highlight' });
  view.focus();
  return true;
}

// Small floating color bar above a non-empty selection.
function selectionTooltip(state) {
  const r = state.selection.main;
  if (r.empty || state.readOnly) return [];
  if (state.doc.lineAt(r.from).number !== state.doc.lineAt(r.to).number) return [];
  return [{
    pos: r.from, above: true, strictSide: false, arrow: false,
    create: (view) => {
      const dom = document.createElement('div');
      dom.className = 'cm-hl-bar';
      dom.setAttribute('role', 'toolbar');
      dom.setAttribute('aria-label', 'Highlight');
      for (const c of [...HL_COLORS, null]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = c ? `cm-hl-swatch cm-hl-${c}` : 'cm-hl-swatch cm-hl-clear';
        b.title = c ? `Highlight ${c}` : 'Remove highlight';
        b.setAttribute('aria-label', b.title);
        b.dataset.color = c || 'none';
        if (!c) b.textContent = '✕';
        b.addEventListener('mousedown', (e) => { e.preventDefault(); setHighlight(view, c); });
        dom.appendChild(b);
      }
      return { dom };
    },
  }];
}
export const highlightTooltip = StateField.define({
  create: selectionTooltip,
  update: (tips, tr) => (tr.docChanged || tr.selection ? selectionTooltip(tr.state) : tips),
  provide: (f) => showTooltip.computeN([f], (s) => s.field(f)),
});

// Clickable checkboxes for "- [ ]" / "- [x]" task items.
class CheckboxWidget extends WidgetType {
  constructor(checked) { super(); this.checked = checked; }
  eq(o) { return o.checked === this.checked; }
  toDOM() {
    const box = document.createElement('input');
    box.type = 'checkbox'; box.checked = this.checked; box.className = 'cm-task';
    box.setAttribute('aria-label', this.checked ? 'Mark as not done' : 'Mark as done');
    return box;
  }
  ignoreEvent() { return false; }
}
const taskMatcher = new MatchDecorator({
  regexp: /^(\s*[-*+]\s+)\[([ xX])\]/gm,
  decorate: (add, from, _to, m) => {
    const start = from + m[1].length;
    add(start, start + 3, Decoration.replace({ widget: new CheckboxWidget(m[2] !== ' ') }));
  },
});
export const checkboxes = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = taskMatcher.createDeco(view); }
  update(u) { this.decorations = taskMatcher.updateDeco(u, this.decorations); }
}, {
  decorations: (v) => v.decorations,
  provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.decorations || Decoration.none),
  eventHandlers: {
    mousedown(e, view) {
      if (!(e.target instanceof HTMLInputElement) || !e.target.classList.contains('cm-task')) return false;
      if (view.state.readOnly) return true;
      const pos = view.posAtDOM(e.target);
      const mark = view.state.sliceDoc(pos, pos + 3);
      if (!/^\[[ xX]\]$/.test(mark)) return false;
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: mark[1] === ' ' ? 'x' : ' ' }, userEvent: 'input.check' });
      e.preventDefault();
      return true;
    },
  },
});
