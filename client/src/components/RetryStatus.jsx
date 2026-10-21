import Icon from './Icon.jsx';
import { isNetworkText } from '../lib/network.js';

// The one way a view says "that didn't load": a calm status line (no raw "Failed to fetch") and a
// Try again button. Connection problems read as such; real server errors keep their message.
export default function RetryStatus({ error, onRetry, testId, className = '' }) {
  if (!error) return null;
  const network = error === 'network' || error === 'offline' || isNetworkText(error);
  const text = !network ? error
    : (error === 'offline' || !navigator.onLine) ? 'You’re offline. This loads when you reconnect.'
    : 'Couldn’t reach noted. Trying again…';
  return (
    <div role="status" data-testid={testId} className={`flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm dark:border-stone-800 dark:bg-stone-900 ${className}`}>
      <span className={`inline-flex items-center gap-2 ${network ? 'text-muted' : 'text-red-700 dark:text-red-400'}`}><Icon name={network ? 'offline' : 'alert'} size="xs" />{text}</span>
      {onRetry && <button type="button" className="btn-secondary btn-sm shrink-0" onClick={onRetry}>Try again</button>}
    </div>
  );
}
