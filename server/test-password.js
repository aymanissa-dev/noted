// Password policy: common/pattern/personal passwords rejected, HIBP k-anonymity check (mocked), fails open.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { localProblem, breachCount, assertGoodPassword } from './src/lib/passwordPolicy.js';
import { createApp } from './src/app.js';

// ---- unit ----
for (const pw of ['password', 'password123', 'Password1!', 'qwerty123', '12345678', 'iloveyou1', 'aaaaaaaaaa', 'abcdefgh', 'Welcome2024', 'baseball', 'football1']) {
  assert.ok(localProblem(pw), `should reject ${pw}`);
}
assert.match(localProblem('short'), /at least 8/);
assert.match(localProblem('Password123'), /too common/);
assert.match(localProblem('margaretsmith', { email: 'margaretsmith@example.com' }), /name or email/);
assert.match(localProblem('Margaret!!', { name: 'Margaret Lee', email: 'm@x.io' }), /name or email/);
for (const pw of ['quiet-otter-lamp-91', 'correct horse battery staple', 'Tz8#kq2!Lm', 'blue mango tuesday']) assert.equal(localProblem(pw, { email: 'ada@example.com', name: 'Ada' }), null, pw);

// k-anonymity: only the 5-char prefix is sent; the suffix is matched locally.
const sha = crypto.createHash('sha1').update('hunter2-but-longer').digest('hex').toUpperCase();
let sentUrl;
const fakeFetch = (count) => async (url) => { sentUrl = url; return { ok: true, text: async () => `0000000000000000000000000000000000A:3\r\n${sha.slice(5)}:${count}\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0` }; };
assert.equal(await breachCount('hunter2-but-longer', { fetchImpl: fakeFetch(4242) }), 4242);
assert.ok(sentUrl.endsWith(`/range/${sha.slice(0, 5)}`) && !sentUrl.includes(sha.slice(5)), 'only the hash prefix leaves the server');
assert.equal(await breachCount('hunter2-but-longer', { fetchImpl: fakeFetch(0) }), 0, 'padding entries (count 0) are not breaches');
assert.equal(await breachCount('x', { fetchImpl: async () => { throw new Error('offline'); } }), null, 'fails open on network error');
assert.equal(await breachCount('x', { fetchImpl: async () => ({ ok: false }) }), null, 'fails open on HTTP error');
const slow = (_u, { signal }) => new Promise((_r, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))));
const t0 = Date.now(); assert.equal(await breachCount('x', { fetchImpl: slow, timeoutMs: 100 }), null); assert.ok(Date.now() - t0 < 1000, 'times out fast');
await assert.rejects(assertGoodPassword('hunter2-but-longer', {}, { fetchImpl: fakeFetch(12) }), (e) => e.status === 400 && /12 known data breaches/.test(e.message) && e.extra.reason === 'breached');
await assertGoodPassword('hunter2-but-longer', {}, { fetchImpl: async () => { throw new Error('down'); } }); // fail open

// ---- API ----
process.env.JWT_SECRET = 'test-secret';
process.env.RATE_LIMITS = 'off'; // limits have their own tests (test-security.js)
process.env.PASSWORD_BREACH_CHECK = 'off'; // deterministic in CI; the breach path is unit-tested above
const mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri());
const server = createApp().listen(0); const base = `http://127.0.0.1:${server.address().port}/api`;
const call = async (method, path, body, token) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json().catch(() => null) }; };
try {
  let r = await call('POST', '/auth/register', { name: 'Pat', email: 'pat@example.com', password: 'password123' });
  assert.equal(r.status, 400); assert.match(r.data.error, /too common/); assert.equal(r.data.field, 'password');
  r = await call('POST', '/auth/register', { name: 'Pat', email: 'patricia@example.com', password: 'patricia2024' });
  assert.equal(r.status, 400); assert.match(r.data.error, /name or email/);
  r = await call('POST', '/auth/register', { name: 'Pat', email: 'pat@example.com', password: 'quiet-otter-lamp-91' });
  assert.equal(r.status, 201); const token = r.data.token;
  assert.equal((await call('POST', '/auth/login', { email: 'pat@example.com', password: 'quiet-otter-lamp-91' })).status, 200);
  r = await call('PATCH', '/auth/password', { currentPassword: 'quiet-otter-lamp-91', newPassword: 'qwerty123' }, token);
  assert.equal(r.status, 400); assert.match(r.data.error, /too common/);
  r = await call('PATCH', '/auth/password', { currentPassword: 'quiet-otter-lamp-91', newPassword: 'quiet-otter-lamp-91' }, token);
  assert.equal(r.status, 400); assert.match(r.data.error, /different/);
  r = await call('PATCH', '/auth/password', { currentPassword: 'quiet-otter-lamp-91', newPassword: 'brisk-heron-sail-27' }, token);
  assert.equal(r.status, 200);
  console.log('✅ password policy tests passed');
} finally { server.close(); await mongoose.disconnect(); await mongo.stop(); }
