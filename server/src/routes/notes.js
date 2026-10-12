import { Router } from 'express';
import mongoose from 'mongoose';
import Note from '../models/Note.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normalizeTags(tags) {
  if (tags === undefined) return undefined;
  const list = Array.isArray(tags) ? tags : String(tags).split(',');
  return [...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

function pickNoteFields(body = {}) {
  const out = {};
  if (body.title !== undefined) out.title = String(body.title);
  if (body.content !== undefined) out.content = String(body.content);
  if (body.pinned !== undefined) out.pinned = Boolean(body.pinned);
  const tags = normalizeTags(body.tags);
  if (tags) out.tags = tags;
  return out;
}

async function findOwnNote(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const note = await Note.findOne({ _id: req.params.id, user: req.userId });
  if (!note) throw new HttpError(404, 'Note not found');
  return note;
}

router.get('/', asyncHandler(async (req, res) => {
  const filter = { user: req.userId };
  const search = String(req.query.search || '').trim();
  const tag = String(req.query.tag || '').trim().toLowerCase();
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: re }, { content: re }];
  }
  if (tag) filter.tags = tag;
  const notes = await Note.find(filter).sort({ pinned: -1, updatedAt: -1 });
  res.json({ notes });
}));

router.get('/tags', asyncHandler(async (req, res) => {
  const tags = await Note.distinct('tags', { user: req.userId });
  res.json({ tags: tags.sort() });
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
  Object.assign(note, pickNoteFields(req.body));
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

router.delete('/:id', asyncHandler(async (req, res) => {
  const note = await findOwnNote(req);
  await note.deleteOne();
  res.status(204).end();
}));

export default router;
