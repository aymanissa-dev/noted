// Images on this device. Two layers, both wiped on sign-out and on an account switch (api.js):
//  - memory: id -> blob: URL for this visit (revoked when wiped);
//  - Cache Storage ('noted-images-v1'): bytes of images already viewed, so they keep showing offline.
//    Image ids never change content, so entries never need revalidating. Images of locked notes are
//    never written here (memory only, dropped when the note locks again).
// The browser's HTTP cache isn't used (requests are no-store): it can't be cleared from the page.
const CACHE = 'noted-images-v1';
const MAX_ENTRIES = 300;
const mem = new Map(); // id -> { promise, url?, noteId, locked }
let generation = 0; // bumped on wipe: loads that started before can't repopulate the store

const hasCaches = () => typeof caches !== 'undefined';
const keyFor = (id) => new Request(`/__noted-image/${id}`);

async function cacheGet(id) {
  if (!hasCaches()) return null;
  try { const c = await caches.open(CACHE); const r = await c.match(keyFor(id)); return r ? r.blob() : null; } catch { return null; }
}
async function cacheDelete(id) {
  if (!hasCaches()) return;
  try { await (await caches.open(CACHE)).delete(keyFor(id)); } catch { /* ignore */ }
}
async function cachePut(id, blob, noteId) {
  if (!hasCaches()) return;
  try {
    const c = await caches.open(CACHE);
    await c.put(keyFor(id), new Response(blob, { headers: { 'Content-Type': blob.type, 'X-Note': noteId || '' } }));
    const keys = await c.keys(); // insertion order: drop the oldest past the cap
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await c.delete(k);
  } catch { /* storage full or unavailable: memory only */ }
}

// Returns a blob: URL for the image, fetching it with `fetcher(id)` -> { blob, locked } on a miss.
export function getImageUrl(id, { noteId, locked = false, fetcher }) {
  const hit = mem.get(id);
  if (hit) return hit.promise;
  const gen = generation;
  const entry = { noteId, locked };
  entry.promise = (async () => {
    // A note locked elsewhere may have left an older copy here: locked images are never kept on disk.
    let blob = locked ? (cacheDelete(id), null) : await cacheGet(id);
    if (!blob) {
      let r;
      try { r = await fetcher(id); } catch (e) { if (e?.status === 423 || e?.status === 404) cacheDelete(id); throw e; }
      blob = r.blob; entry.locked = locked || r.locked;
      if (entry.locked) cacheDelete(id);
      else if (gen === generation) cachePut(id, blob, noteId);
    }
    if (gen !== generation) throw Object.assign(new Error('Signed out'), { stale: true });
    entry.url = URL.createObjectURL(blob);
    return entry.url;
  })();
  mem.set(id, entry);
  entry.promise.catch(() => { if (mem.get(id) === entry) mem.delete(id); });
  return entry.promise;
}

// Keep a just-uploaded image without fetching it back.
export function primeImage(id, blob, { noteId, locked = false }) {
  if (mem.has(id)) return;
  const url = URL.createObjectURL(blob);
  mem.set(id, { promise: Promise.resolve(url), url, noteId, locked });
  if (!locked) cachePut(id, blob, noteId);
}

// A note was locked: nothing of it may stay on this device.
export async function forgetNoteImages(noteId) {
  for (const [id, e] of mem) if (e.noteId === noteId) { if (e.url) URL.revokeObjectURL(e.url); mem.delete(id); }
  if (!hasCaches()) return;
  try {
    const c = await caches.open(CACHE);
    for (const k of await c.keys()) { const r = await c.match(k); if (r?.headers.get('X-Note') === noteId) await c.delete(k); }
  } catch { /* ignore */ }
}

// Unlocks ended (sign-out, PIN change, lock timeout): drop images that came from locked notes.
export function forgetLockedImages() {
  for (const [id, e] of mem) if (e.locked) { if (e.url) URL.revokeObjectURL(e.url); mem.delete(id); }
}

export function clearImageStore() {
  generation++;
  for (const e of mem.values()) if (e.url) URL.revokeObjectURL(e.url);
  mem.clear();
  if (hasCaches()) caches.delete(CACHE).catch(() => {});
}
