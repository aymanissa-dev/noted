import { useEffect, useState } from 'react';
import { RECONNECTED, useIsOnline } from './network.js';
import { queue, syncQueue } from './api.js';

// Tracks connectivity and pending offline writes; syncs automatically on reconnect.
export function useOnline() {
  const online = useIsOnline();
  const [pending, setPending] = useState(queue.size());

  useEffect(() => {
    const refresh = () => setPending(queue.size());
    // Sync once the connection is confirmed (see network.js), and shortly after too.
    const retries = [];
    const goOnline = () => {
      syncQueue();
      for (const ms of [1500, 4000]) retries.push(setTimeout(() => syncQueue(), ms));
    };
    // ...and keep trying while anything is pending (flaky networks, server hiccups).
    const timer = setInterval(() => { if (queue.size() && navigator.onLine) syncQueue(); }, 5000);
    const onVisible = () => { if (document.visibilityState === 'visible') syncQueue(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(RECONNECTED, goOnline);
    window.addEventListener('noted:queue-changed', refresh);
    window.addEventListener('storage', refresh);
    syncQueue();
    return () => {
      clearInterval(timer); retries.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(RECONNECTED, goOnline);
      window.removeEventListener('noted:queue-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return { online, pending };
}
