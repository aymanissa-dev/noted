import { Router } from 'express';
import mongoose from 'mongoose';
import Folder, { MAX_FOLDERS } from '../models/Folder.js';
import Note from '../models/Note.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { createFolderWithinCap, releaseFolder } from '../lib/folderQuota.js';

export { MAX_FOLDERS };
const router = Router();
router.use(requireAuth);

const parseName = (n) => {
  const name = String(n ?? '').trim();
  if (!name) throw new HttpError(400, 'Folder name is required');
  if (name.length > 60) throw new HttpError(400, 'Folder name must be at most 60 characters');
  return name;
};
const duplicate = (e) => { if (e?.code === 11000) throw new HttpError(409, 'You already have a folder with that name'); throw e; };

async function findOwnFolder(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const folder = await Folder.findOne({ _id: req.params.id, user: req.userId });
  if (!folder) throw new HttpError(404, 'Folder not found');
  return folder;
}

// Folders with the number of active notes in each.
router.get('/', asyncHandler(async (req, res) => {
  const [folders, counts] = await Promise.all([
    Folder.find({ user: req.userId }).collation({ locale: 'en', strength: 2 }).sort({ name: 1 }).lean(),
    Note.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(req.userId), deletedAt: null, archived: false, folderId: { $ne: null } } },
      { $group: { _id: '$folderId', n: { $sum: 1 } } },
    ]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({ folders: folders.map(({ __v, ...f }) => ({ ...f, count: byId.get(String(f._id)) || 0 })) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const name = parseName(req.body?.name);
  const folder = await createFolderWithinCap(req.userId, name).catch(duplicate); // atomic cap
  if (!folder) throw new HttpError(400, `You can have at most ${MAX_FOLDERS} folders`);
  res.status(201).json({ folder: { ...folder.toJSON(), count: 0 } });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const folder = await findOwnFolder(req);
  folder.name = parseName(req.body?.name);
  await folder.save().catch(duplicate);
  res.json({ folder });
}));

// Deleting a folder never deletes notes: they move out of it (back to "no folder").
router.delete('/:id', asyncHandler(async (req, res) => {
  const folder = await findOwnFolder(req);
  const { modifiedCount } = await Note.updateMany({ user: req.userId, folderId: folder._id }, { $set: { folderId: null } }, { timestamps: false });
  const { deletedCount } = await Folder.deleteOne({ _id: folder._id, user: req.userId });
  if (deletedCount) await releaseFolder(req.userId); // only the request that actually deleted it
  res.json({ ok: true, movedNotes: modifiedCount });
}));

export default router;
