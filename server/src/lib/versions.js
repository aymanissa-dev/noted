import Note from '../models/Note.js';
import NoteVersion from '../models/NoteVersion.js';
import AudioClip from '../models/AudioClip.js';
import User from '../models/User.js';
import { deleteImagesOfNotes } from './images.js';

export const VERSION_FIELDS = ['title', 'content', 'tags', 'color', 'emoji'];
export const MAX_VERSIONS = 50;
// Autosave can fire every second; keep at most one snapshot per interval unless the change is large.
export const versionConfig = {
  intervalMs: Number(process.env.NOTE_VERSION_INTERVAL_MS) || 5 * 60 * 1000,
  significantChars: 300,
};

export const pickVersionFields = (n) => ({
  title: n.title, content: n.content, tags: [...(n.tags || [])], color: n.color || '', emoji: n.emoji || '',
});

const sameFields = (a, b) => JSON.stringify(pickVersionFields(a)) === JSON.stringify(pickVersionFields(b));

async function writeVersion(note, state, reason) {
  await NoteVersion.create({ note: note._id, user: note.user, ...pickVersionFields(state), reason });
  // Enforce the cap: drop the oldest beyond MAX_VERSIONS.
  const stale = await NoteVersion.find({ note: note._id, user: note.user })
    .sort({ createdAt: -1, _id: -1 }).skip(MAX_VERSIONS).select('_id');
  if (stale.length) await NoteVersion.deleteMany({ _id: { $in: stale.map((v) => v._id) } });
}

// Approximate size of an edit: characters changed between the common prefix and suffix.
export function changeSize(a = '', b = '') {
  a = String(a); b = String(b);
  if (a === b) return 0;
  let start = 0;
  const min = Math.min(a.length, b.length);
  while (start < min && a[start] === b[start]) start++;
  let end = 0;
  while (end < min - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  return Math.max(a.length - start - end, b.length - start - end);
}
const fieldsChange = (a, b) => changeSize(a.content, b.content) + changeSize(a.title, b.title)
  + changeSize((a.tags || []).join(' '), (b.tags || []).join(' ')) + (a.color !== b.color ? 1 : 0) + (a.emoji !== b.emoji ? 1 : 0);

// Called before saving an edit. Snapshots the previous state when:
//  - there is no version yet, or the last one is older than the interval;
//  - this is the first edit of a new editing session (the editor sends X-Edit-Session per open);
//  - the change accumulated since the last version (across requests, not per request) reaches significantChars.
// Mutates note.editSession / note.changeSinceVersion; the caller saves the note.
export async function maybeSnapshot(note, prevState, { session } = {}) {
  if (sameFields(prevState, note)) return false; // nothing editable changed
  const newSession = Boolean(session) && session !== note.editSession;
  if (session) note.editSession = session;
  const delta = fieldsChange(prevState, note);
  const last = await NoteVersion.findOne({ note: note._id, user: note.user }).sort({ createdAt: -1, _id: -1 });
  const accumulated = (note.changeSinceVersion || 0) + delta;
  if (last && sameFields(last, prevState)) { note.changeSinceVersion = accumulated; return false; } // already have this state
  const stale = !last || Date.now() - last.createdAt.getTime() >= versionConfig.intervalMs;
  const significant = accumulated >= versionConfig.significantChars;
  if (!stale && !significant && !newSession) { note.changeSinceVersion = accumulated; return false; }
  await writeVersion(note, prevState, 'edit');
  note.changeSinceVersion = delta; // this edit is the first change on top of the new version
  return true;
}

// Restoring always snapshots the current state first, so a restore can be undone.
export async function snapshotForRestore(note) {
  await writeVersion(note, pickVersionFields(note), 'restore');
}

// Permanently delete notes matching `filter` together with their history.
export async function deleteNotesWithHistory(filter) {
  const ids = (await Note.find(filter).select('_id')).map((n) => n._id);
  if (!ids.length) return 0;
  await NoteVersion.deleteMany({ note: { $in: ids } });
  await AudioClip.deleteMany({ note: { $in: ids } });
  await deleteImagesOfNotes(ids); // images another remaining note shows move to it instead
  await User.updateMany({ 'recent.note': { $in: ids } }, { $pull: { recent: { note: { $in: ids } } } });
  const { deletedCount } = await Note.deleteMany({ _id: { $in: ids } });
  return deletedCount;
}
