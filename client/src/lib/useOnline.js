import { useEffect, useState } from 'react';
import { queue, syncQueue } from './api.js';

// Tracks connectivity and pending offline writes; syncs automatically on reconnect.
export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(queue.size());

  useEffect(() => {
    const refresh = () => setPending(queue.size());
    const goOnline = () => { setOnline(true); syncQueue(); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('noted:queue-changed', refresh);
    window.addEventListener('storage', refresh);
    syncQueue();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('noted:queue-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return { online, pending };
}
