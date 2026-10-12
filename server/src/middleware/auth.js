import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { HttpError } from './error.js';

// Verifies the bearer token and that it hasn't been revoked (token version must match the user's).
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
    const user = await User.findById(payload.sub).select('tokenVersion').lean();
    if (!user) return next(new HttpError(401, 'User not found'));
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) return next(new HttpError(401, 'Session expired, please log in again'));
    req.userId = payload.sub;
    req.tokenVersion = user.tokenVersion ?? 0;
    next();
  } catch (err) {
    next(err);
  }
}

export function signToken(userOrId, tokenVersion) {
  const id = userOrId?._id ?? userOrId;
  const tv = tokenVersion ?? userOrId?.tokenVersion ?? 0;
  return jwt.sign({ sub: String(id), tv, typ: 'access' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}
