import { useEffect, useState } from 'react';
import { queue, syncQueue } from './api.js';

// Tracks connectivity and pending offline writes; syncs automatically on reconnect.
export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(queue.size());

  useEffect(() => {
    const refresh = () => setPending(queue.size());
    // The 'online' event can fire before requests actually go through, so retry shortly after too.
    const retries = [];
    const goOnline = () => {
      setOnline(true); syncQueue();
      for (const ms of [1500, 4000]) retries.push(setTimeout(() => syncQueue(), ms));
    };
    // ...and keep trying while anything is pending (flaky networks, server hiccups).
    const timer = setInterval(() => { if (queue.size() && navigator.onLine) syncQueue(); }, 5000);
    const onVisible = () => { if (document.visibilityState === 'visible') syncQueue(); };
    document.addEventListener('visibilitychange', onVisible);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('noted:queue-changed', refresh);
    window.addEventListener('storage', refresh);
    syncQueue();
    return () => {
      clearInterval(timer); retries.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('noted:queue-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return { online, pending };
}
