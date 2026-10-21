import { api } from './api.js';

// Locked notes can't be trashed or deleted for good without the PIN (the server requires an unlock
// token). Asks for the PIN and resolves to an unlock token for the note: undefined for a note that
// isn't locked, null if the prompt was cancelled. A wrong PIN throws with the server's message.
// `held`: an unlock token the caller already has (the open editor's). Within its 15-minute window
// it's used as is (no second PIN prompt, see SECURITY.md); once expired the PIN is asked again.
export async function unlockFor(dialog, note, { action = 'delete it', held } = {}) {
  if (!note?.locked) return undefined;
  if (unlockStillValid(held)) return held;
  const pin = await dialog.prompt({
    title: 'This note is locked', body: `Enter your PIN to ${action}.`,
    label: 'PIN', type: 'password', inputMode: 'numeric', maxLength: 6, confirmLabel: 'Continue',
    validate: (v) => (!/^\d{4,6}$/.test(v || '') ? 'Enter your PIN.' : undefined),
  });
  if (pin === null) return null;
  return (await api.unlockNote(note._id, pin)).unlockToken;
}

// Empty trash with locked notes in it: the PIN deletes those too; empty keeps them in the trash.
export async function trashPin(dialog, notes) {
  if (!notes.some((n) => n.locked)) return '';
  const pin = await dialog.prompt({
    title: 'Locked notes in the trash', body: 'Enter your PIN to delete the locked notes too. Leave it empty to keep them in the trash.',
    label: 'PIN', type: 'password', inputMode: 'numeric', maxLength: 6, allowEmpty: true, confirmLabel: 'Empty trash',
    validate: (v) => (v && !/^\d{4,6}$/.test(v) ? 'Enter your PIN (digits only).' : undefined),
  });
  return pin === null ? null : pin;
}

// True while an unlock token has more than 15 seconds left (reads its exp; the server still decides).
export function unlockStillValid(token) {
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return exp * 1000 - Date.now() > 15_000;
  } catch { return false; }
}
