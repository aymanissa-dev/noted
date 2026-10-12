import { Router } from 'express';
import mongoose from 'mongoose';
import Note, { NOTE_COLORS } from '../models/Note.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import NoteVersion from '../models/NoteVersion.js';
import { deleteNotesWithHistory, maybeSnapshot, pickVersionFields, snapshotForRestore } from '../lib/versions.js';
import { EXPORT_VERSION, parseImport, toExportNote, toMarkdownZip } from '../lib/transfer.js';

const router = Router();
router.use(requireAuth);

export const TRASH_DAYS = 30;

// Lazily purge notes that have sat in the trash longer than TRASH_DAYS.
async function purgeTrash(userId) {
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
  return note;
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
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: re }, { content: re }];
  }
  if (tag) filter.tags = tag;
  const sort = view === 'trash' ? { deletedAt: -1 } : { pinned: -1, updatedAt: -1 };
  const notes = await Note.find(filter).sort(sort);
  res.json({ notes });
}));

router.get('/tags', asyncHandler(async (req, res) => {
  const tags = await Note.distinct('tags', { user: req.userId, deletedAt: null, archived: false });
  res.json({ tags: tags.sort() });
}));

// Export all non-trashed notes as JSON (default) or a zip of Markdown files.
router.get('/export', asyncHandler(async (req, res) => {
  const notes = await Note.find({ user: req.userId, deletedAt: null }).sort({ updatedAt: -1 });
  const stamp = new Date().toISOString().slice(0, 10);
  if (req.query.format === 'md') {
    const buf = await toMarkdownZip(notes);
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="noted-${stamp}.zip"` });
    return res.send(buf);
  }
  if (req.query.format && req.query.format !== 'json') throw new HttpError(400, 'format must be json or md');
  res.set('Content-Disposition', `attachment; filename="noted-${stamp}.json"`);
  res.json({ app: 'noted', version: EXPORT_VERSION, exportedAt: new Date(), notes: notes.map(toExportNote) });
}));

// Import notes from a JSON export. Always scoped to the current user; ids/owners in the file are ignored.
router.post('/import', asyncHandler(async (req, res) => {
  let docs;
  try { docs = parseImport(req.body); } catch (msg) { throw new HttpError(400, String(msg)); }
  const inserted = await Note.insertMany(docs.map((d) => ({ ...d, user: req.userId })), { timestamps: false });
  res.status(201).json({ imported: inserted.length });
}));

router.post('/', asyncHandler(async (req, res) => {
  const fields = pickNoteFields(req.body);
  if (!fields.title?.trim() && !fields.content?.trim()) {
    throw new HttpError(400, 'A note needs a title or content');
  }
  const note = await Note.create({ ...fields, user: req.userId });
  res.status(201).json({ note });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json({ note: await findOwnNote(req) });
}));

const update = asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
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
  const versions = await NoteVersion.find({ note: note._id, user: req.userId }).sort({ createdAt: -1, _id: -1 });
  res.json({ versions: versions.map(versionSummary) });
}));

router.get('/:id/versions/:vid', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  res.json({ version: await findOwnVersion(req, note) });
}));

router.post('/:id/versions/:vid/restore', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  const version = await findOwnVersion(req, note);
  await snapshotForRestore(note);
  Object.assign(note, pickVersionFields(version));
  await note.save();
  res.json({ note });
}));

export default router;
