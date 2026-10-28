// The shortcuts worth knowing in noted., kept short on purpose (shown in the shortcuts dialog,
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
    { keys: ['Mod+S'], label: 'Save now' },
  ] },
  { id: 'editor', title: 'Editor', items: [
    { keys: ['/'], label: 'Commands: headings, lists, date…', where: 'at line start' },
    { keys: [':'], label: 'Emoji (e.g. :smile)' },
    { keys: ['Mod+V'], label: 'Paste an image (or drop one, or type /image)' },
    { keys: ['Mod+Z'], label: 'Undo (kept after reload)' },
    { keys: ['Mod+Shift+Z'], pc: ['Mod+Y'], label: 'Redo' },
  ] },
  { id: 'formatting', title: 'Formatting', items: [
    { keys: ['Mod+B'], label: 'Bold' },
    { keys: ['Mod+I'], label: 'Italic' },
    { keys: ['Mod+Enter'], label: 'Toggle checklist item' },
  ] },
  { id: 'search', title: 'Search', items: [
    { keys: ['/'], label: 'Search notes', where: 'outside a note' },
    { keys: ['Mod+F'], label: 'Find and replace in a note' },
    { keys: ['Esc'], label: 'Clear search' },
  ] },
  { id: 'app', title: 'App', items: [
    { keys: ['Mod+K'], label: 'Search everything and jump anywhere' },
    { keys: ['?'], label: 'Keyboard shortcuts' },
  ] },
];

export const keysFor = (item, mac) => (!mac && item.pc) ? item.pc : item.keys;
export const allShortcuts = () => SHORTCUT_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));
