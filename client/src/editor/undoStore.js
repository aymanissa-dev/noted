// Persists each note's editor undo history in IndexedDB, so undo works across sessions.
// Never used for locked notes; cleared on logout.
const DB = 'noted-undo';
const STORE = 'history';
const MAX_BYTES = 1_000_000;

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
const key = (userId, noteId) => `${userId}:${noteId}`;

export async function loadUndo(userId, noteId) {
  try { return (await run('readonly', (s) => s.get(key(userId, noteId)))) || null; } catch { return null; }
}
export async function saveUndo(userId, noteId, data) {
  try {
    const json = JSON.stringify(data);
    if (json.length > MAX_BYTES) return dropUndo(userId, noteId);
    await run('readwrite', (s) => s.put(data, key(userId, noteId)));
  } catch { /* best effort */ }
}
export async function dropUndo(userId, noteId) {
  try { await run('readwrite', (s) => s.delete(key(userId, noteId))); } catch { /* ignore */ }
}
export function clearAllUndo() {
  try { indexedDB.deleteDatabase(DB); } catch { /* ignore */ }
}
