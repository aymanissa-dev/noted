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
          <p className="mt-2 text-sm text-muted">Write it down. Find it later.</p>
        </div>
        <div className="surface p-6 shadow-sm sm:p-8">
          <h1 className="mb-5 text-xl font-semibold tracking-tight">{title}</h1>
          {children}
        </div>
        <p className="mt-5 text-center text-sm text-muted">{footer}</p>
      </div>
    </div>
  );
}
