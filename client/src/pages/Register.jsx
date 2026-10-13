import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthCard from '../components/AuthCard.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    setBusy(true);
    try {
      await register(form);
      navigate('/notes', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Create your account" footer={<>Already have one? <Link className="font-medium text-stone-800 dark:text-stone-100 underline" to="/login">Log in</Link></>}>
      <form onSubmit={submit} className="space-y-3">
        <input className="input" placeholder="Name" autoComplete="name" required value={form.name} onChange={set('name')} />
        <input className="input" type="email" placeholder="Email" autoComplete="email" required value={form.email} onChange={set('email')} />
        <input className="input" type="password" placeholder="Password (min 8 characters)" autoComplete="new-password" required value={form.password} onChange={set('password')} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
    </AuthCard>
  );
}
