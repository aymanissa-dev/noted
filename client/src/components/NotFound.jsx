import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';

// Full-page "nothing here" for unknown paths and dead share links.
export default function NotFound({ title = 'Page not found', body = 'There’s nothing at this address. It may have moved, or the link may be mistyped.' }) {
  return (
    <main data-testid="not-found" className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <Link to="/" aria-label="Noted home" className="mb-10 rounded-md focus-visible:outline-offset-4"><Logo className="text-3xl" /></Link>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-faint">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">{body}</p>
      <Link to="/" className="btn-primary mt-8">Go to Noted</Link>
    </main>
  );
}
