import { clearAllUndo } from '../editor/undoStore.js';
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

async function request(method, path, body, { headers: extra, signal } = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!navigator.onLine) throw Object.assign(new TypeError('You are offline'), { offline: true });
  const res = await fetch(BASE + path, {
    method,
    signal,
    cache: 'no-store',
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...extra,
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
    for (const n of notes) {
      if (n.locked) { cache[n._id] = { ...n, title: '', content: '', tags: [], redacted: true }; continue; }
      const prev = cache[n._id];
      // Never replace a full cached note with a list excerpt of the same version.
      if (n.excerpt && prev && !prev.excerpt && prev.updatedAt === n.updatedAt) continue;
      cache[n._id] = n;
    }
    const entries = Object.entries(cache).sort((a, b) => new Date(b[1].updatedAt) - new Date(a[1].updatedAt)).slice(0, CACHE_LIMIT);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* storage full: offline cache is best-effort */ }
}
const uncache = (id) => { const c = readCache(); delete c[id]; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); };
const viewOf = (n) => (n.deletedAt ? 'trash' : n.archived ? 'archive' : 'active');

const DAY = 24 * 60 * 60 * 1000;
const SMART_LOCAL = {
  pinned: (n) => n.pinned, untagged: (n) => !n.tags.length && !n.locked, locked: (n) => n.locked,
  today: (n) => Date.now() - new Date(n.updatedAt) < DAY, week: (n) => Date.now() - new Date(n.updatedAt) < 7 * DAY,
};
function filterLocal(notes, { search, tag, folder, smart, view = 'active' }) {
  const s = search?.toLowerCase();
  return notes
    .filter((n) => viewOf(n) === view)
    .filter((n) => !tag || n.tags.includes(tag))
    .filter((n) => !SMART_LOCAL[smart] || SMART_LOCAL[smart](n))
    .filter((n) => !folder || (folder === 'none' ? !n.folderId : n.folderId === folder))
    .filter((n) => !s || n.title.toLowerCase().includes(s) || n.content.toLowerCase().includes(s))
    .sort((a, b) => (view === 'trash'
      ? new Date(b.deletedAt) - new Date(a.deletedAt)
      : (b.pinned - a.pinned) || (new Date(b.updatedAt) - new Date(a.updatedAt))));
}

export function clearLocalData() {
  clearAllUndo();
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(USER_KEY);
  queue.clear();
}

const unlockHeaders = (t) => (t ? { headers: { 'X-Unlock-Token': t } } : {});

