import Note from '../models/Note.js';
import NoteVersion from '../models/NoteVersion.js';
import AudioClip from '../models/AudioClip.js';

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

// Called before saving an edit: snapshots the previous state when the throttle allows it.
export async function maybeSnapshot(note, prevState) {
  if (sameFields(prevState, note)) return false; // nothing editable changed
  const last = await NoteVersion.findOne({ note: note._id, user: note.user }).sort({ createdAt: -1, _id: -1 });
  if (last && sameFields(last, prevState)) return false; // already have this exact state
  const stale = !last || Date.now() - last.createdAt.getTime() >= versionConfig.intervalMs;
  // A large edit in one save (paste, big deletion) gets its own snapshot even inside the interval.
  const significant = Math.abs((note.content || '').length - (prevState.content || '').length) >= versionConfig.significantChars
    || Math.abs((last?.content || '').length - (prevState.content || '').length) >= versionConfig.significantChars;
  if (!stale && !significant) return false;
  await writeVersion(note, prevState, 'edit');
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
  const { deletedCount } = await Note.deleteMany({ _id: { $in: ids } });
  return deletedCount;
}
