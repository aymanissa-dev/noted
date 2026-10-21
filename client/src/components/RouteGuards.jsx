import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { AppSkeleton } from './Skeleton.jsx';
import { postLoginTarget } from '../pages/Login.jsx';

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
  const location = useLocation();
  if (loading) return <Splash />;
  // Signing in on this page also re-renders this guard: send you to the same place the login form
  // does (the page you came from), or the two redirects race (react-router 7 runs them in a transition).
  return user ? <Navigate to={postLoginTarget(location.state?.from)} replace /> : <Outlet />;
}
