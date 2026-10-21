import { clearAllUndo } from '../editor/undoStore.js';
import { createQueue, isTempId } from './offlineQueue.js';
import { OFFLINE_MESSAGE, NETWORK_MESSAGE } from './network.js';

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export const TOKEN_KEY = 'noted.token';
export const USER_KEY = 'noted.user';
// v2: list copies are marked (`_list`) so they're never mistaken for a full, editable note.
// Older caches can't tell the two apart, so they're dropped (the next list fetch refills it).
const CACHE_KEY = 'noted.cache.v2';
try { localStorage.removeItem('noted.cache'); } catch { /* storage unavailable */ }
const CACHE_LIMIT = 1000;

export const queue = createQueue(localStorage);

// ---- Whose data is on this device ----
// Everything noted. keeps locally (note cache, list meta, offline queue, editor undo history) belongs
// to one account: OWNER_KEY records which. If the signed-in account is ever different (a token set
// without the normal login flow, another tab switching accounts, an upgrade from before this key),
// that data is wiped before anything can read it.
const OWNER_KEY = 'noted.owner';
const currentUserId = () => { try { const u = JSON.parse(localStorage.getItem(USER_KEY)); return u?.id || u?._id || null; } catch { return null; } };
const ownedByCurrentUser = () => { const id = currentUserId(); return Boolean(id) && localStorage.getItem(OWNER_KEY) === id; };
let signedOutPurged = false;
export function ensureOwner(userId = currentUserId()) {
  try {
    // Signed out: nothing of any account's editor history may stay on this device.
    if (!userId) { if (!signedOutPurged && !localStorage.getItem(TOKEN_KEY)) { signedOutPurged = true; clearAllUndo(); } return; }
    signedOutPurged = false;
    const owner = localStorage.getItem(OWNER_KEY);
    if (owner === userId) return;
    clearAllUndo();
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(META_KEY);
    // A queue from before owners were recorded was written by this session (logins always cleared
    // it), so keep it; a queue that belongs to another account never syncs under this one.
    if (owner) queue.clear();
    loadedBodies.clear();
    localStorage.setItem(OWNER_KEY, userId);
  } catch { /* storage unavailable */ }
}

// Notes whose full body came from the server during this visit (opened, created or saved).
// Only these can be edited, online or queued offline: a copy kept on this device may be stale or
// partial, and saving over the server from it could wipe the real note.
const loadedBodies = new Set();
export const bodyLoaded = (id) => isTempId(id) || loadedBodies.has(id);
const markLoaded = (note) => { if (note?._id && !note.excerpt && !note.redacted) loadedBodies.add(note._id); };
const notLoadedError = () => Object.assign(new Error('This note hasn’t loaded yet, so changes to it can’t be saved. Reconnect and open it again.'), { notLoaded: true });

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}
// fetch rejects with a TypeError when the network is unavailable.
export const isNetworkError = (err) => err instanceof TypeError || err?.offline === true;
const offlineError = () => Object.assign(new TypeError(OFFLINE_MESSAGE), { offline: true });
// fetch() that never surfaces the browser's raw "Failed to fetch": network failures become a
// TypeError (so isNetworkError still sees them) with a message people can act on.
async function netFetch(url, opts) {
  try { return await fetch(url, opts); }
  catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw Object.assign(new TypeError(navigator.onLine ? NETWORK_MESSAGE : OFFLINE_MESSAGE), { network: true, offline: !navigator.onLine, cause: e });
  }
}

// While the session token is being rotated (sign out everywhere, password change), requests that
// raced it can get a 401 with the old token: wait for the new one and retry instead of logging out.
let rotating = null;
const rotate = (run) => {
  const p = run();
  // Waiters only need to know when it settles; the caller handles the rejection.
  const r = p.finally(() => { if (rotating === r) rotating = null; });
  r.catch(() => {});
  rotating = r;
  return p;
};

