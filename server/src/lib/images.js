import Image, { IMAGE_MAX_DIMENSION, IMAGE_MAX_PER_USER, IMAGE_MAX_TOTAL_BYTES } from '../models/Image.js';
import Note from '../models/Note.js';
import NoteVersion from '../models/NoteVersion.js';
import User from '../models/User.js';

// ---- Type and size, from the bytes (never from the client's Content-Type or file name) ----
const ascii = (buf, start, end) => buf.toString('latin1', start, end);

// The real type of an upload, by magic bytes. Only PNG, JPEG, WebP and GIF; anything else
// (SVG, HTML, PDF, …) is null, so it can never be served back as something a browser would run.
export function sniffImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function jpegSize(buf) {
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) return null;
    let marker = buf[off + 1];
    while (marker === 0xff && off + 2 < buf.length) { off++; marker = buf[off + 1]; } // fill bytes
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan before a frame header
    const len = buf.readUInt16BE(off + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
    }
    if (len < 2) return null;
    off += 2 + len;
  }
  return null;
}

function webpSize(buf) {
  const chunk = ascii(buf, 12, 16);
  if (chunk === 'VP8 ' && buf.length >= 30) return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L' && buf.length >= 25 && buf[20] === 0x2f) {
    const [b0, b1, b2, b3] = [buf[21], buf[22], buf[23], buf[24]];
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  if (chunk === 'VP8X' && buf.length >= 30) return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  return null;
}

// Pixel size from the image header; null if the header is malformed (so it isn't a real image).
export function imageSize(buf, mime) {
  let s = null;
  try {
    if (mime === 'image/png' && buf.length >= 24 && ascii(buf, 12, 16) === 'IHDR') s = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    else if (mime === 'image/gif') s = { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    else if (mime === 'image/webp') s = webpSize(buf);
    else if (mime === 'image/jpeg') s = jpegSize(buf);
  } catch { s = null; }
  if (!s || !(s.width >= 1 && s.height >= 1 && s.width <= IMAGE_MAX_DIMENSION && s.height <= IMAGE_MAX_DIMENSION)) return null;
  return s;
}

// ---- Per-user quota (count and bytes), atomic ----
// Like lib/folderQuota.js: a slot is reserved on the user document with ONE conditional $inc that
// only matches while both totals stay within the caps, BEFORE the image is stored; it's given back if
// the insert fails and whenever an image is deleted. Parallel uploads can't overshoot either cap.
// Accounts that have never uploaded have no counters; they're filled in from the images on first use.
async function ensureCounts(userId) {
  const u = await User.findById(userId).select('+imageCount +imageBytes').lean();
  if (!u || (typeof u.imageCount === 'number' && typeof u.imageBytes === 'number')) return;
  const [agg] = await Image.aggregate([{ $match: { user: u._id } }, { $group: { _id: null, n: { $sum: 1 }, bytes: { $sum: '$size' } } }]);
  await User.updateOne({ _id: userId, imageCount: { $exists: false } }, { $set: { imageCount: agg?.n || 0, imageBytes: agg?.bytes || 0 } });
}

export const quota = { maxCount: IMAGE_MAX_PER_USER, maxBytes: IMAGE_MAX_TOTAL_BYTES };

// Reserves room for one image of `size` bytes. Returns null on success, or 'count' / 'bytes'.
export async function reserveImage(userId, size) {
  await ensureCounts(userId);
  const r = await User.updateOne(
    { _id: userId, imageCount: { $lte: quota.maxCount - 1 }, imageBytes: { $lte: quota.maxBytes - size } },
    { $inc: { imageCount: 1, imageBytes: size } },
  );
  if (r.modifiedCount === 1) return null;
  const u = await User.findById(userId).select('+imageCount').lean();
  return (u?.imageCount ?? 0) >= quota.maxCount ? 'count' : 'bytes';
}

export const releaseImage = (userId, size) => User.updateOne(
  { _id: userId, imageCount: { $gt: 0 } },
  [{ $set: { imageCount: { $subtract: ['$imageCount', 1] }, imageBytes: { $max: [0, { $subtract: ['$imageBytes', size] }] } } }],
);

// Deletes images one by one so each counter release matches a delete that really happened (two
// overlapping cleanups can't both release the same image).
export async function deleteImages(ids) {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 20) {
    const docs = await Promise.all(ids.slice(i, i + 20).map((_id) => Image.findOneAndDelete({ _id }, { projection: { user: 1, size: 1 } })));
    for (const d of docs) if (d) { deleted++; await releaseImage(d.user, d.size); }
  }
  return deleted;
}

