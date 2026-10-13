import { Router } from 'express';
import mongoose from 'mongoose';
import Note from '../models/Note.js';
import Folder from '../models/Folder.js';
import NoteVersion from '../models/NoteVersion.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { plainText } from '../lib/plain.js';

const router = Router();
router.use(requireAuth);

export const countWords = (s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length;

// Storage overview. Locked notes are counted, but their words/size stay private (not included).
router.get('/', asyncHandler(async (req, res) => {
  const user = new mongoose.Types.ObjectId(req.userId);
  const [notes, folders, versions, extra] = await Promise.all([
    Note.find({ user: req.userId }).select('title content tags locked archived deletedAt emoji').lean(),
    Folder.countDocuments({ user: req.userId }),
    NoteVersion.countDocuments({ user: req.userId }),
    req.app.locals.extraStats ? req.app.locals.extraStats(user) : {},
  ]);
  let words = 0; let chars = 0;
  const sized = [];
  for (const n of notes) {
    if (n.locked) continue;
    const w = countWords(plainText(n.content)) + countWords(n.title);
    words += w; chars += n.content.length;
    if (!n.deletedAt) sized.push({ _id: n._id, title: n.title || 'Untitled', emoji: n.emoji || '', words: w, chars: n.content.length });
  }
  const active = notes.filter((n) => !n.deletedAt);
  res.json({
    notes: {
      total: notes.length,
      active: active.filter((n) => !n.archived).length,
      archived: active.filter((n) => n.archived).length,
      trashed: notes.length - active.length,
      locked: notes.filter((n) => n.locked).length,
    },
    words, chars,
    folders,
    tags: new Set(active.filter((n) => !n.locked).flatMap((n) => n.tags)).size,
    versions,
    biggest: sized.sort((a, b) => b.chars - a.chars).slice(0, 5),
    ...extra,
  });
}));

export default router;
