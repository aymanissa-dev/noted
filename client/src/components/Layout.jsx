import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from './Logo.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/"><Logo /></Link>
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
