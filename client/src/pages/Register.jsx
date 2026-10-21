import { preloadApp } from '../App.jsx';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthCard from '../components/AuthCard.jsx';
import PasswordField from '../components/PasswordField.jsx';
import Icon from '../components/Icon.jsx';
import { EMAIL_RE } from './Login.jsx';
import { passwordProblem, PASSWORD_HINT } from '../lib/passwordHints.js';

export default function Register() {
  useEffect(() => { const t = setTimeout(preloadApp, 1500); return () => clearTimeout(t); }, []);
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [serverPw, setServerPw] = useState(''); // the server's verdict on this exact password
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); if (k === 'password') setServerPw(''); };
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));
  const errors = {
    name: !form.name.trim() ? 'Tell us what to call you.' : '',
    email: !form.email.trim() ? 'Enter your email.' : !EMAIL_RE.test(form.email.trim()) ? 'That doesn’t look like an email address.' : '',
    password: passwordProblem(form.password, { email: form.email, name: form.name }) || serverPw,
  };
  const show = (k) => touched[k] && errors[k];

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true });
    if (errors.name || errors.email || errors.password) return;
    setError(''); setBusy(true);
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, sample: true });
      localStorage.setItem('noted.tourPending', '1');
      navigate('/notes', { replace: true });
    } catch (err) {
      if (err.data?.field === 'password') { setServerPw(err.message); setTouched((t) => ({ ...t, password: true })); document.getElementById('reg-password')?.focus(); }
      else setError(err.status === 409 ? 'An account with this email already exists. Log in instead?' : err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (k, label, props) => (
    <div>
      <label className="label" htmlFor={`reg-${k}`}>{label}</label>
      <input id={`reg-${k}`} className="input" value={form[k]} onChange={set(k)} onBlur={blur(k)}
        aria-invalid={Boolean(show(k))} aria-describedby={show(k) ? `reg-${k}-error` : undefined} {...props} />
      {show(k) && <p id={`reg-${k}-error`} role="alert" className="field-error">{errors[k]}</p>}
    </div>
  );

  return (
    <AuthCard title="Create your account" footer={<>Already have an account? <Link className="font-medium text-stone-900 underline underline-offset-2 dark:text-stone-100" to="/login">Log in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {field('name', 'Name', { autoComplete: 'name', autoFocus: true })}
        {field('email', 'Email', { type: 'email', autoComplete: 'email', inputMode: 'email' })}
        <PasswordField id="reg-password" label="Password" autoComplete="new-password" value={form.password} onChange={set('password')} onBlur={blur('password')}
          error={show('password')} hint={PASSWORD_HINT} />
        {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"><Icon name="alert" className="mt-0.5" />{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Creating your account…' : 'Create account'}</button>
      </form>
    </AuthCard>
  );
}
