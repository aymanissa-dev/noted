import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { HttpError } from '../middleware/error.js';

export const PIN_RE = /^\d{4,6}$/; // accepted when checking (older PINs may be 4–5 digits)
export const NEW_PIN_RE = /^\d{6}$/; // required when setting a PIN
export const FREE_PIN_FAILURES = 5; // wrong PINs before any wait
export const PIN_BLOCK_MS = 5 * 60 * 1000; // first wait; doubles with every further wrong PIN
export const MAX_PIN_BLOCK_MS = 24 * 60 * 60 * 1000;
export const PIN_LOCKOUT_FAILURES = 10; // then PIN entry stays off until the account password is entered
const UNLOCK_TTL = '15m';

export const hashPin = (pin) => bcrypt.hash(pin, 10);

// Wait imposed after `failures` wrong PINs in a row: none for the first 4, then 5 min, 10, 20, 40…
// The count only resets on a correct PIN, a new PIN, or the account password — never by waiting —
// so the budget is 10 guesses in total (about 2h 35m of waiting), not 5 every 5 minutes.
export const pinBlockMs = (failures) => (failures < FREE_PIN_FAILURES ? 0 : Math.min(PIN_BLOCK_MS * 2 ** (failures - FREE_PIN_FAILURES), MAX_PIN_BLOCK_MS));

export const resetPinAttempts = (userId) => User.updateOne({ _id: userId }, { lockPinFailures: 0, lockPinBlockedUntil: null, lockPinLockedOut: false });

const waitText = (ms) => {
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  const h = Math.round(mins / 60); return `${h} ${h === 1 ? 'hour' : 'hours'}`;
};
const lockedOut = () => Object.assign(new HttpError(429, 'Too many wrong PIN attempts. Enter your account password to use your PIN again, or set a new PIN in Settings.'), { extra: { attemptsLeft: 0, passwordRequired: true } });

// Verifies the user's lock PIN with a persistent (serverless-safe) limit: exponential waits that
// don't reset the budget, then a lockout that needs the account password.
export async function verifyLockPin(userId, pin) {
  const user = await User.findById(userId).select('+lockPinHash +lockPinFailures +lockPinBlockedUntil +lockPinLockedOut');
  if (!user) throw new HttpError(401, 'User not found');
  if (!user.hasLockPin || !user.lockPinHash) throw new HttpError(400, 'Set a lock PIN in Settings first');
  if (user.lockPinLockedOut) throw lockedOut();
  if (user.lockPinBlockedUntil && user.lockPinBlockedUntil > new Date()) {
    const ms = user.lockPinBlockedUntil - Date.now();
    throw Object.assign(new HttpError(429, `Too many wrong PIN attempts. Try again in ${waitText(ms)}.`), { extra: { attemptsLeft: 0, retryAfter: Math.ceil(ms / 1000) } });
  }
  const ok = typeof pin === 'string' && PIN_RE.test(pin) && (await bcrypt.compare(pin, user.lockPinHash));
  if (!ok) {
    // Atomic increment, so parallel guesses can't share one count.
    const { lockPinFailures: failures } = await User.findOneAndUpdate({ _id: user._id }, { $inc: { lockPinFailures: 1 } }, { new: true }).select('+lockPinFailures').lean();
    if (failures >= PIN_LOCKOUT_FAILURES) {
      await User.updateOne({ _id: user._id }, { lockPinLockedOut: true, lockPinBlockedUntil: null });
      throw lockedOut();
    }
    const block = pinBlockMs(failures);
    if (block) {
      await User.updateOne({ _id: user._id }, { lockPinBlockedUntil: new Date(Date.now() + block) });
      throw Object.assign(new HttpError(429, `Too many wrong PIN attempts. Try again in ${waitText(block)}.`), { extra: { attemptsLeft: 0, retryAfter: block / 1000 } });
    }
    const left = FREE_PIN_FAILURES - failures;
    throw Object.assign(new HttpError(403, `Incorrect PIN. ${left} ${left === 1 ? 'attempt' : 'attempts'} left before a wait.`), { extra: { attemptsLeft: left } });
  }
  const set = {};
  if (user.lockPinFailures || user.lockPinBlockedUntil) Object.assign(set, { lockPinFailures: 0, lockPinBlockedUntil: null });
  if (pin.length < 6 && !user.lockPinShort) set.lockPinShort = true; // Settings suggests upgrading to 6 digits
  if (Object.keys(set).length) await User.updateOne({ _id: user._id }, set);
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
