import { Router } from 'express';
import mongoose from 'mongoose';
import Note, { NOTE_COLORS } from '../models/Note.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import NoteVersion from '../models/NoteVersion.js';
import { deleteNotesWithHistory, maybeSnapshot, pickVersionFields, snapshotForRestore } from '../lib/versions.js';
import User, { RECENT_LIMIT } from '../models/User.js';
import Folder from '../models/Folder.js';
import { hasUnlock, signUnlockToken, verifyLockPin } from '../lib/lockPin.js';
import { plainText } from '../lib/plain.js';
import { fingerprint, EXPORT_VERSION, parseImport, toExportNote, toMarkdownZip } from '../lib/transfer.js';

const router = Router();
router.use(requireAuth);

export const TRASH_DAYS = 30;
export const EXCERPT_CHARS = 300;
export const SMART_FILTERS = ['pinned', 'untagged', 'today', 'week', 'locked'];
export const resetPurgeThrottle = () => lastPurge.clear();

// Shape a lean note for list responses: locked notes redacted, long content cut to an excerpt.
export function toListItem(n) {
  if (n.locked) return { ...n, title: '', content: '', tags: [], redacted: true };
  if (n.content.length > EXCERPT_CHARS) return { ...n, content: n.content.slice(0, EXCERPT_CHARS), excerpt: true };
  return n;
}

// Lazily purge notes that have sat in the trash longer than TRASH_DAYS.
const lastPurge = new Map(); // userId -> ms; purge at most every 10 minutes per warm instance
async function purgeTrash(userId) {
  const now = Date.now();
  if (now - (lastPurge.get(String(userId)) || 0) < 10 * 60 * 1000) return;
  lastPurge.set(String(userId), now);
  const cutoff = new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000);
  await deleteNotesWithHistory({ user: userId, deletedAt: { $ne: null, $lt: cutoff } });
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normalizeTags(tags) {
  if (tags === undefined) return undefined;
  const list = Array.isArray(tags) ? tags : String(tags).split(',');
  return [...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

export function parseColor(c) {
  const color = c === null ? '' : String(c);
  if (!NOTE_COLORS.includes(color)) throw new HttpError(400, `color must be one of: ${NOTE_COLORS.filter(Boolean).join(', ')} (or empty)`);
  return color;
}

// A single emoji (may include modifiers / ZWJ sequences), or empty to clear.
export function parseEmoji(e) {
  const emoji = e === null ? '' : String(e).trim();
  if (!emoji) return '';
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(emoji)];
  if (emoji.length > 16 || graphemes.length !== 1 || !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(emoji)) {
    throw new HttpError(400, 'emoji must be a single emoji');
  }
  return emoji;
}

function pickNoteFields(body = {}) {
  const out = {};
  if (body.title !== undefined) out.title = String(body.title);
  if (body.content !== undefined) out.content = String(body.content);
  if (body.pinned !== undefined) out.pinned = Boolean(body.pinned);
  const tags = normalizeTags(body.tags);
  if (tags) out.tags = tags;
  if (body.color !== undefined) out.color = parseColor(body.color);
  if (body.emoji !== undefined) out.emoji = parseEmoji(body.emoji);
  return out;
}

async function findOwnNote(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const note = await Note.findOne({ _id: req.params.id, user: req.userId });
  if (!note) throw new HttpError(404, 'Note not found');
  if (note.locked && hasUnlock(req, note)) note.$locals.unlocked = true;
  return note;
}

// Reading or editing a locked note's contents (or its history) needs a valid unlock token.
function requireUnlocked(note) {
  if (note.locked && !note.$locals.unlocked) throw new HttpError(423, 'This note is locked');
}

router.get('/', asyncHandler(async (req, res) => {
  await purgeTrash(req.userId);
  const view = String(req.query.view || 'active');
  const filter = { user: req.userId };
  if (view === 'trash') filter.deletedAt = { $ne: null };
  else if (view === 'archive') Object.assign(filter, { deletedAt: null, archived: true });
  else if (view === 'active') Object.assign(filter, { deletedAt: null, archived: false });
  else throw new HttpError(400, 'view must be active, archive, or trash');
  const search = String(req.query.search || '').trim();
  const tag = String(req.query.tag || '').trim().toLowerCase();
  const folder = String(req.query.folder || '').trim();
  if (folder === 'none') filter.folderId = null;
  else if (folder) {
    if (!mongoose.isValidObjectId(folder)) throw new HttpError(400, 'Invalid folder');
    filter.folderId = folder;
  }
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: re }, { content: re }, { plain: re }];
  }
  if (tag) filter.tags = tag;
  // Smart entries: computed views over the user's notes.
  const smart = String(req.query.smart || '');
  if (smart) {
    if (!SMART_FILTERS.includes(smart)) throw new HttpError(400, `smart must be one of: ${SMART_FILTERS.join(', ')}`);
    const day = 24 * 60 * 60 * 1000;
    if (smart === 'pinned') filter.pinned = true;
    if (smart === 'untagged') Object.assign(filter, { tags: { $size: 0 }, locked: { $ne: true } });
    if (smart === 'today') filter.updatedAt = { $gte: new Date(Date.now() - day) };
    if (smart === 'week') filter.updatedAt = { $gte: new Date(Date.now() - 7 * day) };
    if (smart === 'locked') filter.locked = true;
  }
  // Locked notes can't match on their hidden title/content/tags (that would leak them).
  if (search || tag) filter.locked = { $ne: true };
  if (smart === 'locked') filter.locked = true;
  const sort = view === 'trash' ? { deletedAt: -1 } : { pinned: -1, updatedAt: -1 };
  // Lists send excerpts (the editor fetches the full note), as lean objects without Mongoose overhead.
  const notes = await Note.find(filter).sort(sort).select('-__v').lean();
  res.json({ notes: notes.map(toListItem) });
}));

