import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from './Logo.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/"><Logo /></Link>
            <nav className="flex gap-1 text-sm">
              {[['/', 'Notes'], ['/archive', 'Archive'], ['/trash', 'Trash']].map(([to, label]) => (
                <NavLink key={to} to={to} end
                  className={({ isActive }) => `rounded-md px-2.5 py-1 transition ${isActive ? 'bg-stone-200/70 text-stone-900' : 'text-stone-500 hover:text-stone-800'}`}>
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-stone-500 sm:inline">{user?.name}</span>
            <button className="btn-ghost" onClick={logout}>Log out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
