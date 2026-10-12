import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const Splash = () => <div className="grid min-h-screen place-items-center text-stone-400">Loading…</div>;

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />;
}

export function GuestRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  return user ? <Navigate to="/" replace /> : <Outlet />;
}
