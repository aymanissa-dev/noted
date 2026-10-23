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
const { MAX_FOLDERS, default: Folder } = await import('./src/models/Folder.js');
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

  // ================= Concurrency (re-verify NEW-1..3): bursts of parallel requests =================
  await RateLimit.deleteMany({});
  const tally = (rs) => rs.reduce((m, x) => ({ ...m, [x.status]: (m[x.status] || 0) + 1 }), {});
  // NEW-1 sign-in: 30 parallel wrong passwords for one email → only 5 are checked (4×401, then 429s)
  const c1 = (await reg('burst@example.com')).data;
  let rs = await Promise.all(Array.from({ length: 30 }, (_, i) => call('POST', '/auth/login', { email: 'burst@example.com', password: 'wrong-burst-' + i })));
  let t = tally(rs);
  check(t[401] === 4 && t[429] === 26, `NEW-1 30 parallel wrong sign-ins: ${JSON.stringify(t)} (expected 4×401, 26×429)`);
  check((await call('POST', '/auth/login', { email: 'burst@example.com', password: PW })).status === 429, 'NEW-1 and the account stays limited');
  check((await RateLimit.findById('login-ip:::ffff:127.0.0.1').lean() || await RateLimit.findById('login-ip:127.0.0.1').lean() || { count: -1 }).count <= 5, 'NEW-1 the refused attempts were handed back to the IP counter (only checked ones count)');
  await RateLimit.deleteMany({});
  // per IP: 50 parallel wrong sign-ins for different emails → at most 20 checked
  rs = await Promise.all(Array.from({ length: 50 }, (_, i) => call('POST', '/auth/login', { email: `ipburst${i}@example.com`, password: 'nope-nope-nope' })));
  t = tally(rs);
  check(t[401] === 20 && t[429] === 30, `NEW-1 50 parallel wrong sign-ins from one IP: ${JSON.stringify(t)} (expected 20×401)`);
  await RateLimit.deleteMany({});
  // a correct sign-in gives back its IP reservation
  for (let i = 0; i < 25; i++) check((await call('POST', '/auth/login', { email: 'burst@example.com', password: PW })).status === 200, `right password ${i + 1}`);
  check((await call('POST', '/auth/login', { email: 'nobody@example.com', password: 'x-wrong-password' })).status === 401, 'NEW-1 25 successful sign-ins use up none of the IP\'s failure budget');
  await RateLimit.deleteMany({});
  // password re-check: 20 parallel wrong account passwords → 4×403 then 429
  rs = await Promise.all(Array.from({ length: 20 }, (_, i) => call('PUT', '/auth/lock-pin', { password: 'wrong-' + i, pin: '123456' }, { token: c1.token })));
  t = tally(rs);
  check(t[403] === 4 && t[429] === 16, `NEW-1 20 parallel wrong account passwords: ${JSON.stringify(t)} (expected 4×403)`);
  await RateLimit.deleteMany({});
  // sign-ups: 40 parallel from one IP (on Vercel, so the IP header counts) → exactly 20 answered
  process.env.VERCEL = '1';
  rs = await Promise.all(Array.from({ length: 40 }, () => call('POST', '/auth/register', { name: '', email: 'bad' }, { headers: { 'X-Vercel-Forwarded-For': '192.0.2.77' } })));
  delete process.env.VERCEL;
  t = tally(rs);
  check(t[400] === 20 && t[429] === 20, `NEW-1 40 parallel sign-ups from one IP: ${JSON.stringify(t)} (expected 20×400)`);
  await RateLimit.deleteMany({});

  // NEW-3 PIN: 50 parallel wrong PINs → exactly 5 compared (4×403, 1×429 "5 minutes"), the rest wait
  check((await call('PUT', '/auth/lock-pin', { password: PW, pin: '135790' }, { token: c1.token })).status === 200, 'burst account PIN set');
  const pn = (await call('POST', '/notes', { title: 'burst locked', content: 'b' }, { token: c1.token })).data.note;
  await call('PATCH', `/notes/${pn._id}/lock`, { locked: true }, { token: c1.token });
  const pinState = async () => User.findOne({ email: 'burst@example.com' }).select('+lockPinFailures +lockPinBlockedUntil +lockPinLockedOut').lean();
  rs = await Promise.all(Array.from({ length: 50 }, () => call('POST', `/notes/${pn._id}/unlock`, { pin: '000000' }, { token: c1.token })));
  t = tally(rs); let ps = await pinState();
  const waitMin = Math.round((ps.lockPinBlockedUntil - Date.now()) / 60000);
  check(t[403] === 4 && t[429] === 46 && ps.lockPinFailures === 5 && waitMin === 5, `NEW-3 50 parallel wrong PINs: ${JSON.stringify(t)}, failures ${ps.lockPinFailures}, wait ${waitMin} min (expected 4×403, 5 failures, 5 min)`);
  check(rs.filter((x) => x.status === 429).every((x) => /5 minutes/.test(x.data.error)), 'NEW-3 every refused guess reports the same 5-minute wait');
  const unblockBurst = () => User.updateOne({ email: 'burst@example.com' }, { lockPinBlockedUntil: new Date(Date.now() - 1) });
  await unblockBurst();
  rs = await Promise.all(Array.from({ length: 20 }, () => call('POST', `/notes/${pn._id}/unlock`, { pin: '000000' }, { token: c1.token })));
  ps = await pinState();
  check(ps.lockPinFailures === 6 && Math.round((ps.lockPinBlockedUntil - Date.now()) / 60000) === 10 && rs.every((x) => x.status === 429), `NEW-3 after the wait, a burst of 20 gets one guess (failures ${ps.lockPinFailures}, next wait 10 min)`);
  await User.updateOne({ email: 'burst@example.com' }, { lockPinFailures: 9, lockPinBlockedUntil: new Date(Date.now() - 1) });
  rs = await Promise.all(Array.from({ length: 20 }, () => call('POST', `/notes/${pn._id}/unlock`, { pin: '000000' }, { token: c1.token })));
  ps = await pinState();
  check(ps.lockPinFailures === 10 && ps.lockPinLockedOut && rs.every((x) => x.status === 429 && x.data.passwordRequired), `NEW-3 the 10th failure locks PIN entry for every parallel request (failures ${ps.lockPinFailures})`);
  rs = await Promise.all([call('POST', `/notes/${pn._id}/unlock`, { pin: '135790' }, { token: c1.token })]);
  check(rs[0].status === 429 && rs[0].data.passwordRequired, 'NEW-3 even the right PIN needs the account password now');
  check((await call('POST', '/auth/lock-pin/unblock', { password: PW }, { token: c1.token })).status === 200 && (await call('POST', `/notes/${pn._id}/unlock`, { pin: '135790' }, { token: c1.token })).status === 200, 'NEW-3 account password, then the PIN works');
  ps = await pinState();
  check(ps.lockPinFailures === 0 && !ps.lockPinBlockedUntil && !ps.lockPinLockedOut, 'NEW-3 a correct PIN clears the count and waits');

  // NEW-2 folders: two parallel 205-folder imports stay at MAX_FOLDERS
  await RateLimit.deleteMany({});
  const f1 = (await reg('folders@example.com')).data;
  const imp = (tag) => call('POST', '/notes/import', { app: 'noted', version: 1, notes: Array.from({ length: 205 }, (_, i) => ({ title: `${tag} ${i}`, content: tag, folder: `${tag}${i}` })) }, { token: f1.token });
  rs = await Promise.all([imp('A'), imp('B')]);
  let nf = await Folder.countDocuments({ user: f1.user.id });
  let fu = await User.findById(f1.user.id).select('+folderCount').lean();
  check(rs.every((x) => x.status === 201) && nf === MAX_FOLDERS && fu.folderCount === MAX_FOLDERS && rs[0].data.foldersSkipped + rs[1].data.foldersSkipped === 410 - MAX_FOLDERS, `NEW-2 two parallel 205-folder imports: ${nf} folders (counter ${fu.folderCount}), skipped ${rs.map((x) => x.data.foldersSkipped)}`);
  // same names in parallel imports: no 500, one folder per name
  const f2 = (await reg('folders2@example.com')).data;
  const same = () => call('POST', '/notes/import', { app: 'noted', version: 1, notes: Array.from({ length: 30 }, (_, i) => ({ title: `s ${i} ${Math.random()}`, content: 'x', folder: `Shared${i % 10}` })) }, { token: f2.token });
  rs = await Promise.all([same(), same(), same()]);
  nf = await Folder.countDocuments({ user: f2.user.id }); fu = await User.findById(f2.user.id).select('+folderCount').lean();
  check(rs.every((x) => x.status === 201) && nf === 10 && fu.folderCount === 10, `NEW-2 parallel imports of the same folder names: ${rs.map((x) => x.status)}, ${nf} folders, counter ${fu.folderCount}`);
  // an account from before the counter (190 folders, no folderCount): 50 parallel creates → exactly 10
  const f3 = (await reg('folders3@example.com')).data;
  await Folder.insertMany(Array.from({ length: 190 }, (_, i) => ({ user: f3.user.id, name: `old${i}` })));
  await User.updateOne({ _id: f3.user.id }, { $unset: { folderCount: 1 } });
  rs = await Promise.all(Array.from({ length: 50 }, (_, i) => call('POST', '/folders', { name: `new${i}` }, { token: f3.token })));
  t = tally(rs); nf = await Folder.countDocuments({ user: f3.user.id }); fu = await User.findById(f3.user.id).select('+folderCount').lean();
  check(t[201] === 10 && t[400] === 40 && nf === 200 && fu.folderCount === 200, `NEW-2 legacy account at 190, 50 parallel creates: ${JSON.stringify(t)}, ${nf} folders, counter ${fu.folderCount}`);
  // deleting frees a slot exactly once, even when deleted twice in parallel
  const victim = (await call('GET', '/folders', undefined, { token: f3.token })).data.folders[0]._id;
  await Promise.all([call('DELETE', `/folders/${victim}`, undefined, { token: f3.token }), call('DELETE', `/folders/${victim}`, undefined, { token: f3.token })]);
  fu = await User.findById(f3.user.id).select('+folderCount').lean();
  check(fu.folderCount === 199, `NEW-2 parallel double delete frees one slot (counter ${fu.folderCount})`);
  rs = await Promise.all(Array.from({ length: 5 }, (_, i) => call('POST', '/folders', { name: `again${i}` }, { token: f3.token })));
  t = tally(rs);
  check(t[201] === 1 && await Folder.countDocuments({ user: f3.user.id }) === 200, `NEW-2 then exactly one more fits (${JSON.stringify(t)})`);
  // a duplicate name gives its slot back
  const f4 = (await reg('folders4@example.com')).data;
  await call('POST', '/folders', { name: 'Dup' }, { token: f4.token });
  rs = await Promise.all(Array.from({ length: 10 }, () => call('POST', '/folders', { name: 'dup' }, { token: f4.token })));
  fu = await User.findById(f4.user.id).select('+folderCount').lean();
  check(rs.every((x) => x.status === 409) && fu.folderCount === 1, `NEW-2 duplicate names: 409s, counter stays 1 (${fu.folderCount})`);
  await RateLimit.deleteMany({});

  // ---- Idempotent creates (QA final d): a re-sent create returns/updates the same note ----
  {
    const iu = (await reg('idem@example.com')).data;
    const cid = 'local-abc123xyz';
    const rs2 = await Promise.all(Array.from({ length: 10 }, () => call('POST', '/notes', { title: 'Idem', content: 'v1', clientId: cid }, { token: iu.token })));
    const ids = new Set(rs2.map((x) => x.data.note._id));
    check(ids.size === 1 && rs2.filter((x) => x.status === 201).length === 1, `10 parallel creates with one clientId: one note (${[...new Set(rs2.map((x) => x.status))]})`);
    const again = await call('POST', '/notes', { title: 'Idem', content: 'v2 (edited offline)', clientId: cid }, { token: iu.token });
    check(again.status === 200 && again.data.note._id === [...ids][0] && again.data.note.content === 'v2 (edited offline)', 're-sent create with later edits updates that note');
    const other = await call('POST', '/notes', { title: 'Other', clientId: cid }, { token: c1.token });
    check(other.status === 201 && other.data.note._id !== [...ids][0], 'the same clientId in another account is a different note');
    const listN = (await call('GET', '/notes', undefined, { token: iu.token })).data.notes.filter((x) => x.title === 'Idem').length;
    check(listN === 1, `only one "Idem" note in the list (${listN})`);
    await RateLimit.deleteMany({});
  }

  // ---- B1: "Log out" ends this session on the server; other sessions keep working ----
  {
    await RateLimit.deleteMany({});
    const a = (await reg('logout@noted.test')).data.token;
    const b = (await call('POST', '/auth/login', { email: 'logout@noted.test', password: PW })).data.token;
    check(JSON.parse(Buffer.from(a.split('.')[1], 'base64url')).sid, 'B1: every token carries a session id');
    check((await call('POST', '/auth/logout')).status === 401, 'B1: logout needs a token');
    let r = await call('GET', '/auth/activity', undefined, { token: b });
    check(r.data.events.filter((e) => e.active).length === 2, 'B1: two active sessions before logout');
    r = await call('POST', '/auth/logout', undefined, { token: a });
    check(r.status === 204, `B1: POST /auth/logout → 204 (${r.status})`);
    for (const [m, p] of [['GET', '/auth/me'], ['GET', '/notes'], ['GET', '/folders'], ['POST', '/notes'], ['GET', '/auth/activity'], ['POST', '/auth/logout'], ['POST', '/auth/logout-all']]) {
      r = await call(m, p, m === 'POST' ? {} : undefined, { token: a });
      check(r.status === 401, `B1: logged-out token → 401 on ${m} ${p} (${r.status})`);
    }
    check((await call('GET', '/auth/me', undefined, { token: b })).status === 200, 'B1: the other session still works');
    r = await call('GET', '/auth/activity', undefined, { token: b });
    check(r.data.events.filter((e) => e.active).length === 1 && r.data.events.find((e) => e.active).current, 'B1: activity shows the logged-out session as ended');
    const { default: RevokedSession } = await import('./src/models/RevokedSession.js');
    const row = await RevokedSession.findOne().lean();
    const exp = JSON.parse(Buffer.from(a.split('.')[1], 'base64url')).exp * 1000;
    check(row && Math.abs(row.expireAt - exp) < 1000, 'B1: the revocation expires with the token (TTL)');
    const idx = await RevokedSession.collection.indexes();
    check(idx.some((i) => i.key.expireAt === 1 && i.expireAfterSeconds === 0), 'B1: TTL index on expireAt');
    // a token without a session id (issued before sids) can still be logged out on its own
    const jwt = (await import('jsonwebtoken')).default;
    const me = (await call('GET', '/auth/me', undefined, { token: b })).data.user;
    const legacy = jwt.sign({ sub: me.id, tv: 0, typ: 'access' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    check((await call('GET', '/auth/me', undefined, { token: legacy })).status === 200, 'B1: sid-less token works before logout');
    check((await call('POST', '/auth/logout', undefined, { token: legacy })).status === 204, 'B1: sid-less token logs out');
    check((await call('GET', '/auth/me', undefined, { token: legacy })).status === 401, 'B1: sid-less token → 401 after logout');
    check((await call('GET', '/auth/me', undefined, { token: b })).status === 200, 'B1: … without touching other sessions');
    // deleting the account removes its revocations too
    check((await call('DELETE', '/auth/me', { password: PW }, { token: b })).status === 200 && !(await RevokedSession.countDocuments()), 'B1: account deletion clears its revocations');
    await RateLimit.deleteMany({});
  }

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
