import { SHORTCUTS, EDITOR_SHORTCUTS } from '../lib/useShortcuts.js';
import Dialog from './Dialog.jsx';

const Rows = ({ items }) => (
  <ul className="space-y-1">
    {items.map(([key, label]) => (
      <li key={key} className="flex min-h-9 items-center justify-between gap-4 text-sm">
        <span className="text-muted">{label}</span>
        <span className="flex shrink-0 gap-1">{key.split(' + ').map((k) => <kbd key={k} className="kbd">{k}</kbd>)}</span>
      </li>
    ))}
  </ul>
);

export default function ShortcutsHelp({ onClose }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} closeButton size="md">
      <div className="grid gap-6 sm:grid-cols-2">
        <div><h3 className="section-label mb-2">Anywhere</h3><Rows items={SHORTCUTS} /></div>
        <div><h3 className="section-label mb-2">In a note</h3><Rows items={EDITOR_SHORTCUTS} /></div>
      </div>
    </Dialog>
  );
}
