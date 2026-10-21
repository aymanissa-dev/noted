// The single source of truth for every keyboard shortcut in noted. (shown in the shortcuts dialog,
// the Help page, the command palette and tooltips). Keys use "Mod" for ⌘ on Mac / Ctrl elsewhere;
// a space means "press one, then the other" (e.g. "G N").
// `mac` overrides the combo on Apple keyboards when CodeMirror binds a different key there.
export const SHORTCUT_GROUPS = [
  { id: 'navigation', title: 'Navigation', items: [
    { keys: ['G N'], label: 'Go to all notes' },
    { keys: ['G A'], label: 'Go to archive' },
    { keys: ['G T'], label: 'Go to trash' },
    { keys: ['G S'], label: 'Go to settings' },
    { keys: ['G H'], label: 'Open Help' },
    { keys: ['Esc'], label: 'Go back / close' },
  ] },
  { id: 'notes', title: 'Notes', items: [
    { keys: ['N'], label: 'New note' },
    { keys: ['Q'], label: 'Quick capture' },
    { keys: ['Mod+S'], label: 'Save now' },
    { keys: ['Enter'], label: 'Save a quick note', where: 'quick capture' },
    { keys: ['Shift+Enter'], label: 'New line in a quick note', where: 'quick capture' },
  ] },
  { id: 'editor', title: 'Editor', items: [
    { keys: ['/'], label: 'Commands: headings, lists, date…', where: 'at line start' },
    { keys: [':'], label: 'Emoji (e.g. :smile)' },
    { keys: ['Mod+Z'], label: 'Undo (kept after reload)' },
    { keys: ['Mod+Shift+Z'], pc: ['Mod+Y'], label: 'Redo' },
    { keys: ['Alt+Up', 'Alt+Down'], label: 'Move line up / down' },
    { keys: ['Shift+Alt+Up', 'Shift+Alt+Down'], label: 'Duplicate line up / down' },
    { keys: ['Mod+Shift+K'], label: 'Delete line' },
    { keys: ['Mod+]', 'Mod+['], label: 'Indent / outdent' },
    { keys: ['Mod+Alt+['], pc: ['Ctrl+Shift+['], label: 'Fold section' },
    { keys: ['Mod+Alt+]'], pc: ['Ctrl+Shift+]'], label: 'Unfold section' },
    { keys: ['Mod+A'], label: 'Select all' },
    { keys: ['Alt+Shift+T'], label: 'Typewriter mode (keep the line centered)' },
  ] },
  { id: 'formatting', title: 'Formatting', items: [
    { keys: ['Mod+B'], label: 'Bold' },
    { keys: ['Mod+I'], label: 'Italic' },
    { keys: ['Mod+E'], label: 'Inline code' },
    { keys: ['Mod+Shift+X'], label: 'Strikethrough' },
    { keys: ['Mod+Shift+H'], label: 'Highlight' },
    { keys: ['Mod+Enter'], label: 'Toggle checklist item' },
  ] },
  { id: 'search', title: 'Search', items: [
    { keys: ['/'], label: 'Search notes', where: 'outside a note' },
    { keys: ['Mod+F'], label: 'Find and replace in a note' },
    { keys: ['Mod+G', 'Shift+Mod+G'], label: 'Next / previous match' },
    { keys: ['Mod+D'], label: 'Select next occurrence' },
    { keys: ['Esc'], label: 'Clear search' },
  ] },
  { id: 'app', title: 'App', items: [
    { keys: ['Mod+K'], label: 'Command palette' },
    { keys: ['?'], label: 'Keyboard shortcuts' },
    { keys: ['Up', 'Down'], label: 'Move through menus and the palette' },
  ] },
];

export const keysFor = (item, mac) => (!mac && item.pc) ? item.pc : item.keys;
export const allShortcuts = () => SHORTCUT_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));