// ---- Optimistic moves (trash/archive) ----
// While a move request is in flight, list results reflect it so the note doesn't flash back.
const pendingMoves = new Map(); // id -> patch
function applyMoves(notes, view) {
  if (!pendingMoves.size) return notes;
  return notes.map((n) => (pendingMoves.has(n._id) ? { ...n, ...pendingMoves.get(n._id) } : n)).filter((n) => viewOf(n) === view);
}
async function withMove(id, patch, run) {
  pendingMoves.set(id, patch);
  try { return await run(); } finally { pendingMoves.delete(id); }
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
async function download(path, fallbackName, extraHeaders = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(BASE + path, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders } });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Download failed (${res.status})`);
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Last-chance save while the page unloads. keepalive lets the request outlive the page;
// offline or unsynced notes go to the (synchronous, persistent) offline queue instead.
export function saveOnUnload(id, body, unlockToken) {
  if (!id) return false;
  if (!unlockToken && (isTempId(id) || !navigator.onLine)) { queue.enqueueUpdate(id, body); return true; }
  if (!navigator.onLine) return false;
  const token = localStorage.getItem(TOKEN_KEY);
  try {
    fetch(`${BASE}/notes/${id}`, {
      method: 'PATCH', keepalive: true, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...(unlockToken && { 'X-Unlock-Token': unlockToken }) },
      body: JSON.stringify(body),
    }).catch(() => {});
    return true;
  } catch { return false; }
}

export const api = {
  register: (body) => request('POST', '/auth/register', body),
  login: (body) => request('POST', '/auth/login', body),
  me: () => request('GET', '/auth/me'),
  async changePassword(currentPassword, newPassword) {
    const r = await request('PATCH', '/auth/password', { currentPassword, newPassword });
    if (r?.token) localStorage.setItem(TOKEN_KEY, r.token); // other devices are signed out; keep this one
    return r;
  },
  async logoutAll() {
    const r = await request('POST', '/auth/logout-all');
    if (r?.token) localStorage.setItem(TOKEN_KEY, r.token);
    return r;
  },
  updatePreferences: (prefs) => request('PATCH', '/auth/preferences', prefs),
  deleteAccount: (password) => request('DELETE', '/auth/me', { password }),

  async recentNotes(signal) {
    try { const r = await request('GET', '/notes/recent', undefined, { signal }); cacheNotes(r.notes); return { notes: r.notes, offline: false }; }
    catch (err) { if (err?.name === 'AbortError' || !isNetworkError(err)) throw err; return { notes: [], offline: true }; }
  },

  async listNotes({ search, tag, folder, smart, view = 'active' } = {}, signal) {
    if (smart === 'recent') return this.recentNotes(signal);
    const q = new URLSearchParams();
    if (view !== 'active') q.set('view', view);
    if (search) q.set('search', search);
    if (tag) q.set('tag', tag);
    if (folder) q.set('folder', folder);
    if (smart) q.set('smart', smart);
    const qs = q.toString();
    let notes, offline = false;
    try {
      ({ notes } = await request('GET', `/notes${qs ? `?${qs}` : ''}`, undefined, { signal }));
      cacheNotes(notes, { replaceView: !search && !tag && !folder && !smart ? view : undefined });
    } catch (err) {
      if (err?.name === 'AbortError' || !isNetworkError(err)) throw err;
      offline = true;
      notes = filterLocal(Object.values(readCache()), { search, tag, folder, smart, view });
    }
    notes = applyMoves(queue.applyPending(notes), view);
    if (view === 'active') {
      const local = filterLocal(queue.localNotes(), { search, tag, folder, smart, view });
      notes = [...local, ...notes].sort((a, b) => (b.pinned - a.pinned) || (new Date(b.updatedAt) - new Date(a.updatedAt)));
    }
    return { notes, offline };
  },

  stats: () => request('GET', '/stats'),
  mergeNotes: async (ids, title) => { const r = await request('POST', '/notes/merge', { ids, title }); cacheNotes([r.note]); return r; },

  // ---- Folders ----
  folders: () => request('GET', '/folders'),
  createFolder: (name) => request('POST', '/folders', { name }),
  renameFolder: (id, name) => request('PATCH', `/folders/${id}`, { name }),
  deleteFolder: (id) => request('DELETE', `/folders/${id}`),
  moveToFolder: async (id, folderId) => { const r = await request('PATCH', `/notes/${id}/folder`, { folderId }); cacheNotes([r.note]); window.dispatchEvent(new Event('noted:folders-changed')); return r; },

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
  deleteNote: (id) => withMove(id, { deletedAt: new Date().toISOString() }, async () => { const r = await request('DELETE', `/notes/${id}`); cacheNotes([r.note]); return r; }), // moves to trash
  deleteForever: async (id) => { const r = await request('DELETE', `/notes/${id}?permanent=true`); uncache(id); return r; },
  toggleArchive: (id, archived) => withMove(id, archived === undefined ? {} : archived ? { archived: true, pinned: false } : { archived: false }, async () => { const r = await request('PATCH', `/notes/${id}/archive`); cacheNotes([r.note]); return r; }),
  restoreNote: async (id) => { const r = await request('POST', `/notes/${id}/restore`); cacheNotes([r.note]); return r; },
  async emptyTrash() {
    const r = await request('DELETE', '/notes/trash');
    // drop trashed notes from the offline cache too
    try { const c = readCache(); for (const [id, n] of Object.entries(c)) if (n.deletedAt) delete c[id]; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
    return r;
  },
  exportJson: (pin) => download('/notes/export?format=json', 'noted.json', pin ? { 'X-Lock-Pin': pin } : {}),
  exportMarkdown: (pin) => download('/notes/export?format=md', 'noted.zip', pin ? { 'X-Lock-Pin': pin } : {}),
  importNotes: (data) => request('POST', '/notes/import', data),
  listVersions: (id, { unlockToken } = {}) => request('GET', `/notes/${id}/versions`, undefined, unlockHeaders(unlockToken)),
  getVersion: (id, vid, { unlockToken } = {}) => request('GET', `/notes/${id}/versions/${vid}`, undefined, unlockHeaders(unlockToken)),
  restoreVersion: async (id, vid, { unlockToken } = {}) => {
    const r = await request('POST', `/notes/${id}/versions/${vid}/restore`, undefined, unlockHeaders(unlockToken));
    cacheNotes([r.note]); return r;
  },

  // ---- Lock PIN & locked notes (never queued offline, never cached with contents) ----
  setLockPin: (password, pin) => request('PUT', '/auth/lock-pin', { password, pin }),
  removeLockPin: (password) => request('DELETE', '/auth/lock-pin', { password }),
  unlockNote: (id, pin) => request('POST', `/notes/${id}/unlock`, { pin }),
  lockNote: async (id) => { const r = await request('PATCH', `/notes/${id}/lock`, { locked: true }); cacheNotes([r.note]); return r; },
  removeNoteLock: async (id, pin) => { const r = await request('PATCH', `/notes/${id}/lock`, { locked: false, pin }); cacheNotes([r.note]); return r; },
  updateLockedNote: async (id, body, unlockToken) => {
    const r = await request('PUT', `/notes/${id}`, body, unlockHeaders(unlockToken));
    cacheNotes([r.note]); return r;
  },
};
