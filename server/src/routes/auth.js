import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User, { ACCENTS } from '../models/User.js';
import Note from '../models/Note.js';
import NoteVersion from '../models/NoteVersion.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { hashPin, PIN_RE } from '../lib/lockPin.js';

// Cost 10 is ~4x faster than 12 and still strong; older cost-12 hashes are upgraded on login.
export const BCRYPT_COST = 10;

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!name) throw new HttpError(400, 'Name is required');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'A valid email is required');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (await User.exists({ email })) throw new HttpError(409, 'Email already registered');

  const user = await User.create({ name, email, password: await bcrypt.hash(password, BCRYPT_COST) });
  res.status(201).json({ token: signToken(user), user });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw new HttpError(400, 'Email and password are required');
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  if (bcrypt.getRounds(user.password) !== BCRYPT_COST) {
    await User.updateOne({ _id: user._id }, { password: await bcrypt.hash(password, BCRYPT_COST) });
  }
  res.json({ token: signToken(user), user });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(401, 'User not found');
  res.json({ user });
}));

// Per-user UI preferences (synced across devices).
router.patch('/preferences', requireAuth, asyncHandler(async (req, res) => {
  const set = {};
  if (req.body?.accent !== undefined) {
    if (!ACCENTS.includes(req.body.accent)) throw new HttpError(400, `accent must be one of: ${ACCENTS.join(', ')}`);
    set['preferences.accent'] = req.body.accent;
  }
  const user = await User.findByIdAndUpdate(req.userId, { $set: set }, { new: true });
  if (!user) throw new HttpError(401, 'User not found');
  res.json({ user });
}));

async function verifyPassword(userId, password) {
  if (!password) throw new HttpError(400, 'Current password is required');
  const user = await User.findById(userId).select('+password');
  if (!user) throw new HttpError(401, 'User not found');
  if (!(await bcrypt.compare(String(password), user.password))) throw new HttpError(403, 'Incorrect password');
  return user;
}

router.patch('/password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = await verifyPassword(req.userId, currentPassword);
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new HttpError(400, 'New password must be at least 8 characters');
  }
  user.password = await bcrypt.hash(newPassword, BCRYPT_COST);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // sign out other devices
  await user.save();
  res.json({ ok: true, token: signToken(user) }); // keep this session
}));

// Sign out of all devices: revokes every existing token, then issues a fresh one for this session.
router.post('/logout-all', requireAuth, asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.userId, { $inc: { tokenVersion: 1 } }, { new: true });
  if (!user) throw new HttpError(401, 'User not found');
  res.json({ ok: true, token: signToken(user) });
}));

// Permanently delete the account and every note it owns. Requires the password.
router.delete('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await verifyPassword(req.userId, req.body?.password);
  await NoteVersion.deleteMany({ user: user._id });
  const { deletedCount } = await Note.deleteMany({ user: user._id });
  await user.deleteOne();
  res.json({ ok: true, deletedNotes: deletedCount });
}));

// Set or change the lock PIN. Requires the account password.
router.put('/lock-pin', requireAuth, asyncHandler(async (req, res) => {
  const { password, pin } = req.body || {};
  const user = await verifyPassword(req.userId, password);
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) throw new HttpError(400, 'PIN must be 4 to 6 digits');
  user.lockPinHash = await hashPin(pin);
  user.hasLockPin = true;
  user.lockPinVersion = (user.lockPinVersion ?? 0) + 1; // expire outstanding unlock tokens
  user.set({ lockPinFailures: 0, lockPinBlockedUntil: null });
  await user.save();
  res.json({ user });
}));

// Remove the lock PIN. Requires the password; every locked note becomes unlocked.
router.delete('/lock-pin', requireAuth, asyncHandler(async (req, res) => {
  const user = await verifyPassword(req.userId, req.body?.password);
  user.lockPinHash = null;
  user.hasLockPin = false;
  user.lockPinVersion = (user.lockPinVersion ?? 0) + 1;
  await user.save();
  const { modifiedCount } = await Note.updateMany({ user: user._id, locked: true }, { locked: false }, { timestamps: false });
  res.json({ user, unlockedNotes: modifiedCount });
}));

export default router;
