import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import Icon from './Icon.jsx';

// Shared frame for log in / sign up, in the landing page's language (soft grid, glow, big type).
export default function AuthCard({ title, children, footer }) {
  return (
    <div className="landing relative min-h-screen overflow-hidden">
      <div aria-hidden="true" className="hero-bg pointer-events-none absolute inset-0" />
      <header className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="btn-ghost -ml-3 gap-1.5 text-sm"><Icon name="back" size="sm" />Home</Link>
        <ThemeToggle />
      </header>
      <main className="relative grid place-items-center px-4 pb-16 pt-4 sm:pt-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Link to="/" aria-label="noted. home"><Logo className="text-4xl" /></Link>
            <p className="eyebrow mt-3">Write it down. Find it later.</p>
          </div>
          <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-6 shadow-lift backdrop-blur dark:border-stone-800 dark:bg-stone-900/90 sm:p-8">
            <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
            {children}
          </div>
          <p className="mt-6 text-center text-sm text-muted">{footer}</p>
        </div>
      </main>
    </div>
  );
}