// Recently viewed notes (last RECENT_LIMIT opened), newest first; trashed or deleted notes are skipped.
router.get('/recent', asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select('+recent').lean();
  const ids = (user?.recent || []).map((r) => r.note);
  const notes = await Note.find({ _id: { $in: ids }, user: req.userId, deletedAt: null }).select('-__v').lean();
  const byId = new Map(notes.map((n) => [String(n._id), n]));
  res.json({ notes: ids.map((id) => byId.get(String(id))).filter(Boolean).map(toListItem) });
}));

async function recordView(userId, noteId) {
  await User.updateOne({ _id: userId }, { $pull: { recent: { note: noteId } } });
  await User.updateOne({ _id: userId }, { $push: { recent: { $each: [{ note: noteId, at: new Date() }], $position: 0, $slice: RECENT_LIMIT } } });
}

router.get('/tags', asyncHandler(async (req, res) => {
  const tags = await Note.distinct('tags', { user: req.userId, deletedAt: null, archived: false, locked: { $ne: true } });
  res.json({ tags: tags.sort() });
}));

// Export all non-trashed notes as JSON (default) or a zip of Markdown files.
router.get('/export', asyncHandler(async (req, res) => {
  const notes = await Note.find({ user: req.userId, deletedAt: null }).sort({ updatedAt: -1 });
  // Locked notes are exported only if the correct PIN is supplied (header X-Lock-Pin); otherwise flagged and redacted.
  let includeLocked = false;
  const pin = req.get('x-lock-pin');
  if (pin && notes.some((n) => n.locked)) { await verifyLockPin(req.userId, pin); includeLocked = true; }
  for (const n of notes) if (n.locked && !includeLocked) Object.assign(n, { title: '', content: '', tags: [], $locals: { redacted: true } });
  const stamp = new Date().toISOString().slice(0, 10);
  if (req.query.format === 'md') {
    const buf = await toMarkdownZip(notes);
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="noted-${stamp}.zip"` });
    return res.send(buf);
  }
  if (req.query.format && req.query.format !== 'json') throw new HttpError(400, 'format must be json or md');
  res.set('Content-Disposition', `attachment; filename="noted-${stamp}.json"`);
  const folderNames = new Map((await Folder.find({ user: req.userId }).lean()).map((f) => [String(f._id), f.name]));
  res.json({ app: 'noted', version: EXPORT_VERSION, exportedAt: new Date(), notes: notes.map((n) => ({ ...toExportNote(n), ...(n.folderId && folderNames.has(String(n.folderId)) && { folder: folderNames.get(String(n.folderId)) }) })) });
}));

// Import notes from a JSON export. Always scoped to the current user; ids/owners in the file are ignored.
router.post('/import', asyncHandler(async (req, res) => {
  let docs;
  try { docs = parseImport(req.body); } catch (msg) { throw new HttpError(400, String(msg)); }
  // Skip exact duplicates: same source id as an existing note, or same title+content+createdAt
  // (against the user's existing notes and within the file itself).
  const existing = await Note.find({ user: req.userId }).select('title content createdAt').lean();
  const ids = new Set(existing.map((n) => String(n._id)));
  const seen = new Set(existing.map(fingerprint));
  let skippedDuplicates = 0;
  const fresh = [];
  // Folders are matched by name (case-insensitive) and created when missing.
  const folders = new Map((await Folder.find({ user: req.userId }).lean()).map((f) => [f.name.toLowerCase(), f._id]));
  const folderFor = async (name) => {
    if (!name) return null;
    const key = name.toLowerCase();
    if (!folders.has(key)) folders.set(key, (await Folder.create({ user: req.userId, name }))._id);
    return folders.get(key);
  };
  for (const { sourceId, folder, ...d } of docs.notes) {
    const fp = fingerprint(d);
    if ((sourceId && ids.has(sourceId)) || seen.has(fp)) { skippedDuplicates++; continue; }
    seen.add(fp);
    fresh.push({ ...d, plain: plainText(d.content), folderId: await folderFor(folder), user: req.userId });
  }
  const inserted = fresh.length ? await Note.insertMany(fresh, { timestamps: false }) : [];
  res.status(fresh.length ? 201 : 200).json({ imported: inserted.length, skippedDuplicates, skippedLocked: docs.skipped });
}));

// Merge 2+ notes (in the given order) into a new note. Tags are combined; the originals go to the
// trash, so the merge can be undone by restoring them. Locked notes can't be merged.
export const MAX_MERGE = 50;
router.post('/merge', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(String))] : [];
  if (ids.length < 2) throw new HttpError(400, 'Choose at least two notes to merge');
  if (ids.length > MAX_MERGE) throw new HttpError(400, `You can merge at most ${MAX_MERGE} notes at once`);
  if (!ids.every((id) => mongoose.isValidObjectId(id))) throw new HttpError(400, 'Invalid id');
  const found = await Note.find({ _id: { $in: ids }, user: req.userId, deletedAt: null });
  if (found.length !== ids.length) throw new HttpError(404, 'Some notes were not found');
  if (found.some((n) => n.locked)) throw new HttpError(423, 'Locked notes can’t be merged. Remove the lock first.');
  const byId = new Map(found.map((n) => [String(n._id), n]));
  const notes = ids.map((id) => byId.get(id));
  const title = String(req.body?.title ?? '').trim().slice(0, 200) || `${notes[0].title || 'Untitled'} (merged)`;
  const content = notes.map((n) => `## ${n.title || 'Untitled'}\n\n${n.content.trim()}`).join('\n\n').slice(0, 100000);
  const tags = [...new Set(notes.flatMap((n) => n.tags))].slice(0, 20);
  const first = notes[0];
  const merged = await Note.create({
    user: req.userId, title, content, tags,
    color: first.color, emoji: first.emoji, folderId: first.folderId, pinned: notes.some((n) => n.pinned),
  });
  const now = new Date();
  await Note.updateMany({ _id: { $in: ids }, user: req.userId }, { $set: { deletedAt: now } }, { timestamps: false });
  res.status(201).json({ note: merged, trashed: ids });
}));

router.post('/', asyncHandler(async (req, res) => {
  const fields = pickNoteFields(req.body);
  if (!fields.title?.trim() && !fields.content?.trim()) {
    throw new HttpError(400, 'A note needs a title or content');
  }
  if (req.body?.folderId) fields.folderId = await parseFolderId(req, req.body.folderId);
  const note = await Note.create({ ...fields, user: req.userId });
  res.status(201).json({ note });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  if (!note.deletedAt) await recordView(req.userId, note._id).catch(() => {}); // best effort
  res.json({ note }); // redacted if locked and not unlocked
}));

// Unlock a note with the PIN: returns its full contents and a short-lived unlock token.
router.post('/:id/unlock', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  if (!note.locked) throw new HttpError(400, 'Note is not locked');
  const user = await verifyLockPin(req.userId, req.body?.pin);
  note.$locals.unlocked = true;
  res.json({ note, unlockToken: signUnlockToken(user, note._id) });
}));

