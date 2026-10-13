import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { SMART } from '../lib/smart.js';

const Icon = ({ d, className = 'h-4 w-4' }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
export const ICONS = {
  notes: 'M5 4h10l4 4v12H5zM15 4v4h4M8 12h8M8 16h5',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  smart: 'M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
  plus: 'M12 5v14M5 12h14',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
};
export { Icon };

const row = (active) => `group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition ${active ? 'bg-stone-200/70 text-stone-900 dark:bg-stone-800 dark:text-stone-100' : 'text-stone-600 hover:bg-stone-200/40 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-200'}`;

function Group({ title, action, children }) {
  return (
    <div className="mt-6">
      <div className="mb-1 flex items-center justify-between px-2.5"><h2 className="section-label">{title}</h2>{action}</div>
      {children}
    </div>
  );
}

// Desktop sidebar: notes, smart entries, recently viewed, folders, tags, archive, trash.
export default function Sidebar() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(search);
  const [folders, setFolders] = useState([]);
  const [tags, setTags] = useState([]);
  const [recent, setRecent] = useState([]);

  const load = useCallback(() => {
    api.folders().then(({ folders }) => setFolders(folders)).catch(() => {});
    api.tags().then(({ tags }) => setTags(tags)).catch(() => {});
    api.recentNotes().then(({ notes }) => setRecent(notes.slice(0, 5))).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const evs = ['noted:folders-changed', 'noted:queue-changed', 'noted:notes-changed'];
    evs.forEach((e) => window.addEventListener(e, load));
    return () => evs.forEach((e) => window.removeEventListener(e, load));
  }, [load]);
  useEffect(() => { if (pathname.startsWith('/notes/')) setTimeout(load, 300); }, [pathname, load]);

  const onList = pathname === '/notes';
  const isAll = onList && !params.get('folder') && !params.get('tag') && !params.get('smart');

  const newFolder = async () => {
    const name = window.prompt('New folder name');
    if (!name?.trim()) return;
    try { const { folder } = await api.createFolder(name.trim()); window.dispatchEvent(new Event('noted:folders-changed')); navigate(`/notes?folder=${folder._id}`); }
    catch (e) { window.alert(e.message); }
  };
  const renameFolder = async (f) => {
    const name = window.prompt('Rename folder', f.name);
    if (!name?.trim() || name.trim() === f.name) return;
    try { await api.renameFolder(f._id, name.trim()); window.dispatchEvent(new Event('noted:folders-changed')); } catch (e) { window.alert(e.message); }
  };
  const deleteFolder = async (f) => {
    if (!window.confirm(`Delete the folder “${f.name}”? Its notes are kept and moved out of the folder.`)) return;
    try {
      await api.deleteFolder(f._id);
      window.dispatchEvent(new Event('noted:folders-changed'));
      if (params.get('folder') === f._id) navigate('/notes');
    } catch (e) { window.alert(e.message); }
  };

  return (
    <nav aria-label="Sidebar" className="hidden w-60 shrink-0 lg:block">
      <div className="sticky top-[var(--header-h)] max-h-[calc(100vh-var(--header-h))] overflow-y-auto py-6 pr-4">
        <Link to="/notes" className={row(isAll)}><Icon d={ICONS.notes} />All notes</Link>

        <Group title="Smart">
          {SMART.map(([key, label]) => (
            <Link key={key} to={`/notes?smart=${key}`} className={row(onList && params.get('smart') === key)}><Icon d={ICONS.smart} />{label}</Link>
          ))}
        </Group>

        {recent.length > 0 && (
          <Group title="Recent">
            {recent.map((n) => (
              <Link key={n._id} to={`/notes/${n._id}`} className={row(pathname === `/notes/${n._id}`)}>
                <span aria-hidden="true" className="w-4 text-center text-xs">{n.locked ? '🔒' : n.emoji || '·'}</span>
                <span className="truncate">{n.locked ? 'Locked note' : n.title || 'Untitled'}</span>
              </Link>
            ))}
          </Group>
        )}

        <Group title="Folders" action={<button type="button" onClick={newFolder} className="rounded p-0.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200" aria-label="New folder" title="New folder"><Icon d={ICONS.plus} className="h-3.5 w-3.5" /></button>}>
          {folders.length === 0 && <button type="button" onClick={newFolder} className="px-2.5 py-1 text-xs text-faint hover:underline">Create a folder</button>}
          {folders.map((f) => (
            <div key={f._id} className="group relative">
              <Link to={`/notes?folder=${f._id}`} className={row(onList && params.get('folder') === f._id)}>
                <Icon d={ICONS.folder} /><span className="truncate pr-10">{f.name}</span>
                <span className="ml-auto text-xs text-faint group-hover:opacity-0">{f.count || ''}</span>
              </Link>
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <button type="button" onClick={() => renameFolder(f)} className="rounded px-1 text-xs text-stone-400 hover:text-stone-700 dark:hover:text-stone-200" aria-label={`Rename ${f.name}`} title="Rename">✎</button>
                <button type="button" onClick={() => deleteFolder(f)} className="rounded px-1 text-xs text-stone-400 hover:text-red-600" aria-label={`Delete ${f.name}`} title="Delete folder">✕</button>
              </div>
            </div>
          ))}
        </Group>

        {tags.length > 0 && (
          <Group title="Tags">
            {tags.map((t) => (
              <Link key={t} to={`/notes?tag=${encodeURIComponent(t)}`} className={row(onList && params.get('tag') === t)}><Icon d={ICONS.tag} /><span className="truncate">{t}</span></Link>
            ))}
          </Group>
        )}

        <div className="mt-6 border-t border-stone-200 pt-4 dark:border-stone-800">
          <NavLink to="/archive" className={({ isActive }) => row(isActive)}><Icon d={ICONS.archive} />Archive</NavLink>
          <NavLink to="/trash" className={({ isActive }) => row(isActive)}><Icon d={ICONS.trash} />Trash</NavLink>
        </div>
      </div>
    </nav>
  );
}

// Mobile bottom navigation (safe-area aware).
export function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const item = (active) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition ${active ? 'text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'}`;
  const search = () => {
    const focus = () => document.getElementById('search')?.focus();
    if (pathname === '/notes') focus(); else { navigate('/notes'); setTimeout(focus, 80); }
  };
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-stone-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-stone-800 dark:bg-stone-950/95 sm:hidden">
      <div className="flex">
        <Link to="/notes" className={item(pathname === '/notes')} aria-current={pathname === '/notes' ? 'page' : undefined}><Icon d={ICONS.notes} className="h-5 w-5" />Notes</Link>
        <button type="button" onClick={search} className={item(false)}><Icon d={ICONS.search} className="h-5 w-5" />Search</button>
        <Link to="/notes/new" className={item(pathname === '/notes/new')}><span className="grid h-5 w-5 place-items-center rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"><Icon d={ICONS.plus} className="h-3.5 w-3.5" /></span>New</Link>
        <Link to="/settings" className={item(pathname === '/settings')} aria-current={pathname === '/settings' ? 'page' : undefined}><Icon d={ICONS.settings} className="h-5 w-5" />Settings</Link>
      </div>
    </nav>
  );
}
