import { useSyncExternalStore } from 'react';

// Locked notes opened with the PIN during this visit: their titles show in lists (with the lock icon)
// for as long as the unlock lasts, instead of "Locked note" until a refresh. Memory only: never saved
// on the device, and gone on reload, logout, re-lock or a PIN change.
const peeks = new Map(); // id -> { title, emoji, until }
const listeners = new Set();
let version = 0;
const emit = () => { version += 1; listeners.forEach((l) => l()); };
const tokenUntil = (t) => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch { return Date.now() + 15 * 60 * 1000; } };

export function rememberUnlocked(note, unlockToken) {
  if (!note?._id) return;
  const until = tokenUntil(unlockToken);
  peeks.set(note._id, { title: note.title || '', emoji: note.emoji || '', until });
  setTimeout(emit, Math.max(0, until - Date.now()) + 50); // back to "Locked note" when it ends
  emit();
}
export function forgetUnlocked(id) { if (id === undefined ? peeks.size : peeks.delete(id)) { if (id === undefined) peeks.clear(); emit(); } }
export function unlockedPeek(id) {
  const p = peeks.get(id);
  if (p && p.until <= Date.now()) { peeks.delete(id); return null; }
  return p || null;
}
// "Locked note", or the real title while it's unlocked.
export function displayTitle(n) {
  if (!n?.locked) return n?.title || 'Untitled';
  const p = unlockedPeek(n._id);
  return p ? (p.title || 'Untitled') : 'Locked note';
}
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
// Re-renders the caller when a note is unlocked or relocked.
export const useUnlockedVersion = () => useSyncExternalStore(subscribe, () => version);