async function request(method, path, body, { headers: extra, signal, retried } = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!navigator.onLine) throw offlineError();
  const res = await netFetch(BASE + path, {
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
export const readMeta = (k) => { try { ensureOwner(); return ownedByCurrentUser() ? JSON.parse(localStorage.getItem(META_KEY))?.[k] : undefined; } catch { return undefined; } };
const writeMeta = (k, v) => { try { ensureOwner(); const m = JSON.parse(localStorage.getItem(META_KEY)) || {}; m[k] = v; localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* best-effort */ } };

// ---- Local read cache (for offline reading). Cleared on logout. ----
const readCache = () => { try { ensureOwner(); return ownedByCurrentUser() ? JSON.parse(localStorage.getItem(CACHE_KEY)) || {} : {}; } catch { return {}; } };
// `list: true` marks copies that came from a list response. Even when a short note's whole body
// fits in the list, it may be stale and isn't proof the body was ever loaded, so only copies from a
// single-note response (open, prefetch, save, create…) count as "full" for opening in the editor.
function cacheNotes(notes, { replaceView, list = false } = {}) {
  try {
    let cache = readCache();
    const old = cache; // full copies survive a view refresh when the list shows the same version
    if (replaceView) { // drop stale notes of a fully-fetched view
      cache = Object.fromEntries(Object.entries(cache).filter(([, n]) => viewOf(n) !== replaceView));
    }
    for (const n of notes) {
      if (n.locked) { cache[n._id] = { ...n, title: '', content: '', tags: [], redacted: true }; continue; }
      const prev = cache[n._id] || old[n._id];
      // Never replace a full cached note with a list copy of the same version.
      if (list && prev && !prev._list && !prev.excerpt && prev.updatedAt === n.updatedAt) { cache[n._id] = prev; continue; }
      if (list) cache[n._id] = { ...n, _list: true };
      else { const { _list, ...full } = n; cache[n._id] = full; }
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
  localStorage.removeItem(OWNER_KEY);
  localStorage.removeItem('noted.tourPending'); // the welcome tour belongs to the account that just signed up
  queue.clear();
  loadedBodies.clear();
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
  ensureOwner();
  if (syncing || !queue.size() || !navigator.onLine || !localStorage.getItem(TOKEN_KEY)) return syncing || Promise.resolve(0);
  syncing = queue.flush(sendEntry, {
    onIdMapped: (tempId, realId) => { loadedBodies.add(realId); window.dispatchEvent(new CustomEvent('noted:id-mapped', { detail: { tempId, realId } })); },
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
async function download(path, fallbackName, body) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!navigator.onLine) throw offlineError();
  // POST with a JSON body when there's something to send (e.g. the export PIN: never in a URL/header).
  const res = await netFetch(BASE + path, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && { 'Content-Type': 'application/json' }) }, body: body ? JSON.stringify(body) : undefined });
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
  if (!bodyLoaded(id)) return false; // never write a body that wasn't loaded (see loadedBodies)
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
  if (!navigator.onLine) throw offlineError();
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await netFetch(BASE + path, { method, body, cache: 'no-store', headers: { ...(token && { Authorization: `Bearer ${token}` }), ...headers } });
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
    if (c && !c._list && !c.excerpt && !c.redacted) return; // full copy already here
    prefetched.add(id);
    getShared(`/notes/${id}?prefetch=1`).then(({ note }) => cacheNotes([note])).catch(() => {}).finally(() => setTimeout(() => prefetched.delete(id), 30000));
  },
  // A full (non-excerpt, non-locked) cached copy, for opening a note instantly.
  cachedNote(id) {
    const c = readCache()[id];
    if (!c || c._list || c.excerpt || c.redacted || c.locked) return null;
    return queue.applyPending([c])[0];
  },

  async recentNotes(signal) {
    try { const r = await (signal ? request('GET', '/notes/recent', undefined, { signal }) : getShared('/notes/recent')); cacheNotes(r.notes, { list: true }); writeMeta('recent', r.notes.slice(0, 10).map((n) => ({ _id: n._id, title: n.locked ? '' : n.title, emoji: n.locked ? '' : n.emoji, locked: n.locked }))); return { notes: r.notes, offline: false }; }
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
      cacheNotes(notes, { list: true, replaceView: !search && !tag && !folder && !smart ? view : undefined });
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
      markLoaded(note);
      return { note: queue.applyPending([note])[0] };
    } catch (err) {
      // Offline/unreachable (including a blocked request): the note didn't load. Whatever this device
      // has is attached for showing read-only — err.local (a full copy saved here before) or
      // err.preview (a list copy) — and never opens as an editable note.
      const cached = readCache()[id];
      if (!isNetworkError(err) || !cached || cached.redacted) throw err;
      if (cached._list || cached.excerpt) throw Object.assign(err, { preview: cached });
      throw Object.assign(err, { local: queue.applyPending([cached])[0] });
    }
  },

  async createNote(body) {
    try {
      const res = await request('POST', '/notes', body);
      cacheNotes([res.note]);
      markLoaded(res.note);
      return changed(res);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const tempId = queue.enqueueCreate(body); queued();
      return { note: queue.localNotes().find((n) => n._id === tempId), queued: true };
    }
  },

  // `session` identifies one editor visit, so the server can keep a version at the start of each session.
  async updateNote(id, body, { session } = {}) {
    if (!bodyLoaded(id)) throw notLoadedError(); // nor queued: the offline queue only takes loaded notes
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
  // Locked notes need their unlock token (see unlockFor in lib/unlock.js) to be trashed or deleted.
  deleteNote: (id, unlockToken) => withMove(id, { deletedAt: new Date().toISOString() }, async () => { const r = await request('DELETE', `/notes/${id}`, undefined, unlockHeaders(unlockToken)); cacheNotes([r.note]); return changed(r); }), // moves to trash
  deleteForever: async (id, unlockToken) => { const r = await request('DELETE', `/notes/${id}?permanent=true`, undefined, unlockHeaders(unlockToken)); uncache(id); return changed(r); },
  toggleArchive: (id, archived) => withMove(id, archived === undefined ? {} : archived ? { archived: true, pinned: false } : { archived: false }, async () => { const r = await request('PATCH', `/notes/${id}/archive`); cacheNotes([r.note]); return changed(r); }),
  restoreNote: async (id) => { const r = await request('POST', `/notes/${id}/restore`); cacheNotes([r.note]); return changed(r); },
  async emptyTrash(pin) {
    const r = await request('DELETE', '/notes/trash', pin ? { pin } : undefined);
    // drop trashed notes from the offline cache too (locked ones stay if they were kept)
    try { const c = readCache(); for (const [id, n] of Object.entries(c)) if (n.deletedAt && !(n.locked && r.keptLocked)) delete c[id]; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
    return changed(r);
  },
  exportJson: (pin) => download('/notes/export', 'noted.json', { format: 'json', ...(pin && { pin }) }),
  exportMarkdown: (pin) => download('/notes/export', 'noted.zip', { format: 'md', ...(pin && { pin }) }),
  exportData: (pin) => request('POST', '/notes/export', { format: 'json', ...(pin && { pin }) }),
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
  unblockPin: (password) => request('POST', '/auth/lock-pin/unblock', { password }),
  lockNote: async (id) => { const r = await request('PATCH', `/notes/${id}/lock`, { locked: true }); cacheNotes([r.note]); return changed(r); },
  removeNoteLock: async (id, pin) => { const r = await request('PATCH', `/notes/${id}/lock`, { locked: false, pin }); cacheNotes([r.note]); return changed(r); },
  updateLockedNote: async (id, body, unlockToken, { session } = {}) => {
    const r = await request('PUT', `/notes/${id}`, body, { headers: { 'X-Unlock-Token': unlockToken, ...(session && { 'X-Edit-Session': session }) } });
    cacheNotes([r.note]); return r;
  },
};

ensureOwner(); // before anything reads this device's data
