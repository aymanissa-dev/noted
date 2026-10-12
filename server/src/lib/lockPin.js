import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { HttpError } from '../middleware/error.js';

export const PIN_RE = /^\d{4,6}$/;
export const MAX_PIN_FAILURES = 5;
export const PIN_BLOCK_MS = 5 * 60 * 1000;
const UNLOCK_TTL = '15m';

export const hashPin = (pin) => bcrypt.hash(pin, 10);

// Verifies the user's lock PIN with a persistent (serverless-safe) rate limit:
// after MAX_PIN_FAILURES wrong attempts, PIN checks are blocked for PIN_BLOCK_MS.
export async function verifyLockPin(userId, pin) {
  const user = await User.findById(userId).select('+lockPinHash +lockPinFailures +lockPinBlockedUntil');
  if (!user) throw new HttpError(401, 'User not found');
  if (!user.hasLockPin || !user.lockPinHash) throw new HttpError(400, 'Set a lock PIN in Settings first');
  if (user.lockPinBlockedUntil && user.lockPinBlockedUntil > new Date()) {
    const secs = Math.ceil((user.lockPinBlockedUntil - Date.now()) / 1000);
    throw new HttpError(429, `Too many wrong PIN attempts. Try again in ${Math.ceil(secs / 60)} minute(s).`);
  }
  const ok = typeof pin === 'string' && PIN_RE.test(pin) && (await bcrypt.compare(pin, user.lockPinHash));
  if (!ok) {
    const failures = (user.lockPinFailures || 0) + 1;
    const update = failures >= MAX_PIN_FAILURES
      ? { lockPinFailures: 0, lockPinBlockedUntil: new Date(Date.now() + PIN_BLOCK_MS) }
      : { lockPinFailures: failures };
    await User.updateOne({ _id: user._id }, update);
    throw new HttpError(403, 'Incorrect PIN');
  }
  if (user.lockPinFailures || user.lockPinBlockedUntil) {
    await User.updateOne({ _id: user._id }, { lockPinFailures: 0, lockPinBlockedUntil: null });
  }
  return user;
}

export function signUnlockToken(user, noteId) {
  return jwt.sign(
    { sub: String(user._id), nid: String(noteId), typ: 'unlock', tv: user.tokenVersion ?? 0, pv: user.lockPinVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: UNLOCK_TTL },
  );
}

// True if the request carries a valid unlock token for this note (header X-Unlock-Token).
export function hasUnlock(req, note) {
  const token = req.get('x-unlock-token');
  if (!token) return false;
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    return p.typ === 'unlock' && p.sub === String(req.userId) && p.nid === String(note._id)
      && p.tv === (req.tokenVersion ?? 0) && p.pv === (req.lockPinVersion ?? 0);
  } catch {
    return false;
  }
}
