import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from './Logo.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import ShortcutsHelp from './ShortcutsHelp.jsx';
import { useState } from 'react';
import { useShortcuts } from '../lib/useShortcuts.js';

export default function Layout() {
  const { user, logout } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);
  useShortcuts({ helpOpen, setHelpOpen });
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 dark:border-stone-800 bg-stone-50/90 dark:bg-stone-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/"><Logo /></Link>
            <nav className="flex gap-1 text-sm">
              {[['/', 'Notes'], ['/archive', 'Archive'], ['/trash', 'Trash']].map(([to, label]) => (
                <NavLink key={to} to={to} end
                  className={({ isActive }) => `rounded-md px-2.5 py-1 transition ${isActive ? 'bg-stone-200/70 dark:bg-stone-800 text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'}`}>
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/settings" className="hidden text-stone-500 dark:text-stone-400 hover:underline sm:inline" title="Settings">{user?.name}</Link>
            <button className="btn-ghost px-2 font-mono" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
            <ThemeToggle />
            <Link to="/settings" className="btn-ghost sm:hidden">Settings</Link>
            <button className="btn-ghost" onClick={logout}>Log out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
