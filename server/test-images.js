// Image upload API: authorization, locked notes, type/size validation, quota races, caching headers,
// lifecycle (trash, permanent delete, orphan cleanup, history, merge, account delete) and export.
// Default: in-memory MongoDB. Against a deployment: API=https://host/api node test-images.js
// (the quota-race and orphan-timing checks need the in-memory server, so they're skipped there).
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
  lib = await import('./src/lib/images.js');
  models = { Image: (await import('./src/models/Image.js')).default, User: (await import('./src/models/User.js')).default };
}

// ---- Tiny real image files ----
const crc32 = (buf) => { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function png(w, h, seed = 0) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = []; for (let y = 0; y < h; y++) { rows.push(Buffer.from([0])); rows.push(Buffer.alloc(w * 4, (y * 7 + seed) & 0xff)); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const gif = Buffer.from('47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b', 'hex');
const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffc0001108002a003803012200021101031101ffd9', 'hex'); // SOF0 56x42
function webp(w, h) { const b = Buffer.alloc(30); b.write('RIFF', 0); b.writeUInt32LE(22, 4); b.write('WEBP', 8); b.write('VP8X', 12); b.writeUInt32LE(10, 16); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b; }
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const PW = `images-${Math.random().toString(36).slice(2)}-Kestrel!`;
const call = async (method, path, { token, body, raw, headers = {} } = {}) => {
  const r = await fetch(base + path, { method, headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }), ...headers }, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const buf = Buffer.from(await r.arrayBuffer());
  let data = buf; try { data = JSON.parse(buf.toString()); } catch { /* binary */ }
  return { status: r.status, data, buf, headers: r.headers };
};
const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const users = [];
const register = async (tag) => {
  const email = `images-${tag}+${stamp}@noted.test`;
  const r = await call('POST', '/auth/register', { body: { name: `Images ${tag}`, email, password: PW } });
  assert.equal(r.status, 201, `register ${tag}: ${JSON.stringify(r.data)}`);
  const u = { email, token: r.data.token, id: r.data.user.id || r.data.user._id }; users.push(u); return u;
};
let checks = 0;
const ok = (cond, what) => { checks++; assert.ok(cond, what); };
const is = (r, code, what) => { checks++; assert.equal(r.status, code, `${what}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`); };
const upload = (token, noteId, bytes, type = 'image/png', extra = {}) => call('POST', `/notes/${noteId}/images`, { token, raw: bytes, headers: { 'Content-Type': type, ...extra } });
const newNote = async (token, content = 'x', title = 'Image test') => (await call('POST', '/notes', { token, body: { title, content } })).data.note;
const list = (token) => call('GET', '/notes', { token });

try {
  const A = await register('a'); const B = await register('b');
  const bNote = await newNote(B.token, 'B note');

  // ---- Upload and serve ----
  const p1 = png(3, 2);
  const up = await upload(B.token, bNote._id, p1);
  is(up, 201, 'png upload'); const img = up.data.image;
  ok(img.mime === 'image/png' && img.width === 3 && img.height === 2 && img.size === p1.length && !('data' in img) && !('user' in img), 'metadata from the bytes, no data/owner in JSON');
  const got = await call('GET', `/images/${img._id}`, { token: B.token });
  is(got, 200, 'owner can fetch');
  ok(got.buf.equals(p1), 'bytes round-trip');
  ok(got.headers.get('content-type') === 'image/png', 'Content-Type from stored mime');
  ok(got.headers.get('x-content-type-options') === 'nosniff', 'nosniff');
  ok(/private/.test(got.headers.get('cache-control')) && /immutable/.test(got.headers.get('cache-control')) && /max-age=31536000/.test(got.headers.get('cache-control')), 'private immutable cache by id');
  ok(!/public/.test(got.headers.get('cache-control')), 'never cached publicly');
  ok(/default-src 'none'/.test(got.headers.get('content-security-policy') || ''), 'image response has a no-script CSP');
  for (const [bytes, type, w, h] of [[jpeg, 'image/jpeg', 56, 42], [gif, 'image/gif', 1, 1], [webp(640, 480), 'image/webp', 640, 480]]) {
    const r = await upload(B.token, bNote._id, bytes, type);
    is(r, 201, `${type} upload`); ok(r.data.image.width === w && r.data.image.height === h && r.data.image.mime === type, `${type} size parsed`);
  }
  const lied = await upload(B.token, bNote._id, gif, 'image/png');
  is(lied, 201, 'declared type wrong but bytes are an image'); ok(lied.data.image.mime === 'image/gif', 'stored type comes from magic bytes, not the header');

  // ---- Authorization ----
  is(await call('GET', `/images/${img._id}`), 401, 'fetch needs auth');
  is(await upload(undefined, bNote._id, p1), 401, 'upload needs auth');
  is(await call('GET', `/images/${img._id}`, { token: A.token }), 404, 'another user gets 404 for the image');
  is(await upload(A.token, bNote._id, p1), 404, 'another user can’t upload into my note');
  is(await call('GET', '/images/not-an-id', { token: B.token }), 400, 'bad id');
  is(await call('GET', `/images/${'0'.repeat(24)}`, { token: B.token }), 404, 'unknown image 404');

  // ---- Type and size rejection ----
  is(await upload(B.token, bNote._id, svg, 'image/svg+xml'), 415, 'SVG rejected');
  is(await upload(B.token, bNote._id, svg, 'image/png'), 415, 'SVG disguised as PNG rejected (magic bytes)');
  is(await upload(B.token, bNote._id, Buffer.from('<html><script>alert(1)</script></html>'), 'image/jpeg'), 415, 'HTML disguised as JPEG rejected');
  is(await upload(B.token, bNote._id, p1, 'text/html'), 415, 'image bytes declared as HTML rejected');
  is(await upload(B.token, bNote._id, Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(64)]), 'image/png'), 415, 'PDF rejected');
  const badHeader = Buffer.concat([p1.subarray(0, 8), Buffer.alloc(40)]);
  is(await upload(B.token, bNote._id, badHeader, 'image/png'), 415, 'PNG magic with a broken header rejected');
  is(await upload(B.token, bNote._id, Buffer.alloc(0), 'image/png'), 400, 'empty body');
  const big = Buffer.concat([p1, Buffer.alloc(3 * 1024 * 1024)]);
  const tooBig = await upload(B.token, bNote._id, big);
  is(tooBig, 413, 'over 3 MB rejected'); ok(/3 MB/.test(tooBig.data.error), 'clear size error');

  // ---- Locked notes ----
  is(await call('PUT', '/auth/lock-pin', { token: B.token, body: { password: PW, pin: '482913' } }), 200, 'set PIN');
  const bLocked = await newNote(B.token, 'locked body');
  const lockedImg = (await upload(B.token, bLocked._id, png(2, 2, 9))).data.image;
  await call('PATCH', `/notes/${bLocked._id}/lock`, { token: B.token, body: { locked: true } });
  is(await call('GET', `/images/${lockedImg._id}`, { token: B.token }), 423, 'locked note’s image is 423 without the unlock');
  is(await upload(B.token, bLocked._id, p1), 423, 'can’t upload into a locked note without the unlock');
  const unlock = (await call('POST', `/notes/${bLocked._id}/unlock`, { token: B.token, body: { pin: '482913' } })).data.unlockToken;
  ok(Boolean(unlock), 'unlock token');
  const lockedGot = await call('GET', `/images/${lockedImg._id}`, { token: B.token, headers: { 'X-Unlock-Token': unlock } });
  is(lockedGot, 200, 'served while unlocked');
  ok(/no-store/.test(lockedGot.headers.get('cache-control')) && lockedGot.headers.get('x-note-locked') === '1', 'locked images are never cached');
  const otherUnlock = (await call('POST', `/notes/${bLocked._id}/unlock`, { token: B.token, body: { pin: '482913' } })).data.unlockToken;
  is(await call('GET', `/images/${lockedImg._id}`, { token: A.token, headers: { 'X-Unlock-Token': otherUnlock } }), 404, 'another user with a stolen unlock token still gets 404');
  is(await call('GET', `/images/${img._id}`, { token: B.token, headers: { 'X-Unlock-Token': unlock } }), 200, 'an unlock for one note doesn’t affect others');
  is(await upload(B.token, bLocked._id, p1, 'image/png', { 'X-Unlock-Token': unlock }), 201, 'upload into unlocked note');

  // ---- Lifecycle: trash keeps, permanent delete removes ----
  const tNote = await newNote(B.token, 'trash me');
  const tImg = (await upload(B.token, tNote._id, png(4, 4, 1))).data.image;
  await call('PUT', `/notes/${tNote._id}`, { token: B.token, body: { content: `![pic](noted-image:${tImg._id})` } });
  await call('DELETE', `/notes/${tNote._id}`, { token: B.token });
  is(await call('GET', `/images/${tImg._id}`, { token: B.token }), 200, 'trashing a note keeps its images');
  await call('POST', `/notes/${tNote._id}/restore`, { token: B.token });
  is(await call('GET', `/images/${tImg._id}`, { token: B.token }), 200, 'restored note’s image still there');
  await call('DELETE', `/notes/${tNote._id}?permanent=true`, { token: B.token });
  is(await call('GET', `/images/${tImg._id}`, { token: B.token }), 404, 'permanent delete removes its images');

  // Copied into another note, then the original is deleted for good: the image moves, it isn't lost.
  const src = await newNote(B.token, 'src');
  const shared = (await upload(B.token, src._id, png(5, 5, 2))).data.image;
  await call('PUT', `/notes/${src._id}`, { token: B.token, body: { content: `![s](noted-image:${shared._id})` } });
  const copy = await newNote(B.token, `copied ![s](noted-image:${shared._id})`);
  await call('DELETE', `/notes/${src._id}?permanent=true`, { token: B.token });
  is(await call('GET', `/images/${shared._id}`, { token: B.token }), 200, 'image still shown by another note survives the original’s permanent delete');
  await call('DELETE', `/notes/${copy._id}?permanent=true`, { token: B.token });
  is(await call('GET', `/images/${shared._id}`, { token: B.token }), 404, '…and goes once no note shows it');

  // Merge: merged note shows the originals' images; emptying the trash (originals) keeps them.
  const m1 = await newNote(B.token, 'm1'); const m2 = await newNote(B.token, 'm2');
  const mImg = (await upload(B.token, m1._id, png(6, 6, 3))).data.image;
  await call('PUT', `/notes/${m1._id}`, { token: B.token, body: { content: `![m](noted-image:${mImg._id})` } });
  const merged = (await call('POST', '/notes/merge', { token: B.token, body: { ids: [m1._id, m2._id] } })).data.note;
  is(await call('DELETE', '/notes/trash', { token: B.token, body: {} }), 200, 'empty trash');
  is(await call('GET', `/images/${mImg._id}`, { token: B.token }), 200, 'merged note keeps showing an image after the originals are purged');
  await call('DELETE', `/notes/${merged._id}?permanent=true`, { token: B.token });

  // ---- Export: Markdown ZIP links images/<id>.<ext> and lists them in images/manifest.json ----
  const eNote = await newNote(B.token, 'export');
  const eImg = (await upload(B.token, eNote._id, png(3, 3, 4))).data.image;
  await call('PUT', `/notes/${eNote._id}`, { token: B.token, body: { title: 'Export with image', content: `Look ![a cat](noted-image:${eImg._id})` } });
  const zipRes = await call('POST', '/notes/export', { token: B.token, body: { format: 'md' } });
  is(zipRes, 200, 'md export');
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(zipRes.buf);
  const md = await zip.file(/export-with-image\.md$/)[0].async('string');
  ok(md.includes(`![a cat](images/${eImg._id}.png)`), 'export rewrites to a relative images/ link');
  const manifest = JSON.parse(await zip.file('images/manifest.json').async('string'));
  ok(manifest.images.some((i) => i.id === eImg._id && i.path === `images/${eImg._id}.png` && i.mime === 'image/png'), 'manifest lists the image');
  ok(!manifest.images.some((i) => i.id === lockedImg._id), 'redacted locked notes’ images aren’t listed');
  const json = await call('GET', '/notes/export', { token: B.token });
  ok(JSON.stringify(json.data).includes(`noted-image:${eImg._id}`), 'JSON export keeps image references');

  // ---- Local-only: orphan cleanup, history, quota races ----
  if (local) {
    lib.orphanConfig.graceMs = 50;
    const oNote = await newNote(B.token, 'orphans');
    const kept = (await upload(B.token, oNote._id, png(2, 3, 5))).data.image;
    const never = (await upload(B.token, oNote._id, png(2, 3, 6))).data.image;
    await call('PUT', `/notes/${oNote._id}`, { token: B.token, body: { content: `![k](noted-image:${kept._id})` }, headers: { 'X-Edit-Session': 's1' } });
    await new Promise((r) => setTimeout(r, 80));
    lib.resetSweepThrottle(); await list(B.token);
    is(await call('GET', `/images/${never._id}`, { token: B.token }), 404, 'never-referenced upload swept after the grace period');
    is(await call('GET', `/images/${kept._id}`, { token: B.token }), 200, 'referenced image kept');
    await call('PUT', `/notes/${oNote._id}`, { token: B.token, body: { content: 'image removed' }, headers: { 'X-Edit-Session': 's2' } });
    const versions = (await call('GET', `/notes/${oNote._id}/versions`, { token: B.token })).data.versions;
    const withImg = versions.find((v) => v.preview.includes(kept._id));
    ok(Boolean(withImg), 'history has the version with the image');
    await new Promise((r) => setTimeout(r, 80));
    lib.resetSweepThrottle(); await list(B.token);
    is(await call('GET', `/images/${kept._id}`, { token: B.token }), 200, 'image removed from the text but shown by a history version is kept');
    const restored = await call('POST', `/notes/${oNote._id}/versions/${withImg._id}/restore`, { token: B.token });
    ok(restored.data.note.content.includes(kept._id), 'restoring the version brings the image back');
    // Within the grace period nothing goes.
    lib.orphanConfig.graceMs = 60 * 60 * 1000;
    const fresh = (await upload(B.token, oNote._id, png(2, 3, 7))).data.image;
    lib.resetSweepThrottle(); await list(B.token);
    is(await call('GET', `/images/${fresh._id}`, { token: B.token }), 200, 'new upload kept during the grace period (e.g. while still being inserted)');

    // Quota: count race.
    const Q = await register('q'); const qNote = await newNote(Q.token, 'quota');
    lib.quota.maxCount = 5;
    const race = await Promise.all(Array.from({ length: 14 }, (_, i) => upload(Q.token, qNote._id, png(2, 2, 20 + i))));
    const won = race.filter((r) => r.status === 201).length;
    ok(won === 5, `count race: exactly 5 of 14 parallel uploads succeed (got ${won})`);
    ok(race.filter((r) => r.status === 409).every((r) => /at most 5 images/.test(r.data.error)), 'clear count-quota error');
    let q = await models.User.findById(Q.id).select('+imageCount +imageBytes').lean();
    ok(q.imageCount === 5 && q.imageCount === await models.Image.countDocuments({ user: Q.id }), 'counter matches stored images');
    const bytesStored = (await models.Image.find({ user: Q.id }).lean()).reduce((s, i) => s + i.size, 0);
    ok(q.imageBytes === bytesStored, 'byte counter matches');
    // Permanent delete gives the slots back.
    await call('DELETE', `/notes/${qNote._id}?permanent=true`, { token: Q.token });
    q = await models.User.findById(Q.id).select('+imageCount +imageBytes').lean();
    ok(q.imageCount === 0 && q.imageBytes === 0, 'permanent delete releases the quota');
    // Bytes race.
    lib.quota.maxCount = 200;
    const q2 = await newNote(Q.token, 'bytes');
    const sample = png(64, 64, 1);
    lib.quota.maxBytes = sample.length * 3 + 10;
    const race2 = await Promise.all(Array.from({ length: 10 }, () => upload(Q.token, q2._id, sample)));
    ok(race2.filter((r) => r.status === 201).length === 3, 'bytes race: exactly 3 fit');
    ok(race2.filter((r) => r.status === 409).every((r) => /image storage/.test(r.data.error)), 'clear storage-quota error');
    lib.quota.maxBytes = 100 * 1024 * 1024;
    // Accounts with no counter yet are backfilled from their images.
    await models.User.updateOne({ _id: Q.id }, { $unset: { imageCount: 1, imageBytes: 1 } });
    lib.quota.maxCount = 4;
    is(await upload(Q.token, q2._id, sample), 201, 'backfilled counter allows the 4th');
    is(await upload(Q.token, q2._id, sample), 409, 'backfilled counter stops the 5th');
    lib.quota.maxCount = 200;

    // Account delete removes every image.
    is(await call('DELETE', '/auth/me', { token: Q.token, body: { password: PW } }), 200, 'delete account');
    users.splice(users.indexOf(Q), 1);
    ok(await models.Image.countDocuments({ user: Q.id }) === 0, 'account delete removes all its images');
  }
  console.log(`✅ images: ${checks} checks passed${local ? '' : ' (deployment mode: race/orphan checks skipped)'}`);
} catch (err) {
  console.error('❌', err); process.exitCode = 1;
} finally {
  for (const u of users) await call('DELETE', '/auth/me', { token: u.token, body: { password: PW } }).catch(() => {});
  if (local) { const left = await models.Image.countDocuments(); if (left) { console.error(`❌ ${left} images left after account deletes`); process.exitCode = 1; } }
  server?.close(); await mongoose?.disconnect(); await mongo?.stop();
}
