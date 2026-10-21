import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from './Logo.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import ShortcutsHelp from './ShortcutsHelp.jsx';
import CommandPalette from './CommandPalette.jsx';
import Tour, { TOUR_PENDING } from './Tour.jsx';
import Kbd from './Kbd.jsx';
import { useShortcuts } from '../lib/useShortcuts.js';
import { useOnline } from '../lib/useOnline.js';
import { useToast } from '../context/ToastContext.jsx';
import { useTheme } from '../lib/theme.js';
import Sidebar, { BottomNav } from './Sidebar.jsx';
import Icon from './Icon.jsx';
import Menu from './Menu.jsx';

const NAV = [['/notes', 'Notes'], ['/archive', 'Archive'], ['/trash', 'Trash']];

const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '·';

// Account menu (≥ sm) and the small-screen menu share the same items.
function AccountItems({ open, mobile }) {
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
      <Link role="menuitem" to="/settings" className="menu-item"><Icon name="settings" />Settings{!mobile && <Kbd combo="G S" size="sm" className="ml-auto" />}</Link>
      <Link role="menuitem" to="/stats" className="menu-item"><Icon name="chart" />Storage stats</Link>
      <div className="menu-sep" />
      <Link role="menuitem" to="/help" className="menu-item"><Icon name="help" />How to use noted.{!mobile && <Kbd combo="G H" size="sm" className="ml-auto" />}</Link>
      {!mobile && <button role="menuitem" type="button" className="menu-item" onClick={() => open('shortcuts')}><Icon name="keyboard" />Keyboard shortcuts<Kbd combo="?" size="sm" className="ml-auto" /></button>}
      {mobile && <button role="menuitem" type="button" className="menu-item" onClick={(e) => { e.stopPropagation(); cycle(); }}><Icon name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'monitor'} />Theme<span className="ml-auto text-xs capitalize text-muted">{theme}</span></button>}
      <div className="menu-sep" />
      <button role="menuitem" type="button" className="menu-item text-red-700 dark:text-red-400" onClick={() => logout()}><Icon name="logout" />Log out</button>
    </>
  );
}

export default function Layout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  useShortcuts({ helpOpen, setHelpOpen, paletteOpen, setPaletteOpen });
  const { online, pending } = useOnline();

  const navigate = useNavigate();
  const open = (what) => {
    setHelpOpen(what === 'shortcuts'); setPaletteOpen(what === 'palette');
    if (what !== 'tour') return;
    // The tour points at things on the notes list: go there first, then start once its first target is on screen.
    if (window.location.pathname !== '/notes' || window.location.search) navigate('/notes');
    const started = Date.now();
    const wait = () => {
      const ready = [...document.querySelectorAll('[data-tour="new"]')].some((el) => el.getClientRects().length);
      if (ready || Date.now() - started > 2500) setTourOpen(true); else setTimeout(wait, 50);
    };
    setTimeout(wait, 50);
  };
  // A new build is ready while a note is open: offer it now (it also applies once you leave the note).
  const toast = useToast();
  useEffect(() => {
    const ready = (e) => toast.show('A new version of noted. is ready.', { action: { label: 'Reload', onClick: () => e.detail?.apply?.() } });
    window.addEventListener('noted:update-ready', ready);
    return () => window.removeEventListener('noted:update-ready', ready);
  }, [toast]);

  useEffect(() => {
    const onOpen = (e) => open(e.detail);
    window.addEventListener('noted:open', onOpen);
    return () => window.removeEventListener('noted:open', onOpen);
  }, []);
  // First run (web sign-up): a short tour once the list has rendered.
  useEffect(() => {
    if (pathname !== '/notes' || localStorage.getItem(TOUR_PENDING) !== '1') return;
    const t = setTimeout(() => setTourOpen(true), 700);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <div className="app min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200/70 bg-stone-50/80 backdrop-blur-md dark:border-stone-800/70 dark:bg-stone-950/80">
        <div className="flex h-[var(--header-h)] w-full items-center justify-between gap-2 px-3 sm:px-4 lg:px-6 2xl:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            <Link to="/notes" className="shrink-0" aria-label="noted. – all notes"><Logo className="text-xl sm:text-[1.4rem]" /></Link>
            <nav aria-label="Main" className="hidden gap-1 text-sm sm:flex lg:hidden">
              {NAV.map(([to, label]) => (
                <NavLink key={to} to={to} end
                  className={({ isActive }) => `whitespace-nowrap rounded-full px-3 py-1 transition ${isActive ? 'bg-stone-200/70 dark:bg-stone-800 text-stone-900 dark:text-stone-100' : 'text-muted hover:text-stone-800 dark:hover:text-stone-200'}`}>
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => open('palette')} data-testid="palette-button" data-tour="palette" aria-label="Search and commands"
              className="hidden h-9 items-center gap-2 rounded-full border border-stone-200 bg-white pl-3 pr-1.5 text-sm text-stone-500 shadow-soft transition hover:border-stone-300 hover:text-stone-800 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400 dark:hover:border-stone-700 dark:hover:text-stone-200 sm:inline-flex md:w-60 lg:w-72">
              <Icon name="search" size="sm" /><span className="hidden md:inline">Search or jump to…</span><Kbd combo="Mod+K" size="sm" className="ml-auto" />
            </button>
            <div className="hidden sm:block"><ThemeToggle /></div>
            <Menu label="Account" testId="account-menu" tour="help" className="hidden sm:block" buttonClass="btn-ghost gap-2 pl-1.5 pr-2.5"
              button={<><span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-stone-200 to-stone-300 text-xs font-semibold text-stone-700 dark:from-stone-700 dark:to-stone-800 dark:text-stone-200">{initials(user?.name)}</span><span className="max-w-[9rem] truncate">{user?.name}</span></>}>
              {() => <AccountItems open={open} />}
            </Menu>
            <Menu label="Menu" testId="mobile-menu" tour="palette" className="sm:hidden" button={<Icon name="menu" size="md" />}>
              {() => <AccountItems mobile open={open} />}
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
      <div className="flex w-full gap-6 px-3 sm:px-4 lg:px-6 2xl:gap-8 2xl:px-8">
        <Sidebar onOpen={open} />
        <main className="min-w-0 flex-1 py-6 pb-28 sm:py-8 sm:pb-8">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onShortcuts={() => open('shortcuts')} onTour={() => open('tour')} />}
      {tourOpen && <Tour onClose={() => setTourOpen(false)} />}
    </div>
  );
}
