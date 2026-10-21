import { preloadApp } from '../App.jsx';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { takeFlash, useAuth } from '../context/AuthContext.jsx';
import AuthCard from '../components/AuthCard.jsx';
import PasswordField from '../components/PasswordField.jsx';
import Icon from '../components/Icon.jsx';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// After logging in you land on your notes, unless you followed a link to one specific note.
export function postLoginTarget(from) {
  const path = from?.pathname || '';
  return /^\/notes\/(?!new$)[A-Za-z0-9_-]+$/.test(path) ? path : '/notes';
}

export default function Login() {
  useEffect(() => { const t = setTimeout(preloadApp, 1500); return () => clearTimeout(t); }, []);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [flash] = useState(() => takeFlash());
  useEffect(() => { sessionStorage.removeItem('noted.loggedOut'); }, []);
  const [busy, setBusy] = useState(false);
  const errors = {
    email: !form.email.trim() ? 'Enter your email.' : !EMAIL_RE.test(form.email.trim()) ? 'That doesn’t look like an email address.' : '',
    password: !form.password ? 'Enter your password.' : '',
  };
  const show = (k) => touched[k] && errors[k];

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (errors.email || errors.password) return;
    setError(''); setBusy(true);
    try {
      await login({ email: form.email.trim(), password: form.password });
      navigate(postLoginTarget(location.state?.from), { replace: true });
    } catch (err) {
      // 429: too many failed attempts; the server's message says how long to wait.
      setError(err.status === 401 ? 'Wrong email or password. Check both and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Welcome back" footer={<>New to noted.? <Link className="font-medium text-stone-900 underline underline-offset-2 dark:text-stone-100" to="/register">Create an account</Link></>}>
      {flash && <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{flash}</p>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="login-email">Email</label>
          <input id="login-email" className="input" type="email" autoComplete="email" inputMode="email" autoFocus value={form.email}
            aria-invalid={Boolean(show('email'))} aria-describedby={show('email') ? 'login-email-error' : undefined}
            onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, email: true }))} />
          {show('email') && <p id="login-email-error" role="alert" className="field-error">{errors.email}</p>}
        </div>
        <PasswordField id="login-password" label="Password" autoComplete="current-password" value={form.password} error={show('password')}
          onChange={(e) => setForm({ ...form, password: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, password: true }))} />
        {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"><Icon name="alert" className="mt-0.5" />{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </AuthCard>
  );
}
