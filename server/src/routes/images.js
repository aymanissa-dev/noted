import express, { Router } from 'express';
import mongoose from 'mongoose';
import Image, { IMAGE_MAX_BYTES, IMAGE_TYPES } from '../models/Image.js';
import Note from '../models/Note.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { hasUnlock } from '../lib/lockPin.js';
import { imageSize, quota, releaseImage, reserveImage, sniffImage } from '../lib/images.js';

// Mounted at /api, so auth is per route (not router-wide).
const router = Router();
const MB = (n) => `${Math.round(n / (1024 * 1024))} MB`;

async function ownNote(req, id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid id');
  const note = await Note.findOne({ _id: id, user: req.userId }).select('locked lockPinVersion user').lean();
  if (!note) throw new HttpError(404, 'Note not found');
  // Images in a locked note are only served (or added) while it's unlocked: same unlock token as its text.
  if (note.locked && !hasUnlock(req, note)) throw new HttpError(423, 'This note is locked');
  return note;
}

// Any declared type is accepted by the parser so a wrong one gets a clear 415 (not an empty body);
// the real type always comes from the bytes.
const rawImage = express.raw({ type: () => true, limit: IMAGE_MAX_BYTES });
function readBody(req, res, next) {
  rawImage(req, res, (err) => {
    if (err?.type === 'entity.too.large') return next(new HttpError(413, `That image is too large. Images can be at most ${MB(IMAGE_MAX_BYTES)} after compression.`));
    next(err);
  });
}

// Upload: the raw image as the body. Returns { image: { _id, mime, size, width, height, … } }.
router.post('/notes/:id/images', requireAuth, readBody, asyncHandler(async (req, res) => {
  const note = await ownNote(req, req.params.id);
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'No image received');
  const declared = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const mime = sniffImage(req.body);
  if (!mime || !IMAGE_TYPES.includes(declared)) throw new HttpError(415, 'Only PNG, JPEG, WebP and GIF images can be uploaded.');
  const dims = imageSize(req.body, mime);
  if (!dims) throw new HttpError(415, 'That file isn’t a valid image.');
  const size = req.body.length;
  const full = await reserveImage(req.userId, size);
  if (full === 'count') throw new HttpError(409, `You can keep at most ${quota.maxCount} images. Remove some from your notes first.`);
  if (full) throw new HttpError(409, `You’ve used your ${MB(quota.maxBytes)} of image storage. Remove some images from your notes first.`);
  let image;
  try {
    image = await Image.create({ user: req.userId, note: note._id, mime, size, ...dims, data: req.body });
  } catch (err) { await releaseImage(req.userId, size); throw err; }
  res.status(201).json({ image });
}));

// Owner-only. Ids are never reused and the bytes never change, so unlocked images may be cached
// for good (privately: never by a shared cache). Locked notes' images are never stored anywhere.
router.get('/images/:imageId', requireAuth, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.imageId)) throw new HttpError(400, 'Invalid id');
  const img = await Image.findOne({ _id: req.params.imageId, user: req.userId }).select('+data').lean();
  if (!img) throw new HttpError(404, 'Image not found');
  const note = await ownNote(req, img.note);
  const buf = Buffer.from(img.data.buffer ?? img.data);
  res.set({
    'Content-Type': img.mime,
    'Content-Length': buf.length,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    // Never kept in the browser's HTTP cache: any note can be locked later, and a cached copy would
    // outlive the lock. The app keeps its own copy (Cache Storage, unlocked notes only; memory for locked).
    'Cache-Control': 'private, no-store',
    'X-Image-Width': img.width,
    'X-Image-Height': img.height,
    ...(note.locked && { 'X-Note-Locked': '1' }),
  });
  res.end(buf);
}));

export default router;
