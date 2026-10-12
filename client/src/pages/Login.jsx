import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthCard from '../components/AuthCard.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await login(form);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Welcome back" footer={<>No account? <Link className="font-medium text-stone-800 underline" to="/register">Create one</Link></>}>
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
