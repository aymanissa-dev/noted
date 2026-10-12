import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Note from '../models/Note.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { requireAuth, signToken } from '../middleware/auth.js';

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

  const user = await User.create({ name, email, password: await bcrypt.hash(password, 12) });
  res.status(201).json({ token: signToken(user._id), user });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw new HttpError(400, 'Email and password are required');
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  res.json({ token: signToken(user._id), user });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
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
  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();
  res.json({ ok: true });
}));

// Permanently delete the account and every note it owns. Requires the password.
router.delete('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await verifyPassword(req.userId, req.body?.password);
  const { deletedCount } = await Note.deleteMany({ user: user._id });
  await user.deleteOne();
  res.json({ ok: true, deletedNotes: deletedCount });
}));

export default router;
