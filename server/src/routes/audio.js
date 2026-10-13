import express, { Router } from 'express';
import mongoose from 'mongoose';
import AudioClip, { AUDIO_MAX_BYTES, AUDIO_MAX_PER_USER, AUDIO_MAX_SECONDS, AUDIO_TYPES } from '../models/AudioClip.js';
import Note from '../models/Note.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { hasUnlock } from '../lib/lockPin.js';

// Mounted at /api, so auth is per route (not router-wide).
const router = Router();

const baseType = (t = '') => String(t).split(';')[0].trim().toLowerCase();

async function ownNote(req, id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid id');
  const note = await Note.findOne({ _id: id, user: req.userId }).select('locked lockPinVersion user');
  if (!note) throw new HttpError(404, 'Note not found');
  // Voice notes of a locked note are hidden until it's unlocked (same unlock token as the text).
  if (note.locked && !hasUnlock(req, note)) throw new HttpError(423, 'This note is locked');
  return note;
}
async function ownClip(req) {
  if (!mongoose.isValidObjectId(req.params.clipId)) throw new HttpError(400, 'Invalid id');
  const clip = await AudioClip.findOne({ _id: req.params.clipId, user: req.userId });
  if (!clip) throw new HttpError(404, 'Voice note not found');
  await ownNote(req, clip.note);
  return clip;
}

// List a note's voice notes (metadata only).
router.get('/notes/:id/audio', requireAuth, asyncHandler(async (req, res) => {
  const note = await ownNote(req, req.params.id);
  const clips = await AudioClip.find({ note: note._id, user: req.userId }).sort({ createdAt: 1 });
  res.json({ clips });
}));

// Upload: raw audio body (Content-Type audio/*), duration in seconds in X-Audio-Duration.
router.post('/notes/:id/audio', requireAuth,
  express.raw({ type: (req) => baseType(req.headers['content-type']).startsWith('audio/'), limit: AUDIO_MAX_BYTES }),
  asyncHandler(async (req, res) => {
    const note = await ownNote(req, req.params.id);
    const mime = baseType(req.get('content-type'));
    if (!AUDIO_TYPES.includes(mime)) throw new HttpError(415, 'Unsupported audio format');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'No audio received');
    const duration = Math.max(0, Math.round(Number(req.get('x-audio-duration')) || 0));
    if (duration > AUDIO_MAX_SECONDS) throw new HttpError(400, 'Voice notes can be at most 5 minutes');
    if (await AudioClip.countDocuments({ user: req.userId }) >= AUDIO_MAX_PER_USER) throw new HttpError(400, `You can keep at most ${AUDIO_MAX_PER_USER} voice notes`);
    const clip = await AudioClip.create({ user: req.userId, note: note._id, mime, size: req.body.length, duration, data: req.body });
    res.status(201).json({ clip });
  }));

// Owner-only streaming, with Range support for seeking. Never cached.
router.get('/audio/:clipId', requireAuth, asyncHandler(async (req, res) => {
  const meta = await ownClip(req);
  const { data } = await AudioClip.findById(meta._id).select('+data').lean();
  const buf = Buffer.from(data.buffer ?? data);
  res.set({ 'Content-Type': meta.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.get('range') || '');
  if (m) {
    let start = m[1] === '' ? buf.length - Number(m[2]) : Number(m[1]);
    let end = m[1] !== '' && m[2] !== '' ? Number(m[2]) : buf.length - 1;
    if (Number.isNaN(start) || start < 0 || start >= buf.length || end < start) { res.set('Content-Range', `bytes */${buf.length}`); return res.status(416).end(); }
    end = Math.min(end, buf.length - 1);
    res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': end - start + 1 });
    return res.end(buf.subarray(start, end + 1));
  }
  res.set('Content-Length', buf.length).end(buf);
}));

router.delete('/audio/:clipId', requireAuth, asyncHandler(async (req, res) => {
  const clip = await ownClip(req);
  await clip.deleteOne();
  res.status(204).end();
}));

export default router;
