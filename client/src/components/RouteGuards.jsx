import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { AppSkeleton } from './Skeleton.jsx';

const Splash = AppSkeleton;

export function ProtectedRoute() {
  const { user, loading, returnable } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (user) return <Outlet />;
  // First visit / expired session: come back here after login. Deliberate logout: no stale return page.
  const fresh = !sessionStorage.getItem('noted.loggedOut');
  return <Navigate to="/login" replace state={returnable || fresh ? { from: location } : undefined} />;
}

export function GuestRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  return user ? <Navigate to="/notes" replace /> : <Outlet />;
}
