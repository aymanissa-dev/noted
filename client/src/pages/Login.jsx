import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { takeFlash, useAuth } from '../context/AuthContext.jsx';
import AuthCard from '../components/AuthCard.jsx';

// After logging in you land on your notes, unless you followed a link to one specific note.
export function postLoginTarget(from) {
  const path = from?.pathname || '';
  return /^\/notes\/(?!new$)[A-Za-z0-9_-]+$/.test(path) ? path : '/notes';
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [flash] = useState(() => takeFlash());
  // The logout→login redirect has happened; later deep links should return to their page again.
  useEffect(() => { sessionStorage.removeItem('noted.loggedOut'); }, []);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await login(form);
      navigate(postLoginTarget(location.state?.from), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Welcome back" footer={<>No account? <Link className="font-medium text-stone-800 dark:text-stone-100 underline" to="/register">Create one</Link></>}>
      {flash && <p role="status" className="mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">{flash}</p>}
      <form onSubmit={submit} className="space-y-3">
        <input className="input" type="email" placeholder="Email" autoComplete="email" required
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" type="password" placeholder="Password" autoComplete="current-password" required
          value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
      </form>
    </AuthCard>
  );
}
