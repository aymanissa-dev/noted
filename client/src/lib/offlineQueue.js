// Offline write queue for noted. Pure logic over a Storage-like object so it can be unit tested.
// Entries: { op: 'create', tempId, body, at } | { op: 'update', id, body, at }

export const QUEUE_KEY = 'noted.queue';
export const TEMP_PREFIX = 'local-';
export const isTempId = (id) => typeof id === 'string' && id.startsWith(TEMP_PREFIX);

export function createQueue(storage) {
  const read = () => {
    try { return JSON.parse(storage.getItem(QUEUE_KEY)) || []; } catch { return []; }
  };
  const write = (q) => (q.length ? storage.setItem(QUEUE_KEY, JSON.stringify(q)) : storage.removeItem(QUEUE_KEY));

  return {
    entries: read,
    size: () => read().length,
    clear: () => storage.removeItem(QUEUE_KEY),

    enqueueCreate(body) {
      const tempId = `${TEMP_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      write([...read(), { op: 'create', tempId, body, at: new Date().toISOString() }]);
      return tempId;
    },

    // Updates to an unsynced note merge into its create; repeated updates coalesce.
    enqueueUpdate(id, body) {
      const q = read();
      const at = new Date().toISOString();
      const create = q.find((e) => e.op === 'create' && e.tempId === id);
      if (create) { Object.assign(create.body, body); create.at = at; return write(q); }
      const existing = q.find((e) => e.op === 'update' && e.id === id);
      if (existing) { Object.assign(existing.body, body); existing.at = at; }
      else q.push({ op: 'update', id, body, at });
      write(q);
    },

    // Notes as the UI should see them: unsynced creates as full note objects.
    localNotes() {
      return read().filter((e) => e.op === 'create').map((e) => ({
        _id: e.tempId, title: '', content: '', tags: [], pinned: false, archived: false,
        deletedAt: null, color: '', emoji: '', ...e.body,
        createdAt: e.at, updatedAt: e.at, pending: true,
      }));
    },

    // Overlay queued edits onto server notes.
    applyPending(notes) {
      const updates = new Map(read().filter((e) => e.op === 'update').map((e) => [e.id, e]));
      return notes.map((n) => {
        const u = updates.get(n._id);
        return u ? { ...n, ...u.body, updatedAt: u.at, pending: true } : n;
      });
    },

    // Send queued writes in order. `send` performs one entry and returns the saved note.
    // Stops at the first network failure; drops entries the server rejects (4xx) so the queue can't jam.
    async flush(send, { onIdMapped } = {}) {
      let synced = 0;
      for (;;) {
        const [entry] = read();
        if (!entry) break;
        try {
          const saved = await send(entry);
          const q = read();
          q.shift();
          if (entry.op === 'create' && saved?._id) {
            for (const e of q) if (e.op === 'update' && e.id === entry.tempId) e.id = saved._id;
            onIdMapped?.(entry.tempId, saved._id);
          }
          write(q);
          synced++;
        } catch (err) {
          if (err?.status >= 400 && err.status < 500 && err.status !== 401) {
            const q = read(); q.shift(); write(q); // unrecoverable; skip it
            continue;
          }
          break; // offline or server error: retry later
        }
      }
      return synced;
    },
  };
}
