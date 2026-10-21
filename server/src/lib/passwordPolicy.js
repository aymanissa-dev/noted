// Password rules for new passwords (sign-up and password change). Login is never affected.
// 1. 8–200 characters.  2. Not a well-known common password, and not built from the user's own
// name/email.  3. Not in a known breach, via Have I Been Pwned's k-anonymity range API: only the
// first 5 hex chars of the SHA-1 leave the server, and the check fails open (timeout / offline).
import crypto from 'node:crypto';
import COMMON from './commonPasswords.js';
import { HttpError } from '../middleware/error.js';

const common = new Set(COMMON.split('\n'));
export const MIN_LENGTH = 8;
export const MAX_LENGTH = 200;

const strip = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// "Password1!", "qwerty2024" etc.: a common word with digits/symbols tacked on.
const baseWord = (pw) => pw.toLowerCase().replace(/[\d!@#$%^&*()_+=.,?-]+$/, '').replace(/^[\d!@#$%^&*()_+=.,?-]+/, '');

export function localProblem(password, { email = '', name = '' } = {}) {
  const pw = String(password || '');
  if (pw.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters`;
  if (pw.length > MAX_LENGTH) return `Password must be at most ${MAX_LENGTH} characters`;
  const local = strip(String(email).split('@')[0]);
  const parts = [local, ...String(name).toLowerCase().split(/\s+/).map(strip)].filter((p) => p.length >= 4);
  if (parts.some((p) => strip(pw) === p || (strip(pw).includes(p) && strip(pw).length - p.length <= 4))) {
    return 'Your password shouldn’t be based on your name or email. Try something unrelated.';
  }
  const lower = pw.toLowerCase();
  const base = baseWord(pw);
  if (common.has(lower) || (base.length >= 4 && (common.has(base) || ['password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'iloveyou', 'admin', 'noted'].includes(base)))) {
    return 'That password is too common and easy to guess. Try a few unrelated words or a longer phrase.';
  }
  if (/^(.)\1+$/.test(pw) || '01234567890123456789'.includes(pw) || 'abcdefghijklmnopqrstuvwxyz'.includes(lower) || 'qwertyuiopasdfghjklzxcvbnm'.includes(lower)) {
    return 'That password is a simple pattern and easy to guess. Try a few unrelated words or a longer phrase.';
  }
  return null;
}

// Returns the breach count (0 = not found), or null when the check couldn't run.
export async function breachCount(password, { timeoutMs = 1500, fetchImpl = globalThis.fetch } = {}) {
  if (process.env.PASSWORD_BREACH_CHECK === 'off' || !fetchImpl) return null;
  const sha = crypto.createHash('sha1').update(String(password)).digest('hex').toUpperCase();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`https://api.pwnedpasswords.com/range/${sha.slice(0, 5)}`, { signal: ctrl.signal, headers: { 'Add-Padding': 'true', 'User-Agent': 'noted-app' } });
    if (!r.ok) return null;
    const suffix = sha.slice(5);
    for (const line of (await r.text()).split('\n')) {
      const [s, n] = line.trim().split(':');
      if (s === suffix) return Number(n) || 0;
    }
    return 0;
  } catch { return null; } finally { clearTimeout(t); }
}

// Throws a 400 with a clear message when the password isn't acceptable.
export async function assertGoodPassword(password, who = {}, opts) {
  const problem = localProblem(password, who);
  if (problem) throw new HttpError(400, problem, { field: 'password', reason: 'weak' });
  const n = await breachCount(password, opts);
  if (n > 0) throw new HttpError(400, `That password has shown up in ${n.toLocaleString('en-US')} known data breach${n === 1 ? '' : 'es'}, so attackers try it first. Please choose a different one.`, { field: 'password', reason: 'breached' });
}
