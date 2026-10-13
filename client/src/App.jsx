import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, GuestRoute } from './components/RouteGuards.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NoteEditor from './pages/NoteEditor.jsx';
import Settings from './pages/Settings.jsx';
import Landing from './pages/Landing.jsx';
import { useAuth } from './context/AuthContext.jsx';

// Public landing page for visitors; signed-in users go straight to their notes.
function Home() {
  const { user, loading } = useAuth();
  if (user) return <Navigate to="/notes" replace />;
  if (loading && localStorage.getItem('noted.token')) return null;
  return <Landing />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
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
          <Route path="/notes/new" element={<NoteEditor />} />
          <Route path="/notes/:id" element={<NoteEditor />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
