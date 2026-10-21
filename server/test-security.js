// Security review fixes (2026-10-21): H1 sign-in/sign-up rate limits, M1 PIN backoff + lockout and
// 6-digit new PINs, L1 CORS allowlist, L2 generic sign-up failure, L3 constant-time login,
// L4 import folder cap, L5 locked-note deletes, I3 no Server-Timing in production, I4 export PIN in body.
// In-memory MongoDB; rate limits are ON here (no bypass).
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET = 'test-secret';
process.env.PASSWORD_BREACH_CHECK = 'off';
delete process.env.RATE_LIMITS; delete process.env.RATE_LIMIT_BYPASS_TOKEN;
const { createApp, allowedOrigin } = await import('./src/app.js');
const { default: User } = await import('./src/models/User.js');
const { default: RateLimit } = await import('./src/models/RateLimit.js');
const { hashPin, pinBlockMs, PIN_LOCKOUT_FAILURES } = await import('./src/lib/lockPin.js');
const { MAX_FOLDERS } = await import('./src/models/Folder.js');
const { network } = await import('./src/lib/rateLimit.js');

const mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri());
const server = createApp().listen(0); const base = `http://127.0.0.1:${server.address().port}/api`;
const call = async (method, path, body, { token, headers = {} } = {}) => {
  const r = await fetch(base + path, { method, headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let data; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data, headers: r.headers };
};
const PW = 'quiet-otter-lamp-91';
let n = 0; const check = (c, m) => { n++; assert.ok(c, m); };
const reg = async (email) => call('POST', '/auth/register', { name: 'Sec', email, password: PW });

try {
  // ---- H1 login: 5 failures per email in 15 min, progressive delay, Retry-After, success clears ----
  const u = (await reg('sec@example.com')).data;
  const times = [];
  for (let i = 1; i <= 4; i++) {
    const t0 = Date.now(); const r = await call('POST', '/auth/login', { email: 'sec@example.com', password: 'wrong-' + i });
    times.push(Date.now() - t0); check(r.status === 401, `failure ${i} is a plain 401 (${r.status})`);
  }
  check(times[3] >= 450, `repeated failures slow down (${times.join('/')}ms)`);
  let r = await call('POST', '/auth/login', { email: 'sec@example.com', password: 'wrong-5' });
  check(r.status === 429 && Number(r.headers.get('retry-after')) > 800 && /Too many sign-in attempts.*Try again in 15 minutes/.test(r.data.error), `5th failure: 429 + Retry-After + friendly message (${r.status} ${r.headers.get('retry-after')} ${r.data.error})`);
  r = await call('POST', '/auth/login', { email: 'sec@example.com', password: PW });
  check(r.status === 429, 'blocked while the window lasts, even with the right password');
  // the window ends (never permanent): expire it and sign in
  await RateLimit.updateMany({ _id: /^login-email:sec@/ }, { resetAt: new Date(Date.now() - 1) });
  r = await call('POST', '/auth/login', { email: 'sec@example.com', password: PW });
  check(r.status === 200, `after the window, the right password works (${r.status})`);
  check(!(await RateLimit.findById('login-email:sec@example.com')), 'a successful sign-in clears the email counter');
  // unknown emails are limited the same way (no enumeration through the limiter) — L3 timing too
  const tk = []; const tu = [];
  for (let i = 0; i < 3; i++) {
    let t0 = performance.now(); await call('POST', '/auth/login', { email: `ghost${i}@example.com`, password: 'x-wrong-password' }); tu.push(performance.now() - t0);
    t0 = performance.now(); await call('POST', '/auth/login', { email: `sec@example.com`, password: 'x-wrong-password' + i }); tk.push(performance.now() - t0);
    await RateLimit.deleteMany({});
  }
  const med = (a) => [...a].sort((x, y) => x - y)[1];
  check(Math.abs(med(tu) - med(tk)) < 40, `L3: unknown email and wrong password take about as long (${med(tu).toFixed(0)} vs ${med(tk).toFixed(0)}ms)`);
  // per IP: 20 failures across different emails
  for (let i = 0; i < 20; i++) await call('POST', '/auth/login', { email: `spray${i}@example.com`, password: 'nope-nope-nope' });
  r = await call('POST', '/auth/login', { email: 'sec@example.com', password: PW });
  check(r.status === 429 && /from this network/.test(r.data.error), `per-IP limit after 20 failures (${r.data.error})`);
  await RateLimit.deleteMany({});
  // spoofed X-Forwarded-For doesn't get around it (only Vercel's own headers are trusted, on Vercel)
  for (let i = 0; i < 20; i++) await call('POST', '/auth/login', { email: `spoof${i}@example.com`, password: 'nope-nope-nope' }, { headers: { 'X-Forwarded-For': `198.51.100.${i}` } });
  r = await call('POST', '/auth/login', { email: 'sec@example.com', password: PW }, { headers: { 'X-Forwarded-For': '203.0.113.9' } });
  check(r.status === 429, 'X-Forwarded-For spoofing is ignored');
  await RateLimit.deleteMany({});
  // the bypass token only works off Vercel and only when configured
  process.env.RATE_LIMIT_BYPASS_TOKEN = 'tkn';
  for (let i = 0; i < 6; i++) r = await call('POST', '/auth/login', { email: 'sec@example.com', password: 'bad' + i }, { headers: { 'X-Rate-Limit-Bypass': 'tkn' } });
  check(r.status === 401, 'bypass header works locally when the env var is set');
  process.env.VERCEL = '1';
  for (let i = 0; i < 6; i++) r = await call('POST', '/auth/login', { email: 'sec2@example.com', password: 'bad' + i }, { headers: { 'X-Rate-Limit-Bypass': 'tkn' } });
  check(r.status === 429, 'bypass is never honoured on Vercel');
  delete process.env.VERCEL; delete process.env.RATE_LIMIT_BYPASS_TOKEN;
  await RateLimit.deleteMany({});

  // ---- H1 register: 20 attempts per IP per hour (valid or not) ----
  for (let i = 0; i < 19; i++) await call('POST', '/auth/register', { name: '', email: 'bad' });
  r = await call('POST', '/auth/register', { name: '', email: 'bad' });
  check(r.status === 400, '20th attempt still answered');
  r = await reg('late@example.com');
  check(r.status === 429 && r.headers.get('retry-after') && /Too many sign-ups/.test(r.data.error), `21st sign-up attempt: 429 (${r.data.error})`);
  await RateLimit.deleteMany({});

  // networks: addresses rotating inside one /24 (IPv4) or /64 (IPv6) share a counter
  check(network('140.248.50.101') === '140.248.50.0/24' && network('::ffff:140.248.50.7') === '140.248.50.0/24', 'IPv4 /24');
  check(network('2001:db8:1:2:aaaa::1') === '2001:db8:1:2::/64' && network('2001:db8:1:2::9') === '2001:db8:1:2::/64' && network('2001:db8::1') === '2001:db8:0:0::/64', 'IPv6 /64');
  process.env.VERCEL = '1';
  const fromIp = (i) => call('POST', '/auth/register', { name: '', email: 'bad' }, { headers: { 'X-Vercel-Forwarded-For': `198.51.100.${i}` } });
  for (let i = 0; i < 60; i++) await fromIp(i);
  r = await fromIp(200);
  check(r.status === 429, `sign-ups rotating through 61 addresses of one /24: 61st is a 429 (${r.status})`);
  r = await call('POST', '/auth/register', { name: '', email: 'bad' }, { headers: { 'X-Vercel-Forwarded-For': '203.0.113.5' } });
  check(r.status === 400, 'another network is unaffected');
  delete process.env.VERCEL;
  await RateLimit.deleteMany({});

  // ---- L2: generic sign-up failure for an existing email ----
  r = await reg('sec@example.com');
  check(r.status === 400 && r.data.code === 'register_failed' && !/already|exists|registered/i.test(r.data.error.replace('If you already have an account', '')), `existing email: generic 400 (${r.data.error})`);

  // ---- password re-checks are limited per account ----
  const tok = u.token;
  for (let i = 0; i < 4; i++) check((await call('PUT', '/auth/lock-pin', { password: 'wrong-' + i, pin: '123456' }, { token: tok })).status === 403, `wrong account password ${i + 1}: 403`);
  r = await call('PUT', '/auth/lock-pin', { password: 'wrong-5', pin: '123456' }, { token: tok });
  check(r.status === 429 && r.headers.get('retry-after'), 'password re-checks: 5th wrong answer is a 429');
  await RateLimit.deleteMany({});

  // ---- M1: new PINs are 6 digits; old 4-digit PINs keep working (and get flagged for upgrade) ----
  check((await call('PUT', '/auth/lock-pin', { password: PW, pin: '1234' }, { token: tok })).status === 400, 'a new 4-digit PIN is refused');
  check((await call('PUT', '/auth/lock-pin', { password: PW, pin: '12345' }, { token: tok })).status === 400, 'a new 5-digit PIN is refused');
  r = await call('PUT', '/auth/lock-pin', { password: PW, pin: '135791' }, { token: tok });
  check(r.status === 200 && r.data.user.hasLockPin && !r.data.user.lockPinShort, 'a 6-digit PIN is accepted');
  const note = (await call('POST', '/notes', { title: 'Locked', content: 'top secret' }, { token: tok })).data.note;
  await call('PATCH', `/notes/${note._id}/lock`, { locked: true }, { token: tok });
  await User.updateOne({ email: 'sec@example.com' }, { lockPinHash: await hashPin('2468') }); // a PIN set before this change
  r = await call('POST', `/notes/${note._id}/unlock`, { pin: '2468' }, { token: tok });
  check(r.status === 200, 'an existing 4-digit PIN still unlocks');
  check((await call('GET', '/auth/me', undefined, { token: tok })).data.user.lockPinShort === true, 'and the account is flagged to suggest a 6-digit PIN');

  // ---- M1: exponential waits that don't reset the budget, then the account password is needed ----
  check(pinBlockMs(4) === 0 && pinBlockMs(5) === 5 * 60000 && pinBlockMs(6) === 10 * 60000 && pinBlockMs(9) === 80 * 60000, 'waits: none for 4, then 5, 10, …, 80 min');
  const wrong = () => call('POST', `/notes/${note._id}/unlock`, { pin: '000000' }, { token: tok });
  for (let i = 1; i <= 4; i++) check((await wrong()).status === 403, `wrong PIN ${i}: 403`);
  r = await wrong();
  check(r.status === 429 && /5 minutes/.test(r.data.error) && r.headers.get('retry-after') === '300', `wrong PIN 5: 5-minute wait (${r.data.error})`);
  const unblock = () => User.updateOne({ email: 'sec@example.com' }, { lockPinBlockedUntil: new Date(Date.now() - 1) }); // the wait passes
  await unblock(); r = await wrong();
  check(r.status === 429 && /10 minutes/.test(r.data.error), `after the wait the count continues, not reset: next wrong PIN waits 10 min (${r.data.error})`);
  for (let f = 7; f < PIN_LOCKOUT_FAILURES; f++) { await unblock(); await wrong(); }
  await unblock(); r = await wrong();
  check(r.status === 429 && r.data.passwordRequired === true && /account password/.test(r.data.error), `wrong PIN ${PIN_LOCKOUT_FAILURES}: PIN entry off until the account password (${r.data.error})`);
  await User.updateOne({ email: 'sec@example.com' }, { lockPinBlockedUntil: null });
  r = await call('POST', `/notes/${note._id}/unlock`, { pin: '2468' }, { token: tok });
  check(r.status === 429 && r.data.passwordRequired, 'even the right PIN is refused while locked out');
  check((await call('POST', '/auth/lock-pin/unblock', { password: 'wrong-pass' }, { token: tok })).status === 403, 'unblocking needs the right account password');
  check((await call('POST', '/auth/lock-pin/unblock', { password: PW }, { token: tok })).status === 200, 'account password unblocks PIN entry');
  r = await call('POST', `/notes/${note._id}/unlock`, { pin: '2468' }, { token: tok });
  check(r.status === 200, 'then the PIN works again');
  const ut = r.data.unlockToken;

  // ---- L5: trashing / deleting a locked note needs it unlocked ----
  check((await call('DELETE', `/notes/${note._id}`, undefined, { token: tok })).status === 423, 'L5: trash a locked note without unlock: 423');
  check((await call('DELETE', `/notes/${note._id}?permanent=true`, undefined, { token: tok })).status === 423, 'L5: delete forever without unlock: 423');
  check((await call('DELETE', `/notes/${note._id}`, undefined, { token: tok, headers: { 'X-Unlock-Token': ut } })).status === 200, 'L5: with the unlock token it moves to the trash');
  const plainTrash = (await call('POST', '/notes', { title: 'plain' }, { token: tok })).data.note;
  await call('DELETE', `/notes/${plainTrash._id}`, undefined, { token: tok });
  r = await call('DELETE', '/notes/trash', undefined, { token: tok });
  check(r.data.deleted === 1 && r.data.keptLocked === 1, `L5: empty trash without PIN keeps the locked note (${JSON.stringify(r.data)})`);
  r = await call('DELETE', '/notes/trash', { pin: '2468' }, { token: tok });
  check(r.data.deleted === 1 && r.data.keptLocked === 0, `L5: with the PIN it's deleted too (${JSON.stringify(r.data)})`);

  // ---- I4: export PIN in a POST body, never a header ----
  const n2 = (await call('POST', '/notes', { title: 'L2', content: 'export-secret' }, { token: tok })).data.note;
  await call('PATCH', `/notes/${n2._id}/lock`, { locked: true }, { token: tok });
  r = await call('GET', '/notes/export', undefined, { token: tok, headers: { 'X-Lock-Pin': '2468' } });
  check(!JSON.stringify(r.data).includes('export-secret'), 'I4: GET ignores X-Lock-Pin');
  r = await call('POST', '/notes/export', { format: 'json', pin: '2468' }, { token: tok });
  check(JSON.stringify(r.data).includes('export-secret'), 'I4: POST with the PIN in the body exports locked notes');

  // ---- L4: import can't create more than MAX_FOLDERS folders ----
  const notes = Array.from({ length: MAX_FOLDERS + 15 }, (_, i) => ({ title: `imp ${i}`, content: 'x', folder: `F${i}` }));
  r = await call('POST', '/notes/import', { app: 'noted', version: 1, notes }, { token: tok });
  const fc = (await call('GET', '/folders', undefined, { token: tok })).data.folders.length;
  check(r.status === 201 && fc === MAX_FOLDERS && r.data.foldersSkipped === 15 && r.data.imported === MAX_FOLDERS + 15, `L4: import stops at ${MAX_FOLDERS} folders (${fc}, skipped ${r.data.foldersSkipped}, imported ${r.data.imported})`);

  // ---- L1: CORS ----
  const cors = async (origin) => (await fetch(base + '/health', { headers: { Origin: origin } })).headers.get('access-control-allow-origin');
  check(await cors('https://evil.example') === null, 'L1: unknown origin gets no CORS header');
  check(await cors('http://localhost:4173') === 'http://localhost:4173', 'L1: localhost allowed off Vercel');
  process.env.VERCEL = '1'; process.env.CLIENT_URL = 'https://noted-lac-phi.vercel.app';
  check(allowedOrigin('https://noted-lac-phi.vercel.app') && allowedOrigin('https://noted-abc123def-ayman-issa-s-workspace.vercel.app'), 'L1: production + preview origins allowed');
  check(!allowedOrigin('http://localhost:4173') && !allowedOrigin('https://noted-lac-phi.vercel.app.evil.com') && !allowedOrigin('https://noted-x-other-team.vercel.app'), 'L1: localhost and look-alikes refused on Vercel');
  delete process.env.VERCEL; delete process.env.CLIENT_URL;

  // ---- I3: no Server-Timing in production ----
  check((await fetch(base + '/health')).headers.get('server-timing') !== null, 'I3: Server-Timing locally');
  process.env.VERCEL_ENV = 'production';
  check((await fetch(base + '/health')).headers.get('server-timing') === null, 'I3: no Server-Timing in production');
  delete process.env.VERCEL_ENV;

  console.log(`✅ security tests passed (${n} checks)`);
} finally { server.close(); await mongoose.disconnect(); await mongo.stop(); }
