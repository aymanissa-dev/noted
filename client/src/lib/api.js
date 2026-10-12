import { createQueue, isTempId } from './offlineQueue.js';

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export const TOKEN_KEY = 'noted.token';
export const USER_KEY = 'noted.user';
const CACHE_KEY = 'noted.cache';
const CACHE_LIMIT = 1000;

export const queue = createQueue(localStorage);

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
// fetch rejects with a TypeError when the network is unavailable.
export const isNetworkError = (err) => err instanceof TypeError || err?.offline === true;

async function request(method, path, body) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!navigator.onLine) throw Object.assign(new TypeError('You are offline'), { offline: true });
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

// ---- Local read cache (for offline reading). Cleared on logout. ----
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; } };
function cacheNotes(notes, { replaceView } = {}) {
  try {
    let cache = readCache();
    if (replaceView) { // drop stale notes of a fully-fetched view
      cache = Object.fromEntries(Object.entries(cache).filter(([, n]) => viewOf(n) !== replaceView));
    }
    for (const n of notes) cache[n._id] = n;
    const entries = Object.entries(cache).sort((a, b) => new Date(b[1].updatedAt) - new Date(a[1].updatedAt)).slice(0, CACHE_LIMIT);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* storage full: offline cache is best-effort */ }
}
const uncache = (id) => { const c = readCache(); delete c[id]; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); };
const viewOf = (n) => (n.deletedAt ? 'trash' : n.archived ? 'archive' : 'active');

function filterLocal(notes, { search, tag, view = 'active' }) {
  const s = search?.toLowerCase();
  return notes
    .filter((n) => viewOf(n) === view)
    .filter((n) => !tag || n.tags.includes(tag))
    .filter((n) => !s || n.title.toLowerCase().includes(s) || n.content.toLowerCase().includes(s))
    .sort((a, b) => (view === 'trash'
      ? new Date(b.deletedAt) - new Date(a.deletedAt)
      : (b.pinned - a.pinned) || (new Date(b.updatedAt) - new Date(a.updatedAt))));
}

export function clearLocalData() {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(USER_KEY);
  queue.clear();
}

// ---- Sync ----
const sendEntry = async (e) => {
  if (e.op === 'create') return (await request('POST', '/notes', e.body)).note;
  return (await request('PATCH', `/notes/${e.id}`, e.body)).note;
};
let syncing = null;
export function syncQueue() {
  if (syncing || !queue.size() || !navigator.onLine || !localStorage.getItem(TOKEN_KEY)) return syncing || Promise.resolve(0);
  syncing = queue.flush(sendEntry, {
    onIdMapped: (tempId, realId) => window.dispatchEvent(new CustomEvent('noted:id-mapped', { detail: { tempId, realId } })),
  }).finally(() => {
    syncing = null;
    window.dispatchEvent(new Event('noted:queue-changed'));
  });
  return syncing;
}
const queued = () => window.dispatchEvent(new Event('noted:queue-changed'));

// Downloads a file from an authenticated endpoint.
async function download(path, fallbackName) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Download failed (${res.status})`);
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  register: (body) => request('POST', '/auth/register', body),
  login: (body) => request('POST', '/auth/login', body),
  me: () => request('GET', '/auth/me'),
  changePassword: (currentPassword, newPassword) => request('PATCH', '/auth/password', { currentPassword, newPassword }),
  deleteAccount: (password) => request('DELETE', '/auth/me', { password }),

  async listNotes({ search, tag, view = 'active' } = {}) {
    const q = new URLSearchParams();
    if (view !== 'active') q.set('view', view);
    if (search) q.set('search', search);
    if (tag) q.set('tag', tag);
    const qs = q.toString();
    let notes, offline = false;
    try {
      ({ notes } = await request('GET', `/notes${qs ? `?${qs}` : ''}`));
      cacheNotes(notes, { replaceView: !search && !tag ? view : undefined });
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      offline = true;
      notes = filterLocal(Object.values(readCache()), { search, tag, view });
    }
    notes = queue.applyPending(notes);
    if (view === 'active') {
      const local = filterLocal(queue.localNotes(), { search, tag, view });
      notes = [...local, ...notes].sort((a, b) => (b.pinned - a.pinned) || (new Date(b.updatedAt) - new Date(a.updatedAt)));
    }
    return { notes, offline };
  },

  async tags() {
    try { return await request('GET', '/notes/tags'); } catch (err) {
      if (!isNetworkError(err)) throw err;
      const all = Object.values(readCache()).filter((n) => viewOf(n) === 'active').flatMap((n) => n.tags);
      return { tags: [...new Set(all)].sort() };
    }
  },

  async getNote(id) {
    if (isTempId(id)) {
      const note = queue.localNotes().find((n) => n._id === id);
      if (!note) throw new ApiError('Note not found', 404);
      return { note };
    }
    try {
      const { note } = await request('GET', `/notes/${id}`);
      cacheNotes([note]);
      return { note: queue.applyPending([note])[0] };
    } catch (err) {
      const cached = readCache()[id];
      if (!isNetworkError(err) || !cached) throw err;
      return { note: queue.applyPending([cached])[0] };
    }
  },

  async createNote(body) {
    try {
      const res = await request('POST', '/notes', body);
      cacheNotes([res.note]);
      return res;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const tempId = queue.enqueueCreate(body); queued();
      return { note: queue.localNotes().find((n) => n._id === tempId), queued: true };
    }
  },

  async updateNote(id, body) {
    if (!isTempId(id) && !queue.entries().some((e) => e.id === id)) {
      try {
        const res = await request('PUT', `/notes/${id}`, body);
        cacheNotes([res.note]);
        return res;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
      }
    }
    queue.enqueueUpdate(id, body); queued();
    if (navigator.onLine) syncQueue();
    const local = isTempId(id) ? queue.localNotes().find((n) => n._id === id) : { ...readCache()[id], ...body, _id: id };
    return { note: { ...local, updatedAt: new Date().toISOString(), pending: true }, queued: true };
  },

  togglePin: async (id) => { const r = await request('PATCH', `/notes/${id}/pin`); cacheNotes([r.note]); return r; },
  deleteNote: async (id) => { const r = await request('DELETE', `/notes/${id}`); cacheNotes([r.note]); return r; }, // moves to trash
  deleteForever: async (id) => { const r = await request('DELETE', `/notes/${id}?permanent=true`); uncache(id); return r; },
  toggleArchive: async (id) => { const r = await request('PATCH', `/notes/${id}/archive`); cacheNotes([r.note]); return r; },
  restoreNote: async (id) => { const r = await request('POST', `/notes/${id}/restore`); cacheNotes([r.note]); return r; },
  emptyTrash: () => request('DELETE', '/notes/trash'),
  exportJson: () => download('/notes/export?format=json', 'noted.json'),
  exportMarkdown: () => download('/notes/export?format=md', 'noted.zip'),
  importNotes: (data) => request('POST', '/notes/import', data),
};