// Lock ({ locked: true }) needs a PIN to be set; removing a lock ({ locked: false, pin }) needs the PIN.
router.patch('/:id/lock', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  const locked = Boolean(req.body?.locked);
  if (locked) {
    const user = await User.findById(req.userId).select('hasLockPin');
    if (!user?.hasLockPin) throw new HttpError(400, 'Set a lock PIN in Settings first');
    note.locked = true;
    note.$locals.unlocked = false;
  } else if (note.locked) {
    await verifyLockPin(req.userId, req.body?.pin);
    note.locked = false;
  }
  await note.save({ timestamps: false });
  res.json({ note });
}));

// folderId: a folder of this user, or null for "no folder".
async function parseFolderId(req, value) {
  if (value === null || value === '') return null;
  if (!mongoose.isValidObjectId(value)) throw new HttpError(400, 'Invalid folder');
  if (!(await Folder.exists({ _id: value, user: req.userId }))) throw new HttpError(404, 'Folder not found');
  return value;
}

// Move a note into a folder (allowed for locked notes too: it doesn't touch the contents).
router.patch('/:id/folder', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  note.folderId = await parseFolderId(req, req.body?.folderId ?? null);
  await note.save({ timestamps: false });
  res.json({ note });
}));

const update = asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  requireUnlocked(note);
  if (req.body?.folderId !== undefined) note.folderId = await parseFolderId(req, req.body.folderId);
  const prev = pickVersionFields(note);
  Object.assign(note, pickNoteFields(req.body));
  await maybeSnapshot(note, prev);
  await note.save();
  res.json({ note });
});
router.put('/:id', update);
router.patch('/:id', update);

