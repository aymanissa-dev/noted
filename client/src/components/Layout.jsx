import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from './Logo.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import ShortcutsHelp from './ShortcutsHelp.jsx';
import { useShortcuts } from '../lib/useShortcuts.js';
import { useOnline } from '../lib/useOnline.js';
import { useTheme } from '../lib/theme.js';

const NAV = [['/notes', 'Notes'], ['/archive', 'Archive'], ['/trash', 'Trash']];

// Small-screen menu: settings, shortcuts, theme, log out.
function MobileMenu({ onHelp }) {
  const { user, logout } = useAuth();
  const { theme, cycle } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const item = 'block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800';
  return (
    <div className="relative sm:hidden" ref={ref}>
      <button className="btn-ghost px-2" aria-label="Menu" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-1.5 shadow-lg">
          <p className="truncate px-3 py-1.5 text-xs text-stone-400">{user?.email}</p>
          <Link role="menuitem" to="/settings" className={item}>Settings</Link>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); onHelp(); }}>Keyboard shortcuts</button>
          <button role="menuitem" className={item} onClick={cycle}>Theme: <span className="capitalize">{theme}</span></button>
          <button role="menuitem" className={`${item} text-red-600`} onClick={logout}>Log out</button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);
  useShortcuts({ helpOpen, setHelpOpen });
  const { online, pending } = useOnline();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 dark:border-stone-800 bg-stone-50/90 dark:bg-stone-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            <Link to="/notes" className="shrink-0"><Logo className="text-xl sm:text-2xl" /></Link>
            <nav className="flex gap-0.5 text-sm sm:gap-1">
              {NAV.map(([to, label]) => (
                <NavLink key={to} to={to} end
                  className={({ isActive }) => `whitespace-nowrap rounded-md px-2 py-1 transition sm:px-2.5 ${isActive ? 'bg-stone-200/70 dark:bg-stone-800 text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'}`}>
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="hidden shrink-0 items-center gap-2 text-sm sm:flex">
            <Link to="/settings" className="max-w-[10rem] truncate text-stone-500 dark:text-stone-400 hover:underline" title="Settings">{user?.name}</Link>
            <button className="btn-ghost px-2 font-mono" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
            <ThemeToggle />
            <button className="btn-ghost whitespace-nowrap" onClick={logout}>Log out</button>
          </div>
          <MobileMenu onHelp={() => setHelpOpen(true)} />
        </div>
      </header>
      {(!online || pending > 0) && (
        <div className="border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-4 py-1.5 text-center text-xs text-amber-800 dark:text-amber-200" role="status">
          {!online ? 'You’re offline. Showing saved notes; new notes and edits will sync when you reconnect.' : 'Syncing offline changes…'}
          {pending > 0 && ` (${pending} pending)`}
        </div>
      )}
      <main className="mx-auto max-w-5xl px-3 py-6 sm:px-4">
        <Outlet />
      </main>
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
