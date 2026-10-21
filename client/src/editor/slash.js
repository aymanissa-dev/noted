// Slash commands: type "/" at the start of a line or after a space.
const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export const SLASH_COMMANDS = [
  { id: 'h1', label: 'Heading 1', detail: '#', line: '# ' },
  { id: 'h2', label: 'Heading 2', detail: '##', line: '## ' },
  { id: 'h3', label: 'Heading 3', detail: '###', line: '### ' },
  { id: 'checklist', label: 'Checklist', detail: '- [ ]', line: '- [ ] ' },
  { id: 'bullet', label: 'Bulleted list', detail: '-', line: '- ' },
  { id: 'divider', label: 'Divider', detail: '---', block: '---\n' },
  { id: 'date', label: 'Date', detail: 'today', text: () => today() },
  { id: 'code', label: 'Code block', detail: '```', block: '```\n\n```', cursorBack: 4 },
  { id: 'quote', label: 'Quote', detail: '>', line: '> ' },
];

// Applies a command, replacing the typed "/query" (from..to).
export function applySlash(view, cmd, from, to) {
  const { state } = view;
  const line = state.doc.lineAt(from);
  const atLineStart = !state.doc.sliceString(line.from, from).trim();
  let insert; let start = from; let end = to; let cursor;
  if (cmd.text) { insert = cmd.text(); cursor = start + insert.length; }
  else if (cmd.line) {
    // Turn the whole line into a heading/list item (keeping its text).
    const rest = state.doc.sliceString(to, line.to).replace(/^\s+/, '');
    const before = atLineStart ? '' : state.doc.sliceString(line.from, from).replace(/\s+$/, '');
    start = line.from; end = line.to;
    insert = before ? `${before}\n${cmd.line}${rest}` : `${cmd.line}${rest}`;
    cursor = start + insert.length - rest.length;
  } else {
    const prefix = atLineStart ? '' : '\n';
    const next = state.doc.sliceString(to, Math.min(to + 1, state.doc.length));
    insert = prefix + cmd.block + (next && next !== '\n' ? '\n' : '');
    cursor = start + prefix.length + cmd.block.length - (cmd.cursorBack || 0);
  }
  view.dispatch({ changes: { from: start, to: end, insert }, selection: { anchor: cursor }, scrollIntoView: true, userEvent: 'input.slash' });
}

const squash = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

// Commands matching a query ("h1", "head", "heading 1", "heading1").
export function matchSlash(query) {
  const q = squash(query); const tight = q.replace(/ /g, '');
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => {
    const l = c.label.toLowerCase();
    return l.includes(q) || l.replace(/ /g, '').includes(tight) || c.id.startsWith(tight);
  });
}

export function slashSource(context) {
  // Allow up to two spaces in the query so "/Heading 1" works; stop matching once nothing fits.
  const m = context.matchBefore(/(?:^|\s)\/[\w-]*(?: [\w-]*){0,2}$/);
  if (!m) return null;
  const slash = m.text.indexOf('/');
  const from = m.from + slash;
  const query = m.text.slice(slash + 1);
  if (!query && !context.explicit && m.to !== context.pos) return null;
  const matches = matchSlash(query);
  if (/\s/.test(query) && !matches.length) return null;
  const options = matches.map((c) => ({ label: `/${c.id}`, displayLabel: c.label, detail: c.detail, type: 'keyword', apply: (view, _c, f, t) => applySlash(view, c, f, t) }));
  return { from, options, filter: false };
}