// ---- References and cleanup ----
export const IMAGE_SCHEME = 'noted-image:';
export const referencedImageIds = (text = '') => [...new Set([...String(text).matchAll(/noted-image:([a-f0-9]{24})\b/g)].map((m) => m[1]))];

// Which of `ids` appear in any of the user's notes (trashed ones too: trash keeps images) or, unless
// `notesOnly`, their history. `exceptNotes` leaves out notes that are being deleted.
async function stillReferenced(userId, ids, { exceptNotes = [], notesOnly = false } = {}) {
  if (!ids.length) return new Set();
  const regex = new RegExp(`noted-image:(${ids.join('|')})`);
  const [notes, versions] = await Promise.all([
    Note.find({ user: userId, _id: { $nin: exceptNotes }, content: regex }).select('_id content').lean(),
    notesOnly ? [] : NoteVersion.find({ user: userId, note: { $nin: exceptNotes }, content: regex }).select('content').lean(),
  ]);
  const found = new Map();
  for (const n of notes) for (const id of referencedImageIds(n.content)) if (!found.has(id)) found.set(id, n._id);
  for (const v of versions) for (const id of referencedImageIds(v.content)) if (!found.has(id)) found.set(id, null);
  return found; // id -> the note that references it (null: only history does)
}

// After a note's text is saved: images of this note it references are kept for good; the others
// start their grace period (unless they already have).
export async function markOrphans(note) {
  const ids = referencedImageIds(note.content);
  await Promise.all([
    ids.length && Image.updateMany({ note: note._id, user: note.user, _id: { $in: ids }, orphanedAt: { $ne: null } }, { $set: { orphanedAt: null } }),
    Image.updateMany({ note: note._id, user: note.user, _id: { $nin: ids }, orphanedAt: null }, { $set: { orphanedAt: new Date() } }),
  ]);
}

export const orphanConfig = { graceMs: Number(process.env.IMAGE_ORPHAN_GRACE_MS) || 24 * 60 * 60 * 1000 };
const lastSweep = new Map(); // userId -> ms; at most every 10 minutes per warm instance
export const resetSweepThrottle = () => lastSweep.clear();

// Deletes this user's images that have been unreferenced for longer than the grace period. Each
// candidate is checked again against every note and every history version first, so an image that a
// version (or another note it was copied into) still shows is kept.
export async function sweepOrphans(userId, { force = false } = {}) {
  const now = Date.now();
  if (!force && now - (lastSweep.get(String(userId)) || 0) < 10 * 60 * 1000) return 0;
  lastSweep.set(String(userId), now);
  const candidates = (await Image.find({ user: userId, orphanedAt: { $ne: null, $lt: new Date(now - orphanConfig.graceMs) } }).select('_id').limit(200).lean()).map((i) => String(i._id));
  if (!candidates.length) return 0;
  const refs = await stillReferenced(userId, candidates);
  return deleteImages(candidates.filter((id) => !refs.has(id)));
}

// Notes are being deleted for good: their images go too, except ones another remaining note still
// shows (copied or merged text). Those move to that note instead.
export async function deleteImagesOfNotes(noteIds) {
  const imgs = await Image.find({ note: { $in: noteIds } }).select('_id user').lean();
  if (!imgs.length) return 0;
  const byUser = new Map();
  for (const i of imgs) { const k = String(i.user); if (!byUser.has(k)) byUser.set(k, []); byUser.get(k).push(String(i._id)); }
  const doomed = [];
  for (const [userId, ids] of byUser) {
    const refs = await stillReferenced(userId, ids, { exceptNotes: noteIds, notesOnly: true });
    for (const id of ids) {
      const keeper = refs.get(id);
      if (keeper) await Image.updateOne({ _id: id }, { $set: { note: keeper, orphanedAt: null } });
      else doomed.push(id);
    }
  }
  return deleteImages(doomed);
}
