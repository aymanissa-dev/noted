import { Router } from 'express';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import Share from '../models/Share.js';
import Note from '../models/Note.js';
import Image from '../models/Image.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { LIMITS, bypassed, clientIp, hit, tooMany } from '../lib/rateLimit.js';

// Share a note via a public, read-only link (/s/<token>). Mounted at /api.
//
// Owner routes (signed in): GET /shares, GET|POST|DELETE /notes/:id/share, POST /notes/:id/share/rotate.
// Public routes (no sign-in, never look at a bearer token): GET /public/shares/:token and
// GET /public/shares/:token/images/:imageId.
//
// Locked notes can't be shared: creating a link for one is 423, locking a shared note deletes its
// link, and the public routes re-check the lock on every request (a PIN-locked body never leaves the
// server through a link). A trashed note's link answers 404 until the note is restored; deleting the
// note for good (or the account) deletes the link.
const router = Router();
const newToken = () => randomBytes(32).toString('base64url'); // 43 chars, 256 bits
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const NOTE_IMAGE_RE = /!\[[^\]\n]*\]\(noted-image:([a-f0-9]{24})\)/g;
const imageIdsIn = (content = '') => new Set([...String(content).matchAll(NOTE_IMAGE_RE)].map((m) => m[1]));

async function ownNoteForShare(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const note = await Note.findOne({ _id: req.params.id, user: req.userId }).select('locked deletedAt').lean();
  if (!note) throw new HttpError(404, 'Note not found');
  return note;
}
function shareable(note) {
  if (note.locked) throw new HttpError(423, 'Locked notes can’t be shared. Remove the lock to share this note.');
  if (note.deletedAt) throw new HttpError(400, 'Restore this note from the trash to share it.');
}

router.get('/shares', requireAuth, asyncHandler(async (req, res) => {
  const shares = await Share.find({ user: req.userId }).sort({ createdAt: -1 }).lean();
  const notes = await Note.find({ _id: { $in: shares.map((s) => s.note) }, user: req.userId }).select('title emoji locked deletedAt').lean();
  const byId = new Map(notes.map((n) => [String(n._id), n]));
  res.json({
    shares: shares.map((s) => {
      const n = byId.get(String(s.note)) || {};
      // A locked note's title stays private (its link is deleted on lock anyway).
      return { _id: s._id, note: s.note, token: s.token, createdAt: s.createdAt, updatedAt: s.updatedAt, allowEdits: s.allowEdits, allowIndexing: s.allowIndexing,
        title: n.locked ? '' : n.title || '', emoji: n.locked ? '' : n.emoji || '', inTrash: Boolean(n.deletedAt) };
    }),
  });
}));

router.get('/notes/:id/share', requireAuth, asyncHandler(async (req, res) => {
  const note = await ownNoteForShare(req);
  res.json({ share: (await Share.findOne({ note: note._id, user: req.userId })) || null });
}));

// Create the note's link (or return the one it already has).
router.post('/notes/:id/share', requireAuth, asyncHandler(async (req, res) => {
  const note = await ownNoteForShare(req);
  shareable(note);
  const existing = await Share.findOne({ note: note._id, user: req.userId });
  if (existing) return res.json({ share: existing });
  try {
    res.status(201).json({ share: await Share.create({ user: req.userId, note: note._id, token: newToken() }) });
  } catch (err) {
    if (err?.code !== 11000) throw err; // two creates raced: return the one that won
    res.json({ share: await Share.findOne({ note: note._id, user: req.userId }) });
  }
}));

// New token: the old link stops working at once.
router.post('/notes/:id/share/rotate', requireAuth, asyncHandler(async (req, res) => {
  const note = await ownNoteForShare(req);
  shareable(note);
  const share = await Share.findOneAndUpdate({ note: note._id, user: req.userId }, { $set: { token: newToken() } }, { new: true });
  if (!share) throw new HttpError(404, 'This note isn’t shared');
  res.json({ share });
}));

router.delete('/notes/:id/share', requireAuth, asyncHandler(async (req, res) => {
  const note = await ownNoteForShare(req);
  await Share.deleteOne({ note: note._id, user: req.userId });
  res.status(204).end();
}));

// ---- Public ----

async function limit(req, key, lim) {
  if (bypassed(req)) return;
  const r = await hit(key, lim);
  if (r.count > lim.max) throw tooMany('Too many requests for shared notes.', r.resetAt);
}
// The live share for a token, or 404 (unknown/revoked token, locked or trashed note: all look the same).
async function liveShare(req, ipLimit) {
  const { token } = req.params;
  await limit(req, `${ipLimit}:${clientIp(req)}`, LIMITS[ipLimit]);
  if (!TOKEN_RE.test(token || '')) throw new HttpError(404, 'This link doesn’t work any more');
  await limit(req, `shareToken:${token}`, LIMITS.shareToken);
  const share = await Share.findOne({ token }).lean();
  const note = share && await Note.findOne({ _id: share.note, user: share.user }).select('title emoji content locked deletedAt updatedAt').lean();
  if (!note || note.locked || note.deletedAt) throw new HttpError(404, 'This link doesn’t work any more');
  return { share, note };
}
function publicHeaders(res, share) {
  res.set('X-Robots-Tag', share.allowIndexing ? 'all' : 'noindex, nofollow, noarchive');
  res.set('Referrer-Policy', 'no-referrer');
}

router.get('/public/shares/:token', asyncHandler(async (req, res) => {
  const { share, note } = await liveShare(req, 'shareViewIp');
  publicHeaders(res, share);
  const ids = [...imageIdsIn(note.content)];
  const images = ids.length ? await Image.find({ _id: { $in: ids }, note: note._id, user: share.user }).select('width height').lean() : [];
  res.json({
    note: { title: note.title, emoji: note.emoji, content: note.content, updatedAt: note.updatedAt },
    images: images.map((i) => ({ _id: i._id, width: i.width, height: i.height })),
    indexable: Boolean(share.allowIndexing),
  });
}));

// Only images that belong to the shared note AND appear in its current text.
router.get('/public/shares/:token/images/:imageId', asyncHandler(async (req, res) => {
  const { share, note } = await liveShare(req, 'shareImageIp');
  const { imageId } = req.params;
  if (!mongoose.isValidObjectId(imageId) || !imageIdsIn(note.content).has(imageId)) throw new HttpError(404, 'Image not found');
  const img = await Image.findOne({ _id: imageId, note: note._id, user: share.user }).select('+data').lean();
  if (!img) throw new HttpError(404, 'Image not found');
  const buf = Buffer.from(img.data.buffer ?? img.data);
  publicHeaders(res, share);
  res.set({
    'Content-Type': img.mime,
    'Content-Length': buf.length,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    'Cache-Control': 'private, no-store', // revoking or locking takes effect at once
    'Cross-Origin-Resource-Policy': 'same-site', // the page is same-origin in production; same-site lets a split API host (and local dev) work
  });
  res.end(buf);
}));

export default router;
