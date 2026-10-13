import { useEffect, useRef } from 'react';
import { Annotation, Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyField, historyKeymap } from '@codemirror/commands';
import { markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown';
import { headingFold } from './fold.js';
import { foldGutter, foldKeymap, HighlightStyle, syntaxHighlighting, indentOnInput } from '@codemirror/language';
import { search, searchKeymap, openSearchPanel, closeSearchPanel, searchPanelOpen } from '@codemirror/search';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';
import { slashSource } from './slash.js';
import { checkboxes, highlightMarks, highlightTooltip, setHighlight } from './highlights.js';
import { loadUndo, saveUndo, dropUndo } from './undoStore.js';
import { searchEmoji } from '../lib/emoji.js';

const External = Annotation.define();

const mdHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.6em', fontWeight: '700', lineHeight: '1.3' },
  { tag: t.heading2, fontSize: '1.35em', fontWeight: '700', lineHeight: '1.35' },
  { tag: t.heading3, fontSize: '1.15em', fontWeight: '650' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '650' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'rgb(var(--accent))', textDecoration: 'underline' },
  { tag: t.url, class: 'cm-md-faint' },
  { tag: t.monospace, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.9em', class: 'cm-md-code' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], class: 'cm-md-faint' },
  { tag: t.quote, class: 'cm-md-quote' },
]);

function emojiSource(context) {
  const m = context.matchBefore(/(?:^|\s):[a-z0-9_+-]{2,}$/i);
  if (!m) return null;
  const from = m.from + m.text.indexOf(':');
  const q = m.text.slice(m.text.indexOf(':') + 1);
  const found = searchEmoji(q, 12);
  if (!found.length) return null;
  return { from, filter: false, options: found.map((e) => ({ label: `:${e.name}`, displayLabel: `${e.char}  ${e.name}`, apply: e.char, type: 'text' })) };
}

const theme = EditorView.theme({
  '&': { fontSize: '1.0625rem', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.75', overflow: 'visible' },
  '.cm-content': { padding: '0', minHeight: '50vh', maxWidth: '70ch', caretColor: 'rgb(var(--accent))' },
  '.cm-line': { padding: '0' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', cursor: 'pointer', color: '#a8a29e' },
  '.cm-placeholder': { color: '#d6d3d1' },
});

const foldMarker = (open) => {
  const s = document.createElement('span');
  s.textContent = open ? '▾' : '▸';
  s.title = open ? 'Fold section' : 'Unfold section';
  s.setAttribute('aria-hidden', 'true');
  return s;
};

// Typewriter scrolling: keep the cursor line vertically centered while typing.
const typewriter = EditorView.updateListener.of((u) => {
  if (!(u.docChanged || u.selectionSet) || !u.view.hasFocus) return;
  const pos = u.state.selection.main.head;
  requestAnimationFrame(() => u.view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) }));
});

/**
 * Markdown editor (CodeMirror 6). Content stays a plain Markdown string, so plain-text notes
 * render as-is. `persist` = { userId, noteId } keeps the undo history in IndexedDB (omit for locked notes).
 */
export default function MarkdownEditor({ value, onChange, readOnly = false, placeholder = '', persist, focusMode = false, onReady, autoFocus = false, label = 'Note content' }) {
  const host = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const comps = useRef({ ro: new Compartment(), tw: new Compartment() });
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const touched = useRef(false);

  const extensions = () => [
    history(),
    drawSelection(),
    indentOnInput(),
    markdownLanguage, headingFold,
    syntaxHighlighting(mdHighlight),
    foldGutter({ markerDOM: foldMarker }),
    search({ top: true }),
    autocompletion({ override: [slashSource, emojiSource], icons: false, activateOnTyping: true }),
    highlightMarks, highlightTooltip, checkboxes,
    EditorView.lineWrapping,
    placeholderExt(placeholder),
    theme,
    EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true', spellcheck: 'true', autocapitalize: 'sentences' }),
    keymap.of([
      { key: 'Mod-Shift-h', run: (v) => setHighlight(v, 'yellow') },
      ...completionKeymap, ...markdownKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...defaultKeymap,
    ]),
    comps.current.ro.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
    comps.current.tw.of(focusMode ? typewriter : []),
    EditorView.updateListener.of((u) => {
      if (!u.docChanged) return;
      const external = u.transactions.some((tr) => tr.annotation(External));
      if (!external) { touched.current = true; onChangeRef.current?.(u.state.doc.toString()); }
      schedulePersist(u.view);
    }),
  ];

  const persistTimer = useRef(null);
  const schedulePersist = (view) => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      const p = persistRef.current;
      if (p?.userId && p?.noteId) saveUndo(p.userId, p.noteId, view.state.toJSON({ history: historyField }));
    }, 800);
  };

  useEffect(() => {
    const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: value, extensions: extensions() }) });
    viewRef.current = view;
    if (autoFocus) view.focus();
    const api = {
      view,
      focus: () => view.focus(),
      openFind: () => { view.focus(); if (searchPanelOpen(view.state)) closeSearchPanel(view); else openSearchPanel(view); },
      jumpToLine: (n) => {
        const line = view.state.doc.line(Math.min(Math.max(1, n), view.state.doc.lines));
        view.dispatch({ selection: EditorSelection.cursor(line.to), effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 96 }) });
        view.focus();
      },
      highlight: (c) => setHighlight(view, c),
      insertText: (text) => { const r = view.state.selection.main; view.dispatch({ changes: { from: r.from, to: r.to, insert: text }, selection: { anchor: r.from + text.length }, userEvent: 'input' }); view.focus(); },
    };
    onReady?.(api);
    // Restore the saved undo history if the note hasn't changed since.
    const p = persistRef.current;
    if (p?.userId && p?.noteId) {
      loadUndo(p.userId, p.noteId).then((saved) => {
        if (!saved || touched.current || viewRef.current !== view) return;
        if (saved.doc !== view.state.doc.toString()) { dropUndo(p.userId, p.noteId); return; }
        try {
          const state = EditorState.fromJSON(saved, { extensions: extensions() }, { history: historyField });
          view.setState(state);
          if (autoFocus) view.focus();
        } catch { dropUndo(p.userId, p.noteId); }
      });
    }
    return () => { clearTimeout(persistTimer.current); view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External content changes (unlock, version restore): replace the document.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (value !== cur) view.dispatch({ changes: { from: 0, to: cur.length, insert: value }, annotations: External.of(true) });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: comps.current.ro.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]) });
  }, [readOnly]);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: comps.current.tw.reconfigure(focusMode ? typewriter : []) });
  }, [focusMode]);

  return <div ref={host} data-testid="md-editor" className="md-editor mt-4" />;
}