router.patch('/:id/pin', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  note.pinned = !note.pinned;
  await note.save({ timestamps: false });
  res.json({ note });
}));

router.patch('/:id/archive', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  note.archived = !note.archived;
  if (note.archived) note.pinned = false;
  await note.save({ timestamps: false });
  res.json({ note });
}));

router.post('/:id/restore', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  note.deletedAt = null;
  await note.save({ timestamps: false });
  res.json({ note });
}));

// Empty the trash (permanently delete all trashed notes).
router.delete('/trash', asyncHandler(async (req, res) => {
  const deleted = await deleteNotesWithHistory({ user: req.userId, deletedAt: { $ne: null } });
  res.json({ deleted });
}));

// Soft delete (move to trash). ?permanent=true deletes for good.
router.delete('/:id', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  if (req.query.permanent === 'true') {
    await deleteNotesWithHistory({ _id: note._id, user: req.userId });
    return res.status(204).end();
  }
  note.deletedAt = new Date();
  await note.save({ timestamps: false });
  res.json({ note });
}));

// ---- Version history ----
const versionSummary = (v) => ({
  _id: v._id, createdAt: v.createdAt, reason: v.reason, title: v.title,
  preview: v.content.slice(0, 140), length: v.content.length,
});

async function findOwnVersion(req, note) {
  if (!mongoose.isValidObjectId(req.params.vid)) throw new HttpError(400, 'Invalid version id');
  const version = await NoteVersion.findOne({ _id: req.params.vid, note: note._id, user: req.userId });
  if (!version) throw new HttpError(404, 'Version not found');
  return version;
}

router.get('/:id/versions', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  requireUnlocked(note);
  const versions = await NoteVersion.find({ note: note._id, user: req.userId }).sort({ createdAt: -1, _id: -1 });
  res.json({ versions: versions.map(versionSummary) });
}));

router.get('/:id/versions/:vid', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  requireUnlocked(note);
  res.json({ version: await findOwnVersion(req, note) });
}));

router.post('/:id/versions/:vid/restore', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  requireUnlocked(note);
  const version = await findOwnVersion(req, note);
  await snapshotForRestore(note);
  Object.assign(note, pickVersionFields(version));
  await note.save();
  res.json({ note });
}));

export default router;
