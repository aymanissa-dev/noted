import { foldService } from '@codemirror/language';

// Fold a heading's section: from the end of the heading line to just before the next heading
// of the same or a higher level (ignoring lines inside code fences).
export const headingFold = foldService.of((state, lineStart, lineEnd) => {
  const line = state.doc.lineAt(lineStart);
  const m = /^ {0,3}(#{1,6})\s/.exec(line.text);
  if (!m) return null;
  const level = m[1].length;
  let fence = false;
  let last = line;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const l = state.doc.line(n);
    if (/^\s*```/.test(l.text)) fence = !fence;
    else if (!fence) { const h = /^ {0,3}(#{1,6})\s/.exec(l.text); if (h && h[1].length <= level) break; }
    last = l;
  }
  // Don't swallow trailing blank lines before the next heading.
  while (last.number > line.number && !last.text.trim()) last = state.doc.line(last.number - 1);
  return last.number > line.number ? { from: lineEnd, to: last.to } : null;
});
