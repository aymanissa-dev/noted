import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

// The signed-in app is split from the landing/auth pages so first-time visitors download less.
// Signed-in users start fetching it immediately.
const loadApp = () => import('./components/Layout.jsx');
const loadDashboard = () => import('./pages/Dashboard.jsx');
const loadNote = () => import('./pages/NoteRoute.jsx');
if (typeof localStorage !== 'undefined' && localStorage.getItem('noted.token')) { loadApp(); loadDashboard(); loadNote(); }
const Layout = lazy(loadApp);
const Dashboard = lazy(loadDashboard);
const NoteRoute = lazy(loadNote);
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Stats = lazy(() => import('./pages/Stats.jsx'));
const Help = lazy(() => import('./pages/Help.jsx'));
const Changelog = lazy(() => import('./pages/Changelog.jsx'));
export const preloadApp = () => { loadApp(); loadDashboard(); };
import { ProtectedRoute, GuestRoute } from './components/RouteGuards.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Landing from './pages/Landing.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useHead } from './lib/useHead.js';

// Public landing page for visitors; signed-in users go straight to their notes.
function Home() {
  const { user, loading } = useAuth();
  if (user) return <Navigate to="/notes" replace />;
  if (loading && localStorage.getItem('noted.token')) return null;
  return <Landing />;
}

export default function App() {
  useHead();
  return (
    <Suspense fallback={null}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/changelog" element={<Changelog />} />
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/notes" element={<Dashboard view="active" />} />
          <Route path="/archive" element={<Dashboard view="archive" key="archive" />} />
          <Route path="/trash" element={<Dashboard view="trash" key="trash" />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/help" element={<Help />} />
          <Route path="/notes/new" element={<NoteRoute />} />
          <Route path="/notes/:id" element={<NoteRoute />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
