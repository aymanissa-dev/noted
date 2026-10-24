import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User, { ACCENTS } from '../models/User.js';
import Note from '../models/Note.js';
import NoteVersion from '../models/NoteVersion.js';
import Folder from '../models/Folder.js';
import LoginEvent, { ACTIVITY_LIMIT } from '../models/LoginEvent.js';
import AudioClip from '../models/AudioClip.js';
import Image from '../models/Image.js';
import RevokedSession from '../models/RevokedSession.js';
import { maskIp, parseUserAgent } from '../lib/useragent.js';
import { asyncHandler, HttpError, REGISTER_FAILED } from '../middleware/error.js';
import { LIMITS, bypassed, clientIp, network, reserve, release, clear, tooMany, failureDelay, sleep } from '../lib/rateLimit.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { hashPin, NEW_PIN_RE, resetPinAttempts } from '../lib/lockPin.js';

// Cost 10 is ~4x faster than 12 and still strong; older cost-12 hashes are upgraded on login.
export const BCRYPT_COST = 10;

import { createWelcomeNote } from '../lib/welcome.js';
import { assertGoodPassword, localProblem } from '../lib/passwordPolicy.js';

const router = Router();
// Record a sign-in and keep only the newest ACTIVITY_LIMIT. Returns the event id (stored in the token as sid).
async function recordSignIn(req, user, kind) {
  try {
    const city = req.get('x-vercel-ip-city'); const country = req.get('x-vercel-ip-country');
    const location = [city && decodeURIComponent(city), country].filter(Boolean).join(', ');
    const ev = await LoginEvent.create({ user: user._id, kind, ...parseUserAgent(req.get('user-agent')), ip: maskIp(req.ip), location, tv: user.tokenVersion ?? 0 });
    const old = await LoginEvent.find({ user: user._id }).sort({ at: -1 }).skip(ACTIVITY_LIMIT).select('_id').lean();
    if (old.length) await LoginEvent.deleteMany({ _id: { $in: old.map((o) => o._id) } });
    return ev._id;
  } catch { return null; } // activity is best effort; never block sign-in
}

