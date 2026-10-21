import RateLimit from '../models/RateLimit.js';
import { HttpError } from '../middleware/error.js';

// Serverless-safe rate limits (MongoDB-backed fixed windows). Nothing here is permanent: every
// counter expires with its window, so a real user is never locked out for longer than that.
export const LIMITS = {
  loginEmail: { max: 5, windowMs: 15 * 60 * 1000 }, // failed sign-ins per email
  loginIp: { max: 20, windowMs: 15 * 60 * 1000 }, // failed sign-ins per IP (offices/NAT share IPs)
  registerIp: { max: 20, windowMs: 60 * 60 * 1000 }, // sign-up attempts per IP
  password: { max: 5, windowMs: 15 * 60 * 1000 }, // wrong account passwords per signed-in user
};

// Tests can switch limits off, but never on Vercel (production or preview): RATE_LIMITS=off for
// in-process server tests, or RATE_LIMIT_BYPASS_TOKEN + a matching X-Rate-Limit-Bypass header (local
// e2e helpers that create many accounts from one machine).
export function bypassed(req) {
  if (process.env.VERCEL) return false;
  if (process.env.RATE_LIMITS === 'off') return true;
  const token = process.env.RATE_LIMIT_BYPASS_TOKEN;
  return Boolean(token) && req?.get?.('x-rate-limit-bypass') === token;
}

// The caller's IP. On Vercel the edge sets x-vercel-forwarded-for / x-real-ip itself (a client can't
// spoof them); elsewhere only the socket address is trusted.
export function clientIp(req) {
  if (process.env.VERCEL) return req.get('x-vercel-forwarded-for')?.split(',')[0].trim() || req.get('x-real-ip') || req.ip;
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

export async function peek(key) {
  const doc = await RateLimit.findById(key).lean();
  return doc && doc.resetAt > new Date() ? doc : null;
}

// Count one event for `key`; returns the counter ({ count, resetAt }).
export async function hit(key, { windowMs }) {
  const now = new Date();
  const live = await RateLimit.findOneAndUpdate({ _id: key, resetAt: { $gt: now } }, { $inc: { count: 1 } }, { new: true }).lean();
  if (live) return live;
  const resetAt = new Date(now.getTime() + windowMs);
  try {
    return await RateLimit.findOneAndUpdate({ _id: key }, { $set: { count: 1, resetAt, expireAt: resetAt } }, { upsert: true, new: true }).lean();
  } catch (err) {
    if (err?.code !== 11000) throw err; // two first hits raced: count this one in the window just created
    return RateLimit.findOneAndUpdate({ _id: key }, { $inc: { count: 1 } }, { new: true }).lean();
  }
}

export const clear = (key) => RateLimit.deleteOne({ _id: key });

const minutes = (ms) => Math.max(1, Math.ceil(ms / 60000));
// 429 with Retry-After (set by the error handler from extra.retryAfter) and a message people can act on.
export function tooMany(message, resetAt) {
  const secs = Math.max(1, Math.ceil((new Date(resetAt) - Date.now()) / 1000));
  const m = minutes(secs * 1000);
  return new HttpError(429, `${message} Try again in ${m} ${m === 1 ? 'minute' : 'minutes'}.`, { retryAfter: secs });
}

// Progressive delay for repeated failures: 0, 0, 250ms, 500ms, 1s, 2s (cap).
export const failureDelay = (count) => (count < 3 ? 0 : Math.min(250 * 2 ** (count - 3), 2000));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
