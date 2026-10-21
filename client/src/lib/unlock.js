import { api } from './api.js';

// Locked notes can't be trashed or deleted for good without the PIN (the server requires an unlock
// token). Asks for the PIN and resolves to an unlock token for the note: undefined for a note that
// isn't locked, null if the prompt was cancelled. A wrong PIN throws with the server's message.
export async function unlockFor(dialog, note, { action = 'delete it' } = {}) {
  if (!note?.locked) return undefined;
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
    validate: (v) => (v && !/^\d{4,6}$/.test(v) ? 'A PIN is 4 to 6 digits.' : undefined),
  });
  return pin === null ? null : pin;
}
