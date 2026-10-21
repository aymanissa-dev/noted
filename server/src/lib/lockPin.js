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

const blockedError = (until) => {
  const ms = Math.max(1000, until - Date.now());
  return Object.assign(new HttpError(429, `Too many wrong PIN attempts. Try again in ${waitText(ms)}.`), { extra: { attemptsLeft: 0, retryAfter: Math.ceil(ms / 1000) } });
};

// Verifies the user's lock PIN with a persistent (serverless-safe) limit: exponential waits that
// don't reset the budget, then a lockout that needs the account password.
//
// Each attempt is reserved in ONE atomic, conditional update before the PIN is compared: the
// filter only matches when PIN entry isn't locked out or waiting, and the same update counts the
// attempt and — pessimistically, as if it will be wrong — sets the wait / lockout it would cause.
// So a burst of parallel guesses can't share a count or squeeze in between "check" and "block":
// with 0 failures, exactly 5 of 50 parallel guesses are compared and the rest get the wait.
// A correct PIN clears it all.
export async function verifyLockPin(userId, pin) {
  const user = await User.findById(userId).select('+lockPinHash');
  if (!user) throw new HttpError(401, 'User not found');
  if (!user.hasLockPin || !user.lockPinHash) throw new HttpError(400, 'Set a lock PIN in Settings first');
  const now = new Date();
  const n = { $add: [{ $ifNull: ['$lockPinFailures', 0] }, 1] }; // failures if this attempt is wrong
  const reserved = await User.findOneAndUpdate(
    { _id: user._id, lockPinLockedOut: { $ne: true }, $or: [{ lockPinBlockedUntil: null }, { lockPinBlockedUntil: { $lte: now } }] },
    [
      { $set: { lockPinFailures: n } },
      { $set: {
        lockPinBlockedUntil: { $cond: [{ $gte: ['$lockPinFailures', FREE_PIN_FAILURES] },
          { $add: [now, { $min: [{ $multiply: [PIN_BLOCK_MS, { $pow: [2, { $subtract: ['$lockPinFailures', FREE_PIN_FAILURES] }] }] }, MAX_PIN_BLOCK_MS] }] }, null] },
        lockPinLockedOut: { $gte: ['$lockPinFailures', PIN_LOCKOUT_FAILURES] },
      } },
    ],
    { new: true },
  ).select('+lockPinFailures +lockPinBlockedUntil +lockPinLockedOut').lean();
  if (!reserved) {
    const cur = await User.findById(user._id).select('+lockPinBlockedUntil +lockPinLockedOut').lean();
    if (cur?.lockPinLockedOut) throw lockedOut();
    throw blockedError(cur?.lockPinBlockedUntil || new Date(Date.now() + PIN_BLOCK_MS));
  }
  const ok = typeof pin === 'string' && PIN_RE.test(pin) && (await bcrypt.compare(pin, user.lockPinHash));
  if (!ok) {
    const failures = reserved.lockPinFailures;
    if (reserved.lockPinLockedOut) throw lockedOut();
    const block = pinBlockMs(failures);
    if (block) throw Object.assign(new HttpError(429, `Too many wrong PIN attempts. Try again in ${waitText(block)}.`), { extra: { attemptsLeft: 0, retryAfter: block / 1000 } });
    const left = FREE_PIN_FAILURES - failures;
    throw Object.assign(new HttpError(403, `Incorrect PIN. ${left} ${left === 1 ? 'attempt' : 'attempts'} left before a wait.`), { extra: { attemptsLeft: left } });
  }
  const set = { lockPinFailures: 0, lockPinBlockedUntil: null, lockPinLockedOut: false };
  if (pin.length < 6 && !user.lockPinShort) set.lockPinShort = true; // Settings suggests upgrading to 6 digits
  await User.updateOne({ _id: user._id }, set);
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
