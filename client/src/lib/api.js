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
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}
// fetch rejects with a TypeError when the network is unavailable.
export const isNetworkError = (err) => err instanceof TypeError || err?.offline === true;

// While the session token is being rotated (sign out everywhere, password change), requests that
// raced it can get a 401 with the old token: wait for the new one and retry instead of logging out.
let rotating = null;
const rotate = (run) => { const p = run(); rotating = p.finally(() => { if (rotating === p) rotating = null; }); return p; };

async function request(method, path, body, { headers: extra, signal, retried } = {}) {
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
    if (res.status === 401 && token) {
      if (rotating) await rotating.catch(() => {});
      if (!retried && localStorage.getItem(TOKEN_KEY) && localStorage.getItem(TOKEN_KEY) !== token) {
        return request(method, path, body, { headers: extra, signal, retried: true });
      }
      onUnauthorized();
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

// Identical GETs that overlap share one request (the sidebar and the list both ask for folders/tags).
const inflightGets = new Map();
// Once notes or folders change, a GET that started earlier may carry stale data: don't share it.
if (typeof window !== 'undefined') ['noted:notes-changed', 'noted:folders-changed'].forEach((ev) => window.addEventListener(ev, () => inflightGets.clear()));
function getShared(path) {
  if (inflightGets.has(path)) return inflightGets.get(path);
  const p = request('GET', path).finally(() => { if (inflightGets.get(path) === p) inflightGets.delete(path); });
  inflightGets.set(path, p);
  return p;
}
// Small persisted copies of side data (folders, tags) so the sidebar renders instantly; refreshed on every fetch.
const META_KEY = 'noted.meta';
export const readMeta = (k) => { try { return JSON.parse(localStorage.getItem(META_KEY))?.[k]; } catch { return undefined; } };
const writeMeta = (k, v) => { try { const m = JSON.parse(localStorage.getItem(META_KEY)) || {}; m[k] = v; localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* best-effort */ } };

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

const prefetched = new Set();
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
  localStorage.removeItem(META_KEY);
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

// ---- Optimistic inserts (Undo after delete/archive) ----
// The note shows up in the list at once; list results include it until the server confirms.
const pendingInserts = new Map(); // id -> note
export function optimisticInsert(note, promise) {
  pendingInserts.set(note._id, note);
  window.dispatchEvent(new CustomEvent('noted:note-inserted', { detail: note }));
  return promise.finally(() => {
    if (pendingInserts.get(note._id) === note) pendingInserts.delete(note._id);
    window.dispatchEvent(new Event('noted:notes-changed'));
  });
}
export const matchesList = (n, filters) => filterLocal([n], filters).length > 0;

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
// Tells lists, the sidebar (recent, tags, folder counts) and stats that notes changed elsewhere.
const changed = (r) => { window.dispatchEvent(new Event('noted:notes-changed')); return r; };

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

// ---- Voice notes (never queued offline; fetched with auth, played from a blob URL) ----
async function rawFetch(method, path, { body, headers = {} } = {}) {
  if (!navigator.onLine) throw Object.assign(new TypeError('You are offline'), { offline: true });
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(BASE + path, { method, body, cache: 'no-store', headers: { ...(token && { Authorization: `Bearer ${token}` }), ...headers } });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(data?.error || (res.status === 413 ? 'That recording is too large (max 4 MB).' : `Request failed (${res.status})`), res.status);
  }
  return res;
}
export const audioApi = {
  list: (id, unlockToken) => request('GET', `/notes/${id}/audio`, undefined, unlockHeaders(unlockToken)),
  upload: async (id, blob, duration, unlockToken) => (await rawFetch('POST', `/notes/${id}/audio`, {
    body: blob, headers: { 'Content-Type': blob.type || 'audio/webm', 'X-Audio-Duration': String(Math.round(duration)), ...(unlockToken && { 'X-Unlock-Token': unlockToken }) },
  })).json(),
  blobUrl: async (clipId, unlockToken) => URL.createObjectURL(await (await rawFetch('GET', `/audio/${clipId}`, { headers: unlockToken ? { 'X-Unlock-Token': unlockToken } : {} })).blob()),
  remove: (clipId, unlockToken) => rawFetch('DELETE', `/audio/${clipId}`, { headers: unlockToken ? { 'X-Unlock-Token': unlockToken } : {} }),
};

export const api = {
  register: (body) => request('POST', '/auth/register', body),
  login: (body) => request('POST', '/auth/login', body),
  me: () => request('GET', '/auth/me'),
  changePassword: (currentPassword, newPassword) => rotate(async () => {
    const r = await request('PATCH', '/auth/password', { currentPassword, newPassword });
    if (r?.token) localStorage.setItem(TOKEN_KEY, r.token); // other devices are signed out; keep this one
    return r;
  }),
  logoutAll: () => rotate(async () => {
    const r = await request('POST', '/auth/logout-all');
    if (r?.token) localStorage.setItem(TOKEN_KEY, r.token);
    return r;
  }),
  updatePreferences: (prefs) => request('PATCH', '/auth/preferences', prefs),
  deleteAccount: (password) => request('DELETE', '/auth/me', { password }),

  // Instant first paint: the list as the local cache has it (stale-while-revalidate; the caller then fetches).
  cachedList({ search, tag, folder, smart, view = 'active' } = {}) {
    if (smart === 'recent') return null;
    const all = Object.values(readCache());
    if (!all.length) return null;
    let notes = applyMoves(queue.applyPending(filterLocal(all, { search, tag, folder, smart, view })), view);
    if (view === 'active') notes = [...filterLocal(queue.localNotes(), { search, tag, folder, smart, view }), ...notes];
    return notes;
  },
  // Fetch a note ahead of opening it (hover / touchstart), so the editor opens from cache.
  prefetchNote(id) {
    if (!id || isTempId(id) || prefetched.has(id) || !navigator.onLine) return;
    const c = readCache()[id];
    if (c && !c.excerpt && !c.redacted) return; // full copy already here
    prefetched.add(id);
    getShared(`/notes/${id}?prefetch=1`).then(({ note }) => cacheNotes([note])).catch(() => {}).finally(() => setTimeout(() => prefetched.delete(id), 30000));
  },
  // A full (non-excerpt, non-locked) cached copy, for opening a note instantly.
  cachedNote(id) {
    const c = readCache()[id];
    if (!c || c.excerpt || c.redacted || c.locked) return null;
    return queue.applyPending([c])[0];
  },

  async recentNotes(signal) {
    try { const r = await (signal ? request('GET', '/notes/recent', undefined, { signal }) : getShared('/notes/recent')); cacheNotes(r.notes); writeMeta('recent', r.notes.slice(0, 10).map((n) => ({ _id: n._id, title: n.locked ? '' : n.title, emoji: n.locked ? '' : n.emoji, locked: n.locked }))); return { notes: r.notes, offline: false }; }
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
    if (pendingInserts.size) {
      const extra = filterLocal([...pendingInserts.values()].filter((p) => !notes.some((n) => n._id === p._id)), { search, tag, folder, smart, view });
      if (extra.length) notes = [...extra, ...notes];
    }
    if (view === 'active') {
      const local = filterLocal(queue.localNotes(), { search, tag, folder, smart, view });
      notes = [...local, ...notes].sort((a, b) => (b.pinned - a.pinned) || (new Date(b.updatedAt) - new Date(a.updatedAt)));
    }
    return { notes, offline };
  },

  loginActivity: () => request('GET', '/auth/activity'),
  stats: () => request('GET', '/stats'),
  mergeNotes: async (ids, title) => { const r = await request('POST', '/notes/merge', { ids, title }); cacheNotes([r.note]); return r; },

  // ---- Folders ----
  folders: () => getShared('/folders').then((r) => { writeMeta('folders', r.folders); return r; }),
  createFolder: (name) => request('POST', '/folders', { name }),
  renameFolder: (id, name) => request('PATCH', `/folders/${id}`, { name }),
  deleteFolder: (id) => request('DELETE', `/folders/${id}`),
  moveToFolder: async (id, folderId) => { const r = await request('PATCH', `/notes/${id}/folder`, { folderId }); cacheNotes([r.note]); window.dispatchEvent(new Event('noted:folders-changed')); return r; },

  async tags() {
    try { const r = await getShared('/notes/tags'); writeMeta('tags', r.tags); return r; } catch (err) {
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
      return changed(res);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const tempId = queue.enqueueCreate(body); queued();
      return { note: queue.localNotes().find((n) => n._id === tempId), queued: true };
    }
  },

  // `session` identifies one editor visit, so the server can keep a version at the start of each session.
  async updateNote(id, body, { session } = {}) {
    if (!isTempId(id) && !queue.entries().some((e) => e.id === id)) {
      try {
        const res = await request('PUT', `/notes/${id}`, body, session ? { headers: { 'X-Edit-Session': session } } : {});
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
  deleteNote: (id) => withMove(id, { deletedAt: new Date().toISOString() }, async () => { const r = await request('DELETE', `/notes/${id}`); cacheNotes([r.note]); return changed(r); }), // moves to trash
  deleteForever: async (id) => { const r = await request('DELETE', `/notes/${id}?permanent=true`); uncache(id); return changed(r); },
  toggleArchive: (id, archived) => withMove(id, archived === undefined ? {} : archived ? { archived: true, pinned: false } : { archived: false }, async () => { const r = await request('PATCH', `/notes/${id}/archive`); cacheNotes([r.note]); return changed(r); }),
  restoreNote: async (id) => { const r = await request('POST', `/notes/${id}/restore`); cacheNotes([r.note]); return changed(r); },
  async emptyTrash() {
    const r = await request('DELETE', '/notes/trash');
    // drop trashed notes from the offline cache too
    try { const c = readCache(); for (const [id, n] of Object.entries(c)) if (n.deletedAt) delete c[id]; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
    return changed(r);
  },
  exportJson: (pin) => download('/notes/export?format=json', 'noted.json', pin ? { 'X-Lock-Pin': pin } : {}),
  exportMarkdown: (pin) => download('/notes/export?format=md', 'noted.zip', pin ? { 'X-Lock-Pin': pin } : {}),
  exportData: (pin) => request('GET', '/notes/export?format=json', undefined, pin ? { headers: { 'X-Lock-Pin': pin } } : {}),
  importNotes: (data) => request('POST', '/notes/import', data).then(changed),
  listVersions: (id, { unlockToken } = {}) => request('GET', `/notes/${id}/versions`, undefined, unlockHeaders(unlockToken)),
  getVersion: (id, vid, { unlockToken } = {}) => request('GET', `/notes/${id}/versions/${vid}`, undefined, unlockHeaders(unlockToken)),
  restoreVersion: async (id, vid, { unlockToken } = {}) => {
    const r = await request('POST', `/notes/${id}/versions/${vid}/restore`, undefined, unlockHeaders(unlockToken));
    cacheNotes([r.note]); return r;
  },

  // ---- Lock PIN & locked notes (never queued offline, never cached with contents) ----
  setLockPin: (password, pin) => request('PUT', '/auth/lock-pin', { password, pin }).then(changed),
  // Removing the PIN unlocks every locked note: drop their redacted cache entries and refresh lists.
  removeLockPin: async (password) => {
    const r = await request('DELETE', '/auth/lock-pin', { password });
    try { const c = readCache(); for (const [id, n] of Object.entries(c)) if (n.locked) delete c[id]; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
    return changed(r);
  },
  unlockNote: (id, pin) => request('POST', `/notes/${id}/unlock`, { pin }),
  lockNote: async (id) => { const r = await request('PATCH', `/notes/${id}/lock`, { locked: true }); cacheNotes([r.note]); return changed(r); },
  removeNoteLock: async (id, pin) => { const r = await request('PATCH', `/notes/${id}/lock`, { locked: false, pin }); cacheNotes([r.note]); return changed(r); },
  updateLockedNote: async (id, body, unlockToken, { session } = {}) => {
    const r = await request('PUT', `/notes/${id}`, body, { headers: { 'X-Unlock-Token': unlockToken, ...(session && { 'X-Edit-Session': session }) } });
    cacheNotes([r.note]); return r;
  },
};
