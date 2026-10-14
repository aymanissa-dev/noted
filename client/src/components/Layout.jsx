import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from './Logo.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import ShortcutsHelp from './ShortcutsHelp.jsx';
import { useShortcuts } from '../lib/useShortcuts.js';
import { useOnline } from '../lib/useOnline.js';
import { useTheme } from '../lib/theme.js';
import Sidebar, { BottomNav } from './Sidebar.jsx';
import Icon from './Icon.jsx';
import Menu from './Menu.jsx';

const NAV = [['/notes', 'Notes'], ['/archive', 'Archive'], ['/trash', 'Trash']];

const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '·';

// Account menu (≥ sm) and the small-screen menu share the same items.
function AccountItems({ onHelp, mobile }) {
  const { user, logout } = useAuth();
  const { theme, cycle } = useTheme();
  return (
    <>
      <div className="px-3 pb-2 pt-1.5">
        <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">{user?.name}</p>
        <p className="truncate text-xs text-muted">{user?.email}</p>
      </div>
      <div className="menu-sep" />
      {mobile && <>
        <Link role="menuitem" to="/archive" className="menu-item"><Icon name="archive" />Archive</Link>
        <Link role="menuitem" to="/trash" className="menu-item"><Icon name="trash" />Trash</Link>
      </>}
      <Link role="menuitem" to="/settings" className="menu-item"><Icon name="settings" />Settings</Link>
      <Link role="menuitem" to="/stats" className="menu-item"><Icon name="chart" />Storage stats</Link>
      <button role="menuitem" type="button" className="menu-item" onClick={onHelp}><Icon name="keyboard" />Keyboard shortcuts<kbd className="kbd ml-auto">?</kbd></button>
      {mobile && <button role="menuitem" type="button" className="menu-item" onClick={(e) => { e.stopPropagation(); cycle(); }}><Icon name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'monitor'} />Theme<span className="ml-auto text-xs capitalize text-muted">{theme}</span></button>}
      <div className="menu-sep" />
      <button role="menuitem" type="button" className="menu-item text-red-700 dark:text-red-400" onClick={() => logout()}><Icon name="logout" />Log out</button>
    </>
  );
}

export default function Layout() {
  const { user } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);
  useShortcuts({ helpOpen, setHelpOpen });
  const { online, pending } = useOnline();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 dark:border-stone-800 bg-stone-50/90 dark:bg-stone-950/90 backdrop-blur">
        <div className="mx-auto flex h-[var(--header-h)] max-w-7xl items-center justify-between gap-2 px-3 sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            <Link to="/notes" className="shrink-0"><Logo className="text-xl sm:text-2xl" /></Link>
            <nav aria-label="Main" className="hidden gap-1 text-sm sm:flex lg:hidden">
              {NAV.map(([to, label]) => (
                <NavLink key={to} to={to} end
                  className={({ isActive }) => `whitespace-nowrap rounded-md px-2 py-1 transition sm:px-2.5 ${isActive ? 'bg-stone-200/70 dark:bg-stone-800 text-stone-900 dark:text-stone-100' : 'text-muted hover:text-stone-800 dark:hover:text-stone-200'}`}>
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div className="hidden items-center gap-1 sm:flex">
              <button className="btn-ghost btn-icon" onClick={() => setHelpOpen(true)} data-tip="Keyboard shortcuts · ?" aria-label="Keyboard shortcuts"><Icon name="keyboard" /></button>
              <ThemeToggle />
            </div>
            <Menu label="Account" testId="account-menu" className="hidden sm:block" buttonClass="btn-ghost gap-2 pl-1.5 pr-2.5"
              button={<><span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200">{initials(user?.name)}</span><span className="max-w-[9rem] truncate">{user?.name}</span></>}>
              {() => <AccountItems onHelp={() => setHelpOpen(true)} />}
            </Menu>
            <Menu label="Menu" testId="mobile-menu" className="sm:hidden" button={<Icon name="menu" size="md" />}>
              {() => <AccountItems mobile onHelp={() => setHelpOpen(true)} />}
            </Menu>
          </div>
        </div>
      </header>
      {(!online || pending > 0) && (
        <div className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100" role="status" data-testid="sync-banner">
          <Icon name={online ? 'refresh' : 'offline'} size="xs" className={online ? 'motion-safe:animate-spin' : ''} />
          <span>
            {!online ? 'You’re offline. Your saved notes are here; changes sync when you’re back online.' : 'Back online. Syncing your changes…'}
            {pending > 0 && ` (${pending} pending)`}
          </span>
        </div>
      )}
      <div className="mx-auto flex max-w-7xl gap-6 px-3 sm:px-4 lg:px-6">
        <Sidebar />
        <main className="min-w-0 flex-1 py-6 pb-28 sm:pb-6">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
