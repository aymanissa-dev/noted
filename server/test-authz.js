// Cross-account authorization + voice note API checks.
// Default: in-memory MongoDB. Against a deployment: API=https://host/api node test-authz.js
// Creates two throwaway accounts (A, B), proves A's token can't read/modify/delete anything of B's
// (notes, folders, history, voice, unlock), then deletes both accounts.
import assert from 'node:assert/strict';

let server, mongo, mongoose, base = process.env.API;
if (!base) {
  ({ default: mongoose } = await import('mongoose'));
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const { createApp } = await import('./src/app.js');
  process.env.JWT_SECRET = 'test-secret';
  process.env.RATE_LIMITS = 'off'; // limits have their own tests (test-security.js)
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri());
  server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}/api`;
}
const PW = `authz-${Math.random().toString(36).slice(2)}-Kestrel!`;
const call = async (method, path, { token, body, raw, headers = {} } = {}) => {
  const r = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const buf = Buffer.from(await r.arrayBuffer());
  let data = buf; try { data = JSON.parse(buf.toString()); } catch { /* binary */ }
  return { status: r.status, data, buf, headers: r.headers };
};
const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const users = [];
const register = async (tag) => {
  const email = `authz-${tag}+${stamp}@noted.test`;
  const r = await call('POST', '/auth/register', { body: { name: `Authz ${tag}`, email, password: PW } });
  assert.equal(r.status, 201, `register ${tag}: ${JSON.stringify(r.data)}`);
  users.push({ email, token: r.data.token }); return { email, token: r.data.token, id: r.data.user._id };
};
let checks = 0;
const denied = (r, what) => { checks++; assert.ok([400, 401, 403, 404].includes(r.status), `${what}: expected denial, got ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`); };
const okStatus = (r, code, what) => { checks++; assert.equal(r.status, code, `${what}: ${JSON.stringify(r.data).slice(0, 200)}`); };
const SECRET = `b-secret-${stamp}`;
const leaks = (r) => JSON.stringify(r.data ?? '').includes(SECRET) || r.buf.includes(SECRET);

try {
  const A = await register('a'); const B = await register('b');
  // ---- B's data ----
  const bFolder = (await call('POST', '/folders', { token: B.token, body: { name: `B folder ${SECRET}` } })).data.folder;
  const bNote = (await call('POST', '/notes', { token: B.token, body: { title: `B note ${SECRET}`, content: `body ${SECRET}`, tags: [`btag${stamp}`], folderId: bFolder._id } })).data.note;
  for (const [i, s] of [['v1', 's1'], ['v2', 's2']]) await call('PUT', `/notes/${bNote._id}`, { token: B.token, body: { content: `body ${SECRET} ${i}` }, headers: { 'X-Edit-Session': s } });
  const bVersions = (await call('GET', `/notes/${bNote._id}/versions`, { token: B.token })).data.versions;
  assert.ok(bVersions.length >= 1, 'B has history');
  const bVid = bVersions[0]._id;
  // Voice: upload, list, play (full + range) — the basic voice API test.
  const audio = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(2048, 7)]);
  const up = await call('POST', `/notes/${bNote._id}/audio`, { token: B.token, raw: audio, headers: { 'Content-Type': 'audio/ogg', 'X-Audio-Duration': '3' } });
  okStatus(up, 201, 'voice: upload'); const bClip = up.data.clip;
  checks++; assert.ok(bClip.size === audio.length && bClip.duration === 3 && !('data' in bClip), 'voice: metadata only, no bytes in JSON');
  const list = await call('GET', `/notes/${bNote._id}/audio`, { token: B.token });
  checks++; assert.equal(list.data.clips.length, 1, 'voice: listed');
  const play = await call('GET', `/audio/${bClip._id}`, { token: B.token });
  okStatus(play, 200, 'voice: playback'); checks++; assert.ok(play.buf.equals(audio) && play.headers.get('content-type') === 'audio/ogg', 'voice: bytes + type round-trip');
  checks++; assert.match(play.headers.get('cache-control') || '', /no-store/, 'voice: not cacheable');
  const range = await call('GET', `/audio/${bClip._id}`, { token: B.token, headers: { Range: 'bytes=0-3' } });
  okStatus(range, 206, 'voice: range request'); checks++; assert.equal(range.buf.toString(), 'OggS', 'voice: range bytes');
  okStatus(await call('POST', `/notes/${bNote._id}/audio`, { token: B.token, raw: audio, headers: { 'Content-Type': 'audio/x-evil' } }), 415, 'voice: unsupported type rejected');
  okStatus(await call('GET', `/audio/${bClip._id}`), 401, 'voice: playback needs auth');
  // Locked note with PIN
  await call('PUT', '/auth/lock-pin', { token: B.token, body: { password: PW, pin: '482648' } });
  const bLocked = (await call('POST', '/notes', { token: B.token, body: { title: `B locked ${SECRET}`, content: `locked ${SECRET}` } })).data.note;
  okStatus(await call('PATCH', `/notes/${bLocked._id}/lock`, { token: B.token, body: { locked: true } }), 200, 'B locks a note');
  const bUnlock = await call('POST', `/notes/${bLocked._id}/unlock`, { token: B.token, body: { pin: '482648' } });
  okStatus(bUnlock, 200, 'B unlocks own note'); const bUnlockToken = bUnlock.data.unlockToken;
  const bLockedClip = (await call('POST', `/notes/${bLocked._id}/audio`, { token: B.token, raw: audio, headers: { 'Content-Type': 'audio/webm', 'X-Unlock-Token': bUnlockToken } })).data.clip;
  okStatus(await call('GET', `/audio/${bLockedClip._id}`, { token: B.token }), 423, 'voice on a locked note needs the unlock');

  // ---- A's own data (for cross-reference attacks) ----
  const aNote = (await call('POST', '/notes', { token: A.token, body: { title: 'A note', content: 'a' } })).data.note;
  await call('PUT', '/auth/lock-pin', { token: A.token, body: { password: PW, pin: '135713' } });

  const T = { token: A.token };
  const U = (h = {}) => ({ token: A.token, headers: { 'X-Unlock-Token': bUnlockToken, ...h } });
  // Notes: read / write / delete / state changes
  for (const id of [bNote._id, bLocked._id]) {
    for (const [m, p, body] of [
      ['GET', `/notes/${id}`], ['GET', `/notes/${id}?prefetch=1`], ['PUT', `/notes/${id}`, { title: 'pwned' }], ['PATCH', `/notes/${id}`, { content: 'pwned' }],
      ['PATCH', `/notes/${id}/pin`], ['PATCH', `/notes/${id}/archive`], ['POST', `/notes/${id}/restore`],
      ['PATCH', `/notes/${id}/folder`, { folderId: null }], ['PATCH', `/notes/${id}/lock`, { locked: false, pin: '482648' }], ['PATCH', `/notes/${id}/lock`, { locked: true }],
      ['POST', `/notes/${id}/unlock`, { pin: '482648' }], ['POST', `/notes/${id}/unlock`, { pin: '135713' }],
      ['GET', `/notes/${id}/versions`], ['GET', `/notes/${id}/versions/${bVid}`], ['POST', `/notes/${id}/versions/${bVid}/restore`],
      ['GET', `/notes/${id}/audio`], ['POST', `/notes/${id}/audio`, undefined, audio],
      ['DELETE', `/notes/${id}`], ['DELETE', `/notes/${id}?permanent=true`],
    ]) {
      for (const opts of [T, U()]) {
        const r = await call(m, p, { ...opts, body, ...(m === 'POST' && p.endsWith('/audio') && { raw: audio, body: undefined, headers: { ...opts.headers, 'Content-Type': 'audio/ogg' } }) });
        denied(r, `A ${m} ${p}`); checks++; assert.ok(!leaks(r), `A ${m} ${p} leaked B's content`);
      }
    }
  }
  // B's history entries via A's own note id
  denied(await call('GET', `/notes/${aNote._id}/versions/${bVid}`, T), 'A reads B version via own note');
  denied(await call('POST', `/notes/${aNote._id}/versions/${bVid}/restore`, T), 'A restores B version into own note');
  // Voice clips
  for (const c of [bClip, bLockedClip]) {
    denied(await call('GET', `/audio/${c._id}`, U()), 'A plays B clip');
    denied(await call('GET', `/audio/${c._id}`, { ...U(), headers: { 'X-Unlock-Token': bUnlockToken, Range: 'bytes=0-3' } }), 'A range-reads B clip');
    denied(await call('DELETE', `/audio/${c._id}`, U()), 'A deletes B clip');
  }
  // Folders
  denied(await call('PATCH', `/folders/${bFolder._id}`, { ...T, body: { name: 'pwned' } }), 'A renames B folder');
  denied(await call('DELETE', `/folders/${bFolder._id}`, T), 'A deletes B folder');
  denied(await call('PATCH', `/notes/${aNote._id}/folder`, { ...T, body: { folderId: bFolder._id } }), 'A moves own note into B folder');
  denied(await call('PUT', `/notes/${aNote._id}`, { ...T, body: { folderId: bFolder._id } }), 'A sets B folder via update');
  denied(await call('POST', '/notes', { ...T, body: { title: 'x', folderId: bFolder._id } }), 'A creates note in B folder');
  denied(await call('GET', `/notes?folder=${bFolder._id}`, T).then((r) => (r.data.notes?.length ? r : { ...r, status: 404 })), 'A lists B folder');
  // Merge / lists / search / tags / export / stats never include B
  denied(await call('POST', '/notes/merge', { ...T, body: { ids: [aNote._id, bNote._id] } }), 'A merges B note');
  for (const p of ['/notes', `/notes?search=${SECRET}`, `/notes?tag=btag${stamp}`, '/notes/recent', '/notes/tags', '/notes?view=archive', '/notes?view=trash', '/folders', '/notes/export', '/stats', '/auth/activity', '/auth/me']) {
    const r = await call('GET', p, T); checks++; assert.ok(r.status < 500 && !leaks(r) && !JSON.stringify(r.data).includes(`btag${stamp}`), `A ${p} leaks B (${r.status})`);
  }
  // Import with B's ids must not touch B's notes
  await call('POST', '/notes/import', { ...T, body: { notes: [{ _id: bNote._id, title: 'imported', content: 'x' }] } });
  // Token tampering
  const [h, p] = A.token.split('.');
  const forged = [h, Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), sub: B.id })).toString('base64url'), A.token.split('.')[2]].join('.');
  denied(await call('GET', `/notes/${bNote._id}`, { token: forged }), 'forged sub (bad signature)');
  const none = [Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: B.id })).toString('base64url'), ''].join('.');
  denied(await call('GET', '/notes', { token: none }), 'alg=none token');
  denied(await call('GET', `/notes/${bNote._id}`, { token: bUnlockToken }), 'unlock token used as a session token');

  // ---- B's data is intact ----
  const after = (await call('GET', `/notes/${bNote._id}`, { token: B.token })).data.note;
  checks++; assert.ok(after.title.includes(SECRET) && after.content.includes(SECRET) && !after.pinned && !after.archived && !after.deletedAt && after.folderId === bFolder._id, 'B note untouched');
  const folders = (await call('GET', '/folders', { token: B.token })).data.folders;
  checks++; assert.ok(folders.some((f) => f._id === bFolder._id && f.name.includes(SECRET)), 'B folder untouched');
  checks++; assert.equal((await call('GET', `/notes/${bNote._id}/audio`, { token: B.token })).data.clips.length, 1, 'B clip untouched');
  checks++; assert.equal((await call('GET', `/notes/${bLocked._id}`, { token: B.token })).data.note.locked, true, 'B locked note still locked');
  okStatus(await call('POST', `/notes/${bLocked._id}/unlock`, { token: B.token, body: { pin: '482648' } }), 200, 'B PIN not rate-limited by A attempts');
  checks++; assert.ok((await call('GET', `/notes/${bNote._id}/versions`, { token: B.token })).data.versions.length >= bVersions.length, 'B history untouched');
  // voice delete by owner
  okStatus(await call('DELETE', `/audio/${bClip._id}`, { token: B.token }), 204, 'voice: owner deletes');
  okStatus(await call('GET', `/audio/${bClip._id}`, { token: B.token }), 404, 'voice: gone after delete');
  console.log(`✅ authz + voice tests passed (${checks} checks) against ${process.env.API ? base : 'in-memory API'}`);
} finally {
  for (const u of users) {
    const r = await call('DELETE', '/auth/me', { token: u.token, body: { password: PW } });
    if (process.env.API) console.log('cleanup', u.email, r.status);
  }
  server?.close(); if (mongoose) { await mongoose.disconnect(); await mongo.stop(); }
}