// After revoking other sessions, re-issue this session's token (same sid) and keep its activity row active.
async function keepSession(req, user) {
  if (req.sessionId) await LoginEvent.updateOne({ _id: req.sessionId, user: user._id }, { $set: { tv: user.tokenVersion } }).catch(() => {});
  return signToken(user, undefined, req.sessionId);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Compared against when the email has no account, so a missing account takes as long as a wrong password.
const DUMMY_HASH = '$2a$10$6TQtWefznh0F/InmBLdwOuUh9Cy8Zwwx3hHcMz6X2Ww61Gw9zbfii';

router.post('/register', asyncHandler(async (req, res) => {
  // Every attempt counts (valid or not), so the endpoint can't be used to probe emails in bulk.
  if (!bypassed(req)) {
    const ip = clientIp(req);
    const [r, n] = await Promise.all([reserve(`register-ip:${ip}`, LIMITS.registerIp), reserve(`register-net:${network(ip)}`, LIMITS.registerNet)]);
    if (r.over) throw tooMany('Too many sign-ups from this network.', r.resetAt);
    if (n.over) throw tooMany('Too many sign-ups from this network.', n.resetAt);
  }
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!name) throw new HttpError(400, 'Name is required');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'A valid email is required');
  const weak = localProblem(password, { email, name });
  if (weak) throw new HttpError(400, weak, { field: 'password' });
  await assertGoodPassword(password, { email, name }); // + breach check
  // Hash before looking the email up, so an existing account answers in the same time, and with the
  // same generic message as any other sign-up that can't go through (no "email already registered").
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  if (await User.exists({ email })) throw new HttpError(400, REGISTER_FAILED, { code: 'register_failed' });

  const user = await User.create({ name, email, password: hash });
  const sid = await recordSignIn(req, user, 'register');
  if (req.body?.sample === true) await createWelcomeNote(user._id).catch(() => {}); // first-run tour (web sign-ups)
  res.status(201).json({ token: signToken(user, undefined, sid), user });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw new HttpError(400, 'Email and password are required');
  // Failed sign-ins are limited per email and per IP (fixed 15-minute windows, never permanent);
  // repeated failures also slow down. A successful sign-in clears the email's counter.
  const limited = !bypassed(req);
  const ip = clientIp(req);
  const emailKey = `login-email:${email}`; const ipKey = `login-ip:${ip}`; const netKey = `login-net:${network(ip)}`;
  // Every attempt is reserved (counted atomically) before the password is checked, so parallel
  // guesses can't slip past the limit; a successful sign-in hands its reservations back.
  let e;
  if (limited) {
    const [re, ri, rn] = await Promise.all([reserve(emailKey, LIMITS.loginEmail), reserve(ipKey, LIMITS.loginIp), reserve(netKey, LIMITS.loginNet)]);
    const blocked = [[re, emailKey, 'for this account'], [ri, ipKey, 'from this network'], [rn, netKey, 'from this network']].filter(([r]) => r.over);
    if (blocked.length) {
      // Refused without checking the password: hand back the reservations on the other counters,
      // so a burst against one account doesn't also use up the whole network's budget.
      await Promise.all([[re, emailKey], [ri, ipKey], [rn, netKey]].filter(([r]) => !r.over).map(([, k]) => release(k)));
      const [[r, , where]] = blocked;
      throw tooMany(`Too many sign-in attempts ${where}.`, r.resetAt);
    }
    e = re;
  }
  const user = await User.findOne({ email }).select('+password');
  const match = await bcrypt.compare(password, user?.password || DUMMY_HASH); // same cost either way
  if (!user || !match) {
    if (limited) {
      await sleep(failureDelay(e.count));
      if (e.count >= LIMITS.loginEmail.max) throw tooMany('Too many sign-in attempts for this account.', e.resetAt);
    }
    throw new HttpError(401, 'Invalid email or password');
  }
  if (limited) await Promise.all([clear(emailKey).catch(() => {}), release(ipKey), release(netKey)]);
  if (bcrypt.getRounds(user.password) !== BCRYPT_COST) {
    await User.updateOne({ _id: user._id }, { password: await bcrypt.hash(password, BCRYPT_COST) });
  }
  const sid = await recordSignIn(req, user, 'login');
  res.json({ token: signToken(user, undefined, sid), user });
}));

// Recent sign-ins (newest first). `active`: that session is still valid; `current`: this one.
router.get('/activity', requireAuth, asyncHandler(async (req, res) => {
  const events = await LoginEvent.find({ user: req.userId }).sort({ at: -1 }).limit(ACTIVITY_LIMIT).lean();
  res.json({ events: events.map(({ _id, at, kind, browser, os, device, ip, location, tv, endedAt }) => ({
    _id, at, kind, browser, os, device, ip, location,
    active: (tv ?? 0) === req.tokenVersion && !endedAt,
    current: req.sessionId === String(_id),
  })) });
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

// Account password re-checks (change password, PIN, delete account): a stolen session can't be
// used to guess the password either — 5 wrong answers per 15 minutes per account.
async function verifyPassword(userId, password, req) {
  if (!password) throw new HttpError(400, 'Current password is required');
  const key = `password:${userId}`; const limited = !bypassed(req);
  let r;
  if (limited) { r = await reserve(key, LIMITS.password); if (r.over) throw tooMany('Too many wrong passwords.', r.resetAt); } // atomic, before bcrypt
  const user = await User.findById(userId).select('+password');
  if (!user) throw new HttpError(401, 'User not found');
  if (!(await bcrypt.compare(String(password), user.password))) {
    if (limited) {
      await sleep(failureDelay(r.count));
      if (r.count >= LIMITS.password.max) throw tooMany('Too many wrong passwords.', r.resetAt);
    }
    throw new HttpError(403, 'Incorrect password');
  }
  if (limited) await clear(key).catch(() => {});
  return user;
}

router.patch('/password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = await verifyPassword(req.userId, currentPassword, req);
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new HttpError(400, 'New password must be at least 8 characters', { field: 'newPassword' });
  }
  if (newPassword === currentPassword) throw new HttpError(400, 'Choose a password different from your current one', { field: 'newPassword' });
  await assertGoodPassword(newPassword, { email: user.email, name: user.name });
  user.password = await bcrypt.hash(newPassword, BCRYPT_COST);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // sign out other devices
  await user.save();
  res.json({ ok: true, token: await keepSession(req, user) }); // keep this session
}));

