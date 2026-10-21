import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useDialog } from '../context/DialogContext.jsx';

// Compact "move to folder" select for the editor toolbar.
export default function FolderPicker({ value, onChange, disabled }) {
  const [folders, setFolders] = useState(null);
  useEffect(() => {
    const load = () => api.folders().then(({ folders }) => setFolders(folders)).catch(() => setFolders((f) => f || []));
    load();
    window.addEventListener('noted:folders-changed', load); window.addEventListener('online', load);
    return () => { window.removeEventListener('noted:folders-changed', load); window.removeEventListener('online', load); };
  }, []);
  const dialog = useDialog();
  const pick = async (e) => {
    let next = e.target.value;
    if (next === '__new') {
      let created;
      await dialog.prompt({ title: 'New folder', body: 'This note moves into it.', label: 'Folder name', placeholder: 'e.g. Work', confirmLabel: 'Create and move',
        submit: async (v) => { ({ folder: created } = await api.createFolder(v)); } });
      if (!created) return;
      setFolders((f) => [...(f || []), created]); next = created._id;
      window.dispatchEvent(new Event('noted:folders-changed'));
    }
    onChange(next || null);
  };
  if (!folders) return null;
  return (
    <label className="relative inline-flex items-center" data-tip="Move to folder">
      <span className="sr-only">Folder</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted sm:left-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
      <select data-testid="folder-picker" value={value || ''} onChange={pick} disabled={disabled}
        className="h-11 w-11 cursor-pointer appearance-none truncate rounded-lg bg-transparent pl-11 text-[0px] text-stone-600 transition hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800 sm:h-9 sm:w-auto sm:max-w-[9rem] sm:pl-8 sm:pr-2.5 sm:text-sm">
        <option value="">No folder</option>
        {folders.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
        <option value="__new">New folder…</option>
      </select>
    </label>
  );
}
