import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Compact "move to folder" select for the editor toolbar.
export default function FolderPicker({ value, onChange, disabled }) {
  const [folders, setFolders] = useState(null);
  useEffect(() => {
    const load = () => api.folders().then(({ folders }) => setFolders(folders)).catch(() => setFolders((f) => f || []));
    load();
    window.addEventListener('noted:folders-changed', load);
    return () => window.removeEventListener('noted:folders-changed', load);
  }, []);
  const pick = async (e) => {
    let next = e.target.value;
    if (next === '__new') {
      const name = window.prompt('New folder name');
      if (!name?.trim()) return;
      try { const { folder } = await api.createFolder(name.trim()); setFolders((f) => [...(f || []), folder]); next = folder._id; }
      catch (err) { window.alert(err.message); return; }
    }
    onChange(next || null);
  };
  if (!folders) return null;
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Folder</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-2 h-4 w-4 text-stone-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
      <select data-testid="folder-picker" value={value || ''} onChange={pick} disabled={disabled}
        className="max-w-[9rem] cursor-pointer appearance-none truncate rounded-lg bg-transparent py-2 pl-8 pr-2 text-sm text-stone-600 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800">
        <option value="">No folder</option>
        {folders.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
        <option value="__new">+ New folder…</option>
      </select>
    </label>
  );
}
