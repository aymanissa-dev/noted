import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api, readMeta } from '../lib/api.js';
import { SMART } from '../lib/smart.js';
import { useDialog } from '../context/DialogContext.jsx';
import Icon from './Icon.jsx';
import { useRefetch } from '../lib/network.js';
import { useToast } from '../context/ToastContext.jsx';

const SMART_ICON = { recent: 'clock', pinned: 'pin', today: 'today', week: 'week', untagged: 'untagged', locked: 'lock' };

const row = (active) => `group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition ${active ? 'bg-stone-200/70 font-medium text-stone-900 dark:bg-white/[0.09] dark:text-white dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]' : 'text-stone-600 hover:bg-stone-200/40 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-white/[0.05] dark:hover:text-white'}`;

function Group({ title, action, children }) {
  return (
    <div className="mt-6">
      <div className="mb-1 flex items-center justify-between px-2.5"><h2 className="section-label">{title}</h2>{action}</div>
      {children}
    </div>
  );
}

// Desktop sidebar: notes, smart entries, recently viewed, folders, tags, archive, trash.
export default function Sidebar({ onOpen }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(search);
  // Paint from the last known copies, then refresh.
  const [folders, setFolders] = useState(() => readMeta('folders') || []);
  const [tags, setTags] = useState(() => readMeta('tags') || []);
  const [recent, setRecent] = useState(() => (readMeta('recent') || []).slice(0, 5));

  const [failing, setFailing] = useState(false);
  const load = useCallback(() => {
    Promise.all([
      api.folders().then(({ folders }) => setFolders(folders)),
      api.tags().then(({ tags }) => setTags(tags)),
      api.recentNotes().then(({ notes }) => setRecent(notes.slice(0, 5))),
    ]).then(() => setFailing(false), () => setFailing(true));
  }, []);
  // Showing cached copies while a refresh fails: retry on reconnect / focus / backoff.
  useRefetch(load, { failing });
  useEffect(() => {
    load();
    // Coalesce bursts (autosave, bulk actions) into one refresh.
    let t;
    const soon = () => { clearTimeout(t); t = setTimeout(load, 250); };
    const evs = ['noted:folders-changed', 'noted:queue-changed', 'noted:notes-changed'];
    evs.forEach((e) => window.addEventListener(e, soon));
    return () => { clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, soon)); };
  }, [load]);
  useEffect(() => { if (pathname.startsWith('/notes/')) setTimeout(load, 300); }, [pathname, load]);

  const onList = pathname === '/notes';
  const isAll = onList && !params.get('folder') && !params.get('tag') && !params.get('smart');

  const dialog = useDialog();
  const toast = useToast();
  const newFolder = async () => {
    let created;
    const name = await dialog.prompt({
      title: 'New folder', label: 'Folder name', placeholder: 'e.g. Work', confirmLabel: 'Create folder',
      submit: async (v) => { ({ folder: created } = await api.createFolder(v)); },
    });
    if (!name || !created) return;
    window.dispatchEvent(new Event('noted:folders-changed'));
    navigate(`/notes?folder=${created._id}`);
  };
  const renameFolder = async (f) => {
    const name = await dialog.prompt({
      title: 'Rename folder', label: 'Folder name', initial: f.name, confirmLabel: 'Rename',
      submit: async (v) => { if (v !== f.name) await api.renameFolder(f._id, v); },
    });
    if (name && name !== f.name) window.dispatchEvent(new Event('noted:folders-changed'));
  };
  const deleteFolder = async (f) => {
    const ok = await dialog.confirm({
      title: `Delete “${f.name}”?`, body: 'The folder goes away. Its notes stay, they just won’t be in a folder anymore.',
      confirmLabel: 'Delete folder', danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteFolder(f._id);
      window.dispatchEvent(new Event('noted:folders-changed'));
      if (params.get('folder') === f._id) navigate('/notes');
      toast.show(`Folder “${f.name}” deleted. Its notes are still in All notes.`);
    } catch (e) { toast.show(`Couldn’t delete the folder: ${e.message}`); }
  };

  return (
    <nav aria-label="Sidebar" className="hidden w-60 shrink-0 lg:block">
      <div className="sticky top-[var(--header-h)] max-h-[calc(100vh-var(--header-h))] overflow-y-auto py-6 pr-4">
        <Link to="/notes" className={row(isAll)}><Icon name="notes" />All notes</Link>

        <Group title="Smart">
          {SMART.filter(([key]) => key !== 'recent' || recent.length === 0).map(([key, label]) => (
            <Link key={key} to={`/notes?smart=${key}`} className={row(onList && params.get('smart') === key)}><Icon name={SMART_ICON[key] || 'star'} />{label}</Link>
          ))}
        </Group>

        {recent.length > 0 && (
          <Group title="Recently viewed" action={<Link to="/notes?smart=recent" className="rounded px-1 text-xs text-faint transition hover:text-stone-800 dark:hover:text-stone-200">See all</Link>}>
            {recent.map((n) => (
              <Link key={n._id} to={`/notes/${n._id}`} className={row(pathname === `/notes/${n._id}`)}>
                {n.locked ? <Icon name="lock" /> : n.emoji ? <span aria-hidden="true" className="w-4 text-center text-xs">{n.emoji}</span> : <Icon name="notes" className="text-stone-400 dark:text-stone-400" />}
                <span className="truncate">{n.locked ? 'Locked note' : n.title || 'Untitled'}</span>
              </Link>
            ))}
          </Group>
        )}

        <Group title="Folders" action={<button type="button" onClick={newFolder} className="grid h-7 w-7 place-items-center rounded-md text-stone-500 transition hover:bg-stone-200/60 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200" aria-label="New folder" data-tip="New folder" data-tip-align="end"><Icon name="plus" size="xs" /></button>}>
          {folders.length === 0 && <button type="button" onClick={newFolder} className={`${row(false)} text-faint`}><Icon name="folderPlus" />New folder</button>}
          {folders.map((f) => (
            <div key={f._id} className="group relative">
              <Link to={`/notes?folder=${f._id}`} className={row(onList && params.get('folder') === f._id)}>
                <Icon name="folder" /><span className="truncate pr-10">{f.name}</span>
                <span className="ml-auto text-xs text-faint group-focus-within:opacity-0 group-hover:opacity-0">{f.count || ''}</span>
              </Link>
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <button type="button" onClick={() => renameFolder(f)} className="grid h-7 w-7 place-items-center rounded-md text-stone-500 hover:bg-stone-200/70 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-100" aria-label={`Rename ${f.name}`} data-tip="Rename"><Icon name="edit" size="xs" /></button>
                <button type="button" onClick={() => deleteFolder(f)} className="grid h-7 w-7 place-items-center rounded-md text-stone-500 hover:bg-red-50 hover:text-red-700 dark:text-stone-400 dark:hover:bg-red-950/40 dark:hover:text-red-400" aria-label={`Delete ${f.name}`} data-tip="Delete folder" data-tip-align="end"><Icon name="trash" size="xs" /></button>
              </div>
            </div>
          ))}
        </Group>

        {tags.length > 0 && (
          <Group title="Tags">
            {tags.map((t) => (
              <Link key={t} to={`/notes?tag=${encodeURIComponent(t)}`} className={row(onList && params.get('tag') === t)}><Icon name="tag" /><span className="truncate">{t}</span></Link>
            ))}
          </Group>
        )}

        <div className="mt-6 border-t border-stone-200 pt-4 dark:border-stone-800">
          <NavLink to="/archive" className={({ isActive }) => row(isActive)}><Icon name="archive" />Archive</NavLink>
          <NavLink to="/trash" className={({ isActive }) => row(isActive)}><Icon name="trash" />Trash</NavLink>
          <NavLink to="/help" data-tour="help" className={({ isActive }) => row(isActive)}><Icon name="help" />Help &amp; shortcuts</NavLink>
        </div>
      </div>
    </nav>
  );
}

// Mobile bottom navigation (safe-area aware).
export function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const item = (active) => `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition ${active ? 'text-stone-900 dark:text-stone-100' : 'text-muted'}`;
  const search = () => {
    const focus = () => document.getElementById('search')?.focus();
    if (pathname === '/notes') focus(); else { navigate('/notes'); setTimeout(focus, 80); }
  };
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-stone-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-stone-800 dark:bg-stone-950/95 sm:hidden">
      <div className="flex">
        <Link to="/notes" className={item(pathname === '/notes')} aria-current={pathname === '/notes' ? 'page' : undefined}><Icon name="notes" size="md" />Notes</Link>
        <button type="button" onClick={search} className={item(false)}><Icon name="search" size="md" />Search</button>
        <Link to="/notes/new" data-tour="new" className={item(pathname === '/notes/new')}><span className="grid h-5 w-5 place-items-center rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"><Icon name="plus" size="xs" /></span>New</Link>
        <Link to="/settings" className={item(pathname === '/settings')} aria-current={pathname === '/settings' ? 'page' : undefined}><Icon name="settings" size="md" />Settings</Link>
      </div>
    </nav>
  );
}
