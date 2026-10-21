import { useEffect, useRef } from 'react';
import { Annotation, Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { toggleWrap, toggleTask } from './formatting.js';
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
  // Editor type scale (body 16px): title 28 > H1 24 > H2 20 > H3 17 > body 16.
  { tag: t.heading1, fontSize: '1.5em', fontWeight: '650', lineHeight: '1.3', letterSpacing: '-0.02em' },
  { tag: t.heading2, fontSize: '1.25em', fontWeight: '600', lineHeight: '1.35', letterSpacing: '-0.01em' },
  { tag: t.heading3, fontSize: '1.0625em', fontWeight: '600' },
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
  '&': { fontSize: '1rem', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.65', overflow: 'visible' },
  '.cm-content': { padding: '0', minHeight: '50vh', maxWidth: 'none', caretColor: 'rgb(var(--accent))' },
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

// Typewriter scrolling: keep the caret line vertically centered in whatever scrolls the editor
// (the focus-mode overlay or the window). Bottom padding lets the last lines reach the middle too.
const scrollParent = (el) => {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return document.scrollingElement || document.documentElement;
};
export const centerCaret = (view) => {
  const c = view.coordsAtPos(view.state.selection.main.head);
  if (!c) return;
  const sp = scrollParent(view.dom);
  const isRoot = sp === document.scrollingElement || sp === document.documentElement;
  const box = isRoot ? { top: 0, height: window.innerHeight } : sp.getBoundingClientRect();
  const delta = (c.top + c.bottom) / 2 - (box.top + box.height / 2);
  if (Math.abs(delta) > 2) sp.scrollTop += delta;
};
const typewriter = [
  EditorView.editorAttributes.of({ class: 'cm-typewriter' }), // index.css adds the bottom room
  EditorView.updateListener.of((u) => {
    if (!(u.docChanged || u.selectionSet || u.geometryChanged) || !u.view.hasFocus) return;
    // After CodeMirror's own scroll-into-view has run for this update.
    requestAnimationFrame(() => requestAnimationFrame(() => { if (u.view.dom.isConnected) centerCaret(u.view); }));
  }),
];

/**
 * Markdown editor (CodeMirror 6). Content stays a plain Markdown string, so plain-text notes
 * render as-is. `persist` = { userId, noteId } keeps the undo history in IndexedDB (omit for locked notes).
 */
export default function MarkdownEditor({ value, onChange, readOnly = false, placeholder = '', persist, focusMode = false, typewriter: typewriterOn = false, onReady, autoFocus = false, label = 'Note content' }) {
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
      { key: 'Mod-b', run: toggleWrap('**'), preventDefault: true },
      { key: 'Mod-i', run: toggleWrap('*'), preventDefault: true },
      { key: 'Mod-e', run: toggleWrap('`'), preventDefault: true },
      { key: 'Mod-Shift-x', run: toggleWrap('~~'), preventDefault: true },
      { key: 'Mod-Enter', run: toggleTask, preventDefault: true },
      ...completionKeymap, ...markdownKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...defaultKeymap,
    ]),
    comps.current.ro.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
    comps.current.tw.of(focusMode || typewriterOn ? typewriter : []),
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
    const view = viewRef.current;
    if (!view) return;
    const on = focusMode || typewriterOn;
    view.dispatch({ effects: comps.current.tw.reconfigure(on ? typewriter : []) });
    if (on && view.hasFocus) requestAnimationFrame(() => requestAnimationFrame(() => { if (view.dom.isConnected) centerCaret(view); }));
  }, [focusMode, typewriterOn]);

  return <div ref={host} data-testid="md-editor" className="md-editor mt-4" />;
}