// Sign out of all devices: revokes every existing token, then issues a fresh one for this session.
// Log out this session only: its token (and any copy of it) stops working right away, everywhere.
router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  const expireAt = req.tokenExp || new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await RevokedSession.updateOne({ _id: req.sessionKey }, { $setOnInsert: { user: req.userId, expireAt } }, { upsert: true });
  // The activity list shows this sign-in as ended.
  if (req.sessionId && mongoose.isValidObjectId(req.sessionId)) await LoginEvent.updateOne({ _id: req.sessionId, user: req.userId }, { $set: { endedAt: new Date() } }).catch(() => {});
  res.status(204).end();
}));

router.post('/logout-all', requireAuth, asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.userId, { $inc: { tokenVersion: 1 } }, { new: true });
  if (!user) throw new HttpError(401, 'User not found');
  res.json({ ok: true, token: await keepSession(req, user) });
}));

// Permanently delete the account and every note it owns. Requires the password.
router.delete('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await verifyPassword(req.userId, req.body?.password, req);
  await NoteVersion.deleteMany({ user: user._id });
  await Folder.deleteMany({ user: user._id });
  await LoginEvent.deleteMany({ user: user._id });
  await RevokedSession.deleteMany({ user: user._id });
  await AudioClip.deleteMany({ user: user._id });
  await Image.deleteMany({ user: user._id });
  const { deletedCount } = await Note.deleteMany({ user: user._id });
  await user.deleteOne();
  res.json({ ok: true, deletedNotes: deletedCount });
}));

// Set or change the lock PIN. Requires the account password.
router.put('/lock-pin', requireAuth, asyncHandler(async (req, res) => {
  const { password, pin } = req.body || {};
  const user = await verifyPassword(req.userId, password, req);
  // New PINs are 6 digits (existing 4–5 digit PINs keep working until changed).
  if (typeof pin !== 'string' || !NEW_PIN_RE.test(pin)) throw new HttpError(400, 'PIN must be 6 digits');
  user.lockPinHash = await hashPin(pin);
  user.hasLockPin = true;
  user.lockPinVersion = (user.lockPinVersion ?? 0) + 1; // expire outstanding unlock tokens
  user.set({ lockPinFailures: 0, lockPinBlockedUntil: null, lockPinLockedOut: false, lockPinShort: false });
  await user.save();
  res.json({ user });
}));

// After too many wrong PINs, PIN entry stays off until the account password is entered here
// (or a new PIN is set). Resets the wrong-PIN count.
router.post('/lock-pin/unblock', requireAuth, asyncHandler(async (req, res) => {
  const user = await verifyPassword(req.userId, req.body?.password, req);
  await resetPinAttempts(user._id);
  res.json({ ok: true });
}));

// Remove the lock PIN. Requires the password; every locked note becomes unlocked.
router.delete('/lock-pin', requireAuth, asyncHandler(async (req, res) => {
  const user = await verifyPassword(req.userId, req.body?.password, req);
  user.lockPinHash = null;
  user.hasLockPin = false;
  user.lockPinVersion = (user.lockPinVersion ?? 0) + 1;
  user.set({ lockPinFailures: 0, lockPinBlockedUntil: null, lockPinLockedOut: false, lockPinShort: false });
  await user.save();
  const { modifiedCount } = await Note.updateMany({ user: user._id, locked: true }, { locked: false }, { timestamps: false });
  res.json({ user, unlockedNotes: modifiedCount });
}));

export default router;
