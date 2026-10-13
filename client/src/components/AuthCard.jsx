import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export default function AuthCard({ title, children, footer }) {
  return (
    <div className="relative grid min-h-screen place-items-center px-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link to="/" aria-label="noted. home"><Logo className="text-4xl" /></Link>
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Write it down. Find it later.</p>
        </div>
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 shadow-sm">
          <h1 className="mb-4 text-lg font-semibold">{title}</h1>
          {children}
        </div>
        <p className="mt-4 text-center text-sm text-stone-500 dark:text-stone-400">{footer}</p>
      </div>
    </div>
  );
}
