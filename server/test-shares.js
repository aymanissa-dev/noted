// Public share links: owner-only management, read-only public view without sign-in, image
// isolation (only the shared note's referenced images), locked notes, revoke/rotate, trash,
// deletes and rate limits. Default: in-memory MongoDB. Against a deployment: API=https://host/api node test-shares.js
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

let server, mongo, mongoose, base = process.env.API, lib, models;
const local = !base;
if (local) {
  ({ default: mongoose } = await import('mongoose'));
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const { createApp } = await import('./src/app.js');
  process.env.JWT_SECRET = 'test-secret';
  process.env.RATE_LIMITS = 'off';
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri());
  server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}/api`;
  lib = await import('./src/lib/rateLimit.js');
  models = { Share: (await import('./src/models/Share.js')).default };
}

// ---- Tiny real image files ----
const crc32 = (buf) => { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function png(w, h, seed = 0) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = []; for (let y = 0; y < h; y++) { rows.push(Buffer.from([0])); rows.push(Buffer.alloc(w * 4, (y * 7 + seed) & 0xff)); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

const PW = `shares-${Math.random().toString(36).slice(2)}-Kestrel!`;
const call = async (method, path, { token, body, raw, headers = {} } = {}) => {
  const r = await fetch(base + path, { method, headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }), ...headers }, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const buf = Buffer.from(await r.arrayBuffer());
  let data = buf; try { data = JSON.parse(buf.toString()); } catch { /* binary */ }
  return { status: r.status, data, buf, headers: r.headers };
};
const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const users = [];
const register = async (tag) => {
  const email = `shares-${tag}+${stamp}@noted.test`;
  const r = await call('POST', '/auth/register', { body: { name: `Shares ${tag}`, email, password: PW } });
  assert.equal(r.status, 201, `register ${tag}: ${JSON.stringify(r.data)}`);
  const u = { email, token: r.data.token, id: r.data.user.id || r.data.user._id }; users.push(u); return u;
};
let checks = 0;
const ok = (cond, what) => { checks++; assert.ok(cond, what); };
const is = (r, code, what) => { checks++; assert.equal(r.status, code, `${what}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`); };
const upload = (token, noteId, bytes, type = 'image/png', extra = {}) => call('POST', `/notes/${noteId}/images`, { token, raw: bytes, headers: { 'Content-Type': type, ...extra } });
const newNote = async (token, content = 'x', title = 'Share test') => (await call('POST', '/notes', { token, body: { title, content } })).data.note;
const list = (token) => call('GET', '/notes', { token });


try {
  const A = await register('a'); const B = await register('b');
  const n = await newNote(A.token, 'Intro **bold** <script>alert(1)</script>', 'Shared plan');
  const p1 = png(3, 2, 1); const p2 = png(2, 2, 2);
  const img = (await upload(A.token, n._id, p1)).data.image;
  const other = await newNote(A.token, 'other', 'Private other');
  const otherImg = (await upload(A.token, other._id, p2)).data.image;
  // The shared note shows its own image, and (by id) an image of another note: that one must not be served.
  const orphan = (await upload(A.token, n._id, png(4, 4, 3))).data.image; // uploaded to the note but not in its text
  await call('PUT', `/notes/${n._id}`, { token: A.token, body: { content: `Intro\n![mine](noted-image:${img._id})\n![theirs](noted-image:${otherImg._id})` } });

  // ---- Owner management ----
  is(await call('GET', `/notes/${n._id}/share`, {}), 401, 'share status needs sign-in');
  is(await call('POST', `/notes/${n._id}/share`, {}), 401, 'create needs sign-in');
  ok((await call('GET', `/notes/${n._id}/share`, { token: A.token })).data.share === null, 'not shared yet');
  const c1 = await call('POST', `/notes/${n._id}/share`, { token: A.token });
  is(c1, 201, 'owner creates a link');
  const t1 = c1.data.share.token;
  ok(/^[A-Za-z0-9_-]{43}$/.test(t1) && c1.data.share.allowEdits === false && c1.data.share.allowIndexing === false, 'token is 256-bit base64url; read-only, noindex by default');
  ok(!('user' in c1.data.share), 'share JSON has no owner id');
  const c2 = await call('POST', `/notes/${n._id}/share`, { token: A.token });
  ok(c2.status === 200 && c2.data.share.token === t1, 'creating again returns the same link (one per note)');
  const lst = await call('GET', '/shares', { token: A.token });
  ok(lst.data.shares.length === 1 && lst.data.shares[0].title === 'Shared plan' && lst.data.shares[0].token === t1, 'owner lists active shares with titles');
  ok((await call('GET', '/shares', { token: B.token })).data.shares.length === 0, 'another user sees no shares');

  // Other users can't manage it (the note is "not found" for them).
  is(await call('GET', `/notes/${n._id}/share`, { token: B.token }), 404, 'other user: status 404');
  is(await call('POST', `/notes/${n._id}/share`, { token: B.token }), 404, 'other user: create 404');
  is(await call('POST', `/notes/${n._id}/share/rotate`, { token: B.token }), 404, 'other user: rotate 404');
  is(await call('DELETE', `/notes/${n._id}/share`, { token: B.token }), 404, 'other user: revoke 404');
  ok((await call('GET', `/public/shares/${t1}`)).status === 200, 'link still works after their attempts');
  is(await call('GET', '/notes/not-an-id/share', { token: A.token }), 400, 'bad id 400');

  // ---- Public view ----
  const v = await call('GET', `/public/shares/${t1}`);
  is(v, 200, 'public view without sign-in');
  ok(v.data.note.title === 'Shared plan' && v.data.note.content.includes(`noted-image:${img._id}`), 'title + markdown returned (the page renders it escaped)');
  ok(!('user' in v.data.note) && !('_id' in v.data.note) && !('tags' in v.data.note) && !('folderId' in v.data.note), 'no owner id, note id, tags or folder');
  ok(/noindex/.test(v.headers.get('x-robots-tag') || ''), 'noindex header');
  ok(v.headers.get('cache-control') === 'no-store', 'no-store');
  ok(v.data.images.length === 1 && v.data.images[0]._id === img._id, 'only the note’s own referenced image is listed');
  const vb = await call('GET', `/public/shares/${t1}`, { token: B.token });
  ok(vb.status === 200 && vb.data.note.title === 'Shared plan', 'a bearer token is ignored (same answer)');
  is(await call('GET', `/public/shares/${t1}`, { headers: { Authorization: 'Bearer garbage' } }), 200, 'a garbage bearer token doesn’t matter');

  // ---- Image isolation ----
  const gi = await call('GET', `/public/shares/${t1}/images/${img._id}`);
  ok(gi.status === 200 && gi.buf.equals(p1) && gi.headers.get('content-type') === 'image/png', 'the note’s image is served via the share');
  ok(/no-store/.test(gi.headers.get('cache-control')) && gi.headers.get('x-content-type-options') === 'nosniff' && /noindex/.test(gi.headers.get('x-robots-tag') || ''), 'image: no-store, nosniff, noindex');
  is(await call('GET', `/public/shares/${t1}/images/${otherImg._id}`), 404, 'image of another note (even referenced in the text) → 404');
  is(await call('GET', `/public/shares/${t1}/images/${orphan._id}`), 404, 'image of this note that isn’t in its text → 404');
  const bImgNote = await newNote(B.token, 'b'); const bImg = (await upload(B.token, bImgNote._id, p2)).data.image;
  is(await call('GET', `/public/shares/${t1}/images/${bImg._id}`), 404, 'another user’s image → 404');
  is(await call('GET', `/public/shares/${t1}/images/nope`), 404, 'bad image id → 404');
  is(await call('GET', `/images/${img._id}`, {}), 401, 'the private image route still needs sign-in');

  // ---- Bad tokens ----
  is(await call('GET', '/public/shares/short'), 404, 'malformed token 404');
  { const u = await call('GET', `/public/shares/${'A'.repeat(43)}`); is(u, 404, 'unknown token 404'); ok(/noindex/.test(u.headers.get('x-robots-tag') || '') && u.headers.get('referrer-policy') === 'no-referrer', 'unknown token 404 is noindex + no-referrer'); }
  is(await call('GET', `/public/shares/${'A'.repeat(43)}/images/${img._id}`), 404, 'unknown token image 404');

  // ---- Rotate ----
  const r = await call('POST', `/notes/${n._id}/share/rotate`, { token: A.token });
  is(r, 200, 'rotate');
  const t2 = r.data.share.token;
  ok(t2 !== t1, 'new token');
  is(await call('GET', `/public/shares/${t1}`), 404, 'old link 404 after regenerate');
  is(await call('GET', `/public/shares/${t1}/images/${img._id}`), 404, 'old link images 404');
  is(await call('GET', `/public/shares/${t2}`), 200, 'new link works');

  // ---- Trash ----
  await call('DELETE', `/notes/${n._id}`, { token: A.token });
  is(await call('GET', `/public/shares/${t2}`), 404, 'trashed note: link 404');
  is(await call('POST', `/notes/${n._id}/share/rotate`, { token: A.token }), 400, 'can’t regenerate while in the trash');
  ok((await call('GET', '/shares', { token: A.token })).data.shares[0].inTrash === true, 'list marks it in the trash');
  await call('POST', `/notes/${n._id}/restore`, { token: A.token });
  is(await call('GET', `/public/shares/${t2}`), 200, 'restored: link works again');

  // ---- Locked notes ----
  is(await call('PUT', '/auth/lock-pin', { token: A.token, body: { password: PW, pin: '482913' } }), 200, 'set PIN');
  const lk = await newNote(A.token, 'PIN body secret', 'Locked one');
  await call('PATCH', `/notes/${lk._id}/lock`, { token: A.token, body: { locked: true } });
  is(await call('POST', `/notes/${lk._id}/share`, { token: A.token }), 423, 'locked note can’t be shared');
  const unlock = (await call('POST', `/notes/${lk._id}/unlock`, { token: A.token, body: { pin: '482913' } })).data.unlockToken;
  is(await call('POST', `/notes/${lk._id}/share`, { token: A.token, headers: { 'X-Unlock-Token': unlock } }), 423, 'not even while unlocked (remove the lock to share)');
  // Locking a shared note deletes its link.
  is(await call('PATCH', `/notes/${n._id}/lock`, { token: A.token, body: { locked: true } }), 200, 'lock the shared note');
  const lv = await call('GET', `/public/shares/${t2}`);
  is(lv, 404, 'locked: link 404'); ok(!JSON.stringify(lv.data).includes('Intro'), 'locked: no body in the answer');
  is(await call('GET', `/public/shares/${t2}/images/${img._id}`), 404, 'locked: images 404');
  ok((await call('GET', '/shares', { token: A.token })).data.shares.length === 0, 'locking deleted the link');
  await call('PATCH', `/notes/${n._id}/lock`, { token: A.token, body: { locked: false, pin: '482913' } });
  is(await call('GET', `/public/shares/${t2}`), 404, 'unlocking doesn’t bring the old link back');
  if (local) {
    // Even if a share document existed for a locked note (e.g. a race), the public route re-checks the lock.
    const t3 = (await call('POST', `/notes/${n._id}/share`, { token: A.token })).data.share.token;
    const mongooseNote = mongoose.connection.collection('notes');
    await mongooseNote.updateOne({ _id: new mongoose.Types.ObjectId(n._id) }, { $set: { locked: true } });
    is(await call('GET', `/public/shares/${t3}`), 404, 'race-locked note: public view still 404');
    is(await call('GET', `/public/shares/${t3}/images/${img._id}`), 404, 'race-locked note: image still 404');
    await mongooseNote.updateOne({ _id: new mongoose.Types.ObjectId(n._id) }, { $set: { locked: false } });
  }

  // ---- Revoke ----
  const t4 = (await call('POST', `/notes/${n._id}/share`, { token: A.token })).data.share.token;
  is(await call('GET', `/public/shares/${t4}`), 200, 'shared again');
  is(await call('DELETE', `/notes/${n._id}/share`, { token: A.token }), 204, 'revoke');
  is(await call('GET', `/public/shares/${t4}`), 404, 'revoked: 404');
  is(await call('GET', `/public/shares/${t4}/images/${img._id}`), 404, 'revoked: images 404');
  ok((await call('GET', `/notes/${n._id}/share`, { token: A.token })).data.share === null, 'revoked: no share');

  // ---- Permanent delete / account delete remove links ----
  const t5 = (await call('POST', `/notes/${other._id}/share`, { token: A.token })).data.share.token;
  await call('DELETE', `/notes/${other._id}?permanent=true`, { token: A.token });
  is(await call('GET', `/public/shares/${t5}`), 404, 'deleted for good: 404');
  if (local) ok(await models.Share.countDocuments({ note: other._id }) === 0, 'deleted for good: share removed');

  // ---- Rate limit (in-process only) ----
  if (local) {
    const t6 = (await call('POST', `/notes/${n._id}/share`, { token: A.token })).data.share.token;
    const saved = { ...lib.LIMITS.shareViewIp }; lib.LIMITS.shareViewIp.max = 3; process.env.RATE_LIMITS = '';
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await call('GET', `/public/shares/${t6}`)).status);
    const last = await call('GET', `/public/shares/${'B'.repeat(43)}`);
    process.env.RATE_LIMITS = 'off'; Object.assign(lib.LIMITS.shareViewIp, saved);
    ok(codes.slice(0, 3).every((c) => c === 200) && codes.slice(3).every((c) => c === 429), 'public views rate-limited per IP ' + codes);
    ok(last.status === 429 && Number(last.headers.get('retry-after')) > 0, 'guessing tokens counts too, with Retry-After');
    const C = await register('c');
    const cn = await newNote(C.token, 'c'); await call('POST', `/notes/${cn._id}/share`, { token: C.token });
    is(await call('DELETE', '/auth/me', { token: C.token, body: { password: PW } }), 200, 'delete account');
    users.splice(users.indexOf(C), 1);
    ok(await models.Share.countDocuments({ user: C.id }) === 0, 'account delete removes its shares');
  }
  console.log(`✅ shares: ${checks} checks passed${local ? '' : ' (deployment mode)'}`);
} catch (err) {
  console.error('❌', err); process.exitCode = 1;
} finally {
  for (const u of users) await call('DELETE', '/auth/me', { token: u.token, body: { password: PW } }).catch(() => {});
  if (local) { const left = await models.Share.countDocuments(); if (left) { console.error(`❌ ${left} shares left after account deletes`); process.exitCode = 1; } }
  server?.close(); await mongoose?.disconnect(); await mongo?.stop();
}
