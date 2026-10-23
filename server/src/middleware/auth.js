import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import User from '../models/User.js';
import RevokedSession from '../models/RevokedSession.js';
import { HttpError } from './error.js';

// The key a single session is revoked under: its sid, or (tokens issued without one) the token's hash.
export const sessionKey = (payload, token) => (payload.sid ? `sid:${payload.sid}` : `tok:${createHash('sha256').update(token).digest('base64url')}`);

// Verifies the bearer token and that it hasn't been revoked: the token version must match the user's
// (sign out everywhere, password change) and this session must not have logged out.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Authentication required'));
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next(new HttpError(401, 'Invalid or expired token'));
  }
  if (payload.typ && payload.typ !== 'access') return next(new HttpError(401, 'Invalid token'));
  try {
    const key = sessionKey(payload, token);
    const [user, revoked] = await Promise.all([
      User.findById(payload.sub).select('tokenVersion lockPinVersion').lean(),
      RevokedSession.exists({ _id: key }),
    ]);
    if (!user) return next(new HttpError(401, 'User not found'));
    if (revoked) return next(new HttpError(401, 'You were logged out. Please log in again.'));
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) return next(new HttpError(401, 'Session expired, please log in again'));
    req.userId = payload.sub;
    req.tokenVersion = user.tokenVersion ?? 0;
    req.lockPinVersion = user.lockPinVersion ?? 0;
    req.sessionId = payload.sid || null;
    req.sessionKey = key;
    req.tokenExp = payload.exp ? new Date(payload.exp * 1000) : null;
    next();
  } catch (err) {
    next(err);
  }
}

export function signToken(userOrId, tokenVersion, sid) {
  const id = userOrId?._id ?? userOrId;
  const tv = tokenVersion ?? userOrId?.tokenVersion ?? 0;
  // Every token carries a session id so it can be logged out on its own (sign-in activity may not
  // have been recorded; then the id is fresh and simply has no activity row).
  return jwt.sign({ sub: String(id), tv, typ: 'access', sid: String(sid || new mongoose.Types.ObjectId()) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}
