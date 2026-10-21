import User from '../models/User.js';
import Folder, { MAX_FOLDERS } from '../models/Folder.js';

// Per-user folder cap, enforced atomically: a slot is reserved on the user document with a
// conditional $inc (only matches while folderCount <= MAX - 1) BEFORE the folder is created, and
// given back if the create fails or a folder is deleted. Parallel creates/imports can't overshoot.
//
// Accounts from before the counter have no folderCount: the first reservation counts their folders
// and sets it only if it's still missing ($exists: false), so two first-time callers can't both
// write it, and nothing creates folders without going through reserveFolder.
async function ensureCount(userId) {
  const u = await User.findById(userId).select('+folderCount').lean();
  if (!u || typeof u.folderCount === 'number') return;
  const n = await Folder.countDocuments({ user: userId });
  await User.updateOne({ _id: userId, folderCount: { $exists: false } }, { $set: { folderCount: n } });
}

export async function reserveFolder(userId) {
  await ensureCount(userId);
  const r = await User.updateOne({ _id: userId, folderCount: { $lte: MAX_FOLDERS - 1 } }, { $inc: { folderCount: 1 } });
  return r.modifiedCount === 1;
}

export const releaseFolder = (userId) => User.updateOne({ _id: userId, folderCount: { $gt: 0 } }, { $inc: { folderCount: -1 } });

// Create a folder within the cap; returns the folder, or null when the cap is reached.
// Errors (e.g. duplicate name) give the slot back and are rethrown.
export async function createFolderWithinCap(userId, name) {
  if (!(await reserveFolder(userId))) return null;
  try { return await Folder.create({ user: userId, name }); } catch (err) { await releaseFolder(userId); throw err; }
}
