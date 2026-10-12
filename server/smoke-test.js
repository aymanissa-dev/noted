// Smoke test: boots the API against an in-memory MongoDB and exercises the main flows.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from './src/app.js';
import Note from './src/models/Note.js';
import NoteVersion from './src/models/NoteVersion.js';
import { versionConfig, MAX_VERSIONS } from './src/lib/versions.js';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret';
const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri());
const server = createApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;

let token;
const call = async (method, path, body) => {
  const r = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: r.status, data: r.status === 204 ? null : await r.json() };
};

try {
  let r = await call('POST', '/auth/register', { name: 'Ada', email: 'ada@example.com', password: 'password123' });
  assert.equal(r.status, 201);
  r = await call('POST', '/auth/register', { name: 'Ada', email: 'ada@example.com', password: 'password123' });
  assert.equal(r.status, 409);
  r = await call('POST', '/auth/login', { email: 'ada@example.com', password: 'wrong-pass' });
  assert.equal(r.status, 401);
  r = await call('POST', '/auth/login', { email: 'ada@example.com', password: 'password123' });
  assert.equal(r.status, 200); token = r.data.token;
  r = await call('GET', '/auth/me'); assert.equal(r.data.user.email, 'ada@example.com');

  const a = (await call('POST', '/notes', { title: 'Groceries', content: 'milk, eggs', tags: ['Home', 'list'] })).data.note;
  await new Promise((s) => setTimeout(s, 10));
  const b = (await call('POST', '/notes', { title: 'Ideas', content: 'build a notes app', tags: 'work' })).data.note;
  assert.equal((await call('POST', '/notes', {})).status, 400);

  r = await call('GET', '/notes'); assert.deepEqual(r.data.notes.map((n) => n.title), ['Ideas', 'Groceries']);
  r = await call('GET', '/notes?search=EGGS'); assert.deepEqual(r.data.notes.map((n) => n.title), ['Groceries']);
  r = await call('GET', '/notes?tag=work'); assert.deepEqual(r.data.notes.map((n) => n.title), ['Ideas']);
  r = await call('GET', '/notes/tags'); assert.deepEqual(r.data.tags, ['home', 'list', 'work']);

  r = await call('PATCH', `/notes/${a._id}/pin`); assert.equal(r.data.note.pinned, true);
  r = await call('GET', '/notes'); assert.equal(r.data.notes[0].title, 'Groceries');

  r = await call('PUT', `/notes/${b._id}`, { title: 'Ideas v2' }); assert.equal(r.data.note.title, 'Ideas v2');

  // autosave: rapid partial updates, last write wins, other fields untouched
  for (const t of ['I', 'Id', 'Ide', 'Ideas v3']) await call('PATCH', `/notes/${b._id}`, { title: t });
  r = await call('PATCH', `/notes/${b._id}`, { content: 'autosaved body' });
  assert.equal(r.data.note.title, 'Ideas v3'); assert.equal(r.data.note.content, 'autosaved body');
  assert.deepEqual(r.data.note.tags, ['work']);
  // archive
  r = await call('PATCH', `/notes/${b._id}/archive`); assert.equal(r.data.note.archived, true);
  assert.deepEqual((await call('GET', '/notes')).data.notes.map((n) => n.title), ['Groceries']);
  assert.deepEqual((await call('GET', '/notes?view=archive')).data.notes.map((n) => n.title), ['Ideas v3']);
  r = await call('PATCH', `/notes/${b._id}/archive`); assert.equal(r.data.note.archived, false);
  assert.equal((await call('GET', '/notes?view=nope')).status, 400);

  // trash: soft delete, restore, permanent delete
  r = await call('DELETE', `/notes/${b._id}`); assert.equal(r.status, 200); assert.ok(r.data.note.deletedAt);
  assert.deepEqual((await call('GET', '/notes')).data.notes.map((n) => n.title), ['Groceries']);
  assert.deepEqual((await call('GET', '/notes?view=trash')).data.notes.map((n) => n.title), ['Ideas v3']);
  assert.deepEqual((await call('GET', '/notes/tags')).data.tags, ['home', 'list']);
  r = await call('POST', `/notes/${b._id}/restore`); assert.equal(r.data.note.deletedAt, null);
  assert.equal((await call('GET', '/notes')).data.notes.length, 2);
  await call('DELETE', `/notes/${b._id}`);
  assert.equal((await call('DELETE', `/notes/${b._id}?permanent=true`)).status, 204);
  assert.equal((await call('GET', `/notes/${b._id}`)).status, 404);

  // trash older than 30 days is purged lazily on list
  const old = (await call('POST', '/notes', { title: 'Old trash' })).data.note;
  const fresh = (await call('POST', '/notes', { title: 'Fresh trash' })).data.note;
  await call('DELETE', `/notes/${old._id}`); await call('DELETE', `/notes/${fresh._id}`);
  await Note.updateOne({ _id: old._id }, { deletedAt: new Date(Date.now() - 31 * 864e5) });
  assert.deepEqual((await call('GET', '/notes?view=trash')).data.notes.map((n) => n.title), ['Fresh trash']);
  assert.equal(await Note.countDocuments({ _id: old._id }), 0);
  r = await call('DELETE', '/notes/trash'); assert.equal(r.data.deleted, 1);
  assert.equal((await call('GET', '/notes?view=trash')).data.notes.length, 0);

  // export / import
  r = await call('GET', '/notes/export'); assert.equal(r.status, 200);
  assert.equal(r.data.app, 'noted'); assert.ok(r.data.notes.every((n) => !('user' in n) && !('_id' in n)));
  const exported = r.data;
  const zipRes = await fetch(`${base}/notes/export?format=md`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(zipRes.headers.get('content-type'), 'application/zip');
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(Buffer.from(await zipRes.arrayBuffer()));
  const md = await zip.file('groceries.md').async('string');
  assert.match(md, /^---\ntitle: "Groceries"/); assert.match(md, /milk, eggs/);
  assert.equal((await call('POST', '/notes/import', { notes: 'nope' })).status, 400);
  assert.equal((await call('POST', '/notes/import', { notes: [{ title: 5 }] })).status, 400);
  assert.equal((await call('POST', '/notes/import', { notes: [] })).status, 400);
  const before = (await call('GET', '/notes')).data.notes.length;
  // re-importing your own export is a no-op (exact duplicates are skipped)
  r = await call('POST', '/notes/import', exported);
  assert.equal(r.status, 200); assert.equal(r.data.imported, 0); assert.equal(r.data.skippedDuplicates, exported.notes.length);
  // same content without ids is still detected by fingerprint; duplicates inside the file are skipped too
  r = await call('POST', '/notes/import', { notes: exported.notes.map(({ id, ...n }) => n) });
  assert.equal(r.data.imported, 0);
  const strip = ({ id, ...n }) => ({ ...n, createdAt: new Date(Date.now() - 864e5).toISOString() }); // same text, other date → new
  r = await call('POST', '/notes/import', { notes: [...exported.notes.map(strip), { title: 'Imported', content: 'x', tags: ['New '], user: '000000000000000000000000', _id: 'evil' }, { title: 'Imported', content: 'x', tags: ['New '] }] });
  assert.equal(r.status, 201); assert.equal(r.data.imported, exported.notes.length + 1); assert.equal(r.data.skippedDuplicates, 0);
  const afterList = (await call('GET', '/notes?search=Imported')).data.notes;
  assert.equal(afterList.length, 1); assert.deepEqual(afterList[0].tags, ['new']);
  assert.equal(String(afterList[0].user), String((await call('GET', '/auth/me')).data.user.id));
  assert.equal((await call('GET', '/notes')).data.notes.length, before + exported.notes.length + 1);
  // remove the imported copies again
  for (const n of (await call('GET', '/notes')).data.notes.slice(1)) await call('DELETE', `/notes/${n._id}?permanent=true`);

  // colors and emoji
  r = await call('PATCH', `/notes/${a._id}`, { color: 'blue', emoji: '🛒' });
  assert.equal(r.data.note.color, 'blue'); assert.equal(r.data.note.emoji, '🛒');
  assert.equal((await call('PATCH', `/notes/${a._id}`, { color: 'chartreuse' })).status, 400);
  assert.equal((await call('PATCH', `/notes/${a._id}`, { emoji: 'abc' })).status, 400);
  assert.equal((await call('PATCH', `/notes/${a._id}`, { emoji: '🛒🛒' })).status, 400);
  assert.equal((await call('PATCH', `/notes/${a._id}`, { emoji: '👩‍💻' })).data.note.emoji, '👩‍💻');
  r = await call('POST', '/notes', { title: 'Plain' }); assert.equal(r.data.note.color, ''); assert.equal(r.data.note.emoji, '');
  await call('DELETE', `/notes/${r.data.note._id}?permanent=true`);
  r = await call('GET', '/notes/export'); assert.equal(r.data.notes.find((n) => n.title === 'Groceries').color, 'blue');
  r = await call('PATCH', `/notes/${a._id}`, { color: '', emoji: '' }); assert.equal(r.data.note.color, ''); assert.equal(r.data.note.emoji, '');

  // version history
  {
    const h = (await call('POST', '/notes', { title: 'History', content: 'v1' })).data.note;
    const versions = async () => (await call('GET', `/notes/${h._id}/versions`)).data.versions;
    await call('PATCH', `/notes/${h._id}`, { content: 'v2' });       // first edit snapshots v1
    await call('PATCH', `/notes/${h._id}`, { content: 'v3' });       // throttled
    await call('PATCH', `/notes/${h._id}`, { content: 'v4' });       // throttled
    let vs = await versions();
    assert.equal(vs.length, 1); assert.equal(vs[0].preview, 'v1');
    await call('PATCH', `/notes/${h._id}`, { pinned: true });        // non-content change: no snapshot
    assert.equal((await versions()).length, 1);
    await call('PATCH', `/notes/${h._id}`, { content: 'x'.repeat(400) }); // significant change snapshots v4
    vs = await versions(); assert.equal(vs.length, 2); assert.equal(vs[0].preview, 'v4');
    // after the interval passes, the next edit snapshots again
    await NoteVersion.updateMany({ note: h._id }, { createdAt: new Date(Date.now() - versionConfig.intervalMs - 1000) });
    await call('PATCH', `/notes/${h._id}`, { content: 'v6' });
    vs = await versions(); assert.equal(vs.length, 3);
    // preview + restore (restore snapshots the current state first)
    const v1 = vs.find((v) => v.preview === 'v1');
    r = await call('GET', `/notes/${h._id}/versions/${v1._id}`); assert.equal(r.data.version.content, 'v1');
    r = await call('POST', `/notes/${h._id}/versions/${v1._id}/restore`); assert.equal(r.data.note.content, 'v1');
    vs = await versions(); assert.equal(vs.length, 4); assert.equal(vs[0].reason, 'restore'); assert.equal(vs[0].preview, 'v6');
    assert.equal((await call('GET', `/notes/${h._id}/versions/000000000000000000000000`)).status, 404);
    // cap per note
    const prev = versionConfig.intervalMs; versionConfig.intervalMs = 0;
    for (let i = 0; i < MAX_VERSIONS + 5; i++) await call('PATCH', `/notes/${h._id}`, { content: `rev ${i}` });
    versionConfig.intervalMs = prev;
    assert.equal(await NoteVersion.countDocuments({ note: h._id }), MAX_VERSIONS);
    // permanent delete removes history
    await call('DELETE', `/notes/${h._id}`); await call('DELETE', `/notes/${h._id}?permanent=true`);
    assert.equal(await NoteVersion.countDocuments({ note: h._id }), 0);
  }

  // quick capture payload (title + content + tags) round-trips
  r = await call('POST', '/notes', { title: 'Call mom', content: 'about Sunday', tags: ['family'] });
  assert.equal(r.status, 201); assert.equal(r.data.note.title, 'Call mom'); assert.deepEqual(r.data.note.tags, ['family']);
  await call('DELETE', `/notes/${r.data.note._id}?permanent=true`);
  assert.equal((await call('POST', '/notes', { title: 'x'.repeat(201) })).status, 400);

  // sign out of all devices
  {
    const login = async () => (await call('POST', '/auth/login', { email: 'ada@example.com', password: 'password123' })).data.token;
    const deviceA = token; const deviceB = await login();
    const asToken = async (t, m, p, b) => { const keep = token; token = t; const out = await call(m, p, b); token = keep; return out; };
    assert.equal((await asToken(deviceB, 'GET', '/auth/me')).status, 200);
    r = await asToken(deviceA, 'POST', '/auth/logout-all'); assert.equal(r.status, 200); assert.ok(r.data.token);
    const fresh = r.data.token;
    assert.equal((await asToken(deviceA, 'GET', '/auth/me')).status, 401);   // old tokens revoked
    assert.equal((await asToken(deviceB, 'GET', '/auth/me')).status, 401);
    assert.equal((await asToken(fresh, 'GET', '/auth/me')).status, 200);     // current session kept
    // a token without a version (issued before this feature) only works while tokenVersion is 0
    const jwt = (await import('jsonwebtoken')).default;
    const legacy = jwt.sign({ sub: String((await asToken(fresh, 'GET', '/auth/me')).data.user.id) }, process.env.JWT_SECRET);
    assert.equal((await asToken(legacy, 'GET', '/auth/me')).status, 401);
    token = fresh;
  }

  // PIN-locked notes
  {
    const secret = (await call('POST', '/notes', { title: 'Bank codes', content: 'secret-sauce 1234', tags: ['private'] })).data.note;
    assert.equal((await call('PATCH', `/notes/${secret._id}/lock`, { locked: true })).status, 400); // no PIN yet
    assert.equal((await call('PUT', '/auth/lock-pin', { password: 'wrong-pass', pin: '1234' })).status, 403);
    assert.equal((await call('PUT', '/auth/lock-pin', { password: 'password123', pin: '12ab' })).status, 400);
    assert.equal((await call('PUT', '/auth/lock-pin', { password: 'password123', pin: '1234567' })).status, 400);
    r = await call('PUT', '/auth/lock-pin', { password: 'password123', pin: '2468' }); assert.equal(r.data.user.hasLockPin, true);
    assert.equal((await call('GET', '/auth/me')).data.user.hasLockPin, true);
    const dbUser = await (await import('./src/models/User.js')).default.findOne({ email: 'ada@example.com' }).select('+lockPinHash');
    assert.ok(dbUser.lockPinHash.startsWith('$2')); // bcrypt-hashed, never plain

    r = await call('PATCH', `/notes/${secret._id}/lock`, { locked: true });
    assert.equal(r.data.note.locked, true); assert.equal(r.data.note.title, ''); assert.equal(r.data.note.content, '');
    // never leaked through list, get, search, tags, versions, or edits
    const listed = (await call('GET', '/notes')).data.notes.find((n) => n._id === secret._id);
    assert.equal(listed.title, ''); assert.equal(listed.content, ''); assert.deepEqual(listed.tags, []); assert.equal(listed.redacted, true);
    assert.equal((await call('GET', `/notes/${secret._id}`)).data.note.content, '');
    assert.equal((await call('GET', '/notes?search=secret-sauce')).data.notes.length, 0);
    assert.equal((await call('GET', '/notes?tag=private')).data.notes.length, 0);
    assert.ok(!(await call('GET', '/notes/tags')).data.tags.includes('private'));
    assert.equal((await call('GET', `/notes/${secret._id}/versions`)).status, 423);
    assert.equal((await call('PATCH', `/notes/${secret._id}`, { content: 'overwrite' })).status, 423);
    assert.ok(!JSON.stringify((await call('GET', '/notes?view=active')).data).includes('secret-sauce'));

    // unlock with PIN → content + unlock token, which allows edits/history for 15 min
    assert.equal((await call('POST', `/notes/${secret._id}/unlock`, { pin: '0000' })).status, 403);
    r = await call('POST', `/notes/${secret._id}/unlock`, { pin: '2468' });
    assert.equal(r.status, 200); assert.equal(r.data.note.content, 'secret-sauce 1234'); assert.ok(r.data.unlockToken);
    const ut = r.data.unlockToken;
    const withUnlock = async (m, p, b, t = ut) => {
      const res2 = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Unlock-Token': t }, body: b && JSON.stringify(b) });
      return { status: res2.status, data: await res2.json().catch(() => null) };
    };
    assert.equal((await withUnlock('GET', `/notes/${secret._id}`)).data.note.content, 'secret-sauce 1234');
    r = await withUnlock('PATCH', `/notes/${secret._id}`, { content: 'secret-sauce 5678' });
    assert.equal(r.status, 200); assert.equal(r.data.note.content, 'secret-sauce 5678');
    assert.equal((await withUnlock('GET', `/notes/${secret._id}/versions`)).status, 200);
    // an unlock token for another note doesn't work
    const other = (await call('POST', '/notes', { title: 'other' })).data.note;
    await call('PATCH', `/notes/${other._id}/lock`, { locked: true });
    assert.equal((await withUnlock('GET', `/notes/${other._id}`)).data.note.content, '');
    await call('DELETE', `/notes/${other._id}?permanent=true`);
    // an access token can't be used as an unlock token and vice versa
    assert.equal((await withUnlock('GET', `/notes/${secret._id}`, undefined, token)).data.note.content, '');
    { const keep = token; token = ut; assert.equal((await call('GET', '/notes')).status, 401); token = keep; }

    // export: flagged/redacted without PIN, full with PIN; import skips redacted
    r = await call('GET', '/notes/export');
    const flagged = r.data.notes.find((n) => n.locked);
    assert.equal(flagged.redacted, true); assert.equal(flagged.content, ''); assert.ok(!JSON.stringify(r.data).includes('secret-sauce'));
    const zipNoPin = await JSZip.loadAsync(Buffer.from(await (await fetch(`${base}/notes/export?format=md`, { headers: { Authorization: `Bearer ${token}` } })).arrayBuffer()));
    assert.ok(zipNoPin.file('locked-note.md')); assert.ok(!(await zipNoPin.file('locked-note.md').async('string')).includes('secret'));
    const withPin = async (pin) => fetch(`${base}/notes/export`, { headers: { Authorization: `Bearer ${token}`, 'X-Lock-Pin': pin } });
    assert.equal((await withPin('9999')).status, 403);
    const full = await (await withPin('2468')).json();
    assert.equal(full.notes.find((n) => n.locked).content, 'secret-sauce 5678');
    r = await call('POST', '/notes/import', { notes: [flagged] }); assert.equal(r.status, 400);
    r = await call('POST', '/notes/import', { notes: [flagged, { title: 'Imported ok' }] });
    assert.equal(r.data.imported, 1); assert.equal(r.data.skippedLocked, 1);
    const imp = (await call('GET', '/notes?search=Imported ok')).data.notes[0];
    await call('DELETE', `/notes/${imp._id}?permanent=true`);

    // rate limit: 5 wrong PINs block further attempts (even the right one)
    for (let i = 0; i < 3; i++) assert.equal((await call('POST', `/notes/${secret._id}/unlock`, { pin: '1111' })).status, 403);
    assert.equal((await call('POST', `/notes/${secret._id}/unlock`, { pin: '1111' })).status, 403); // 5th failure overall since last success? reset on success above
    assert.equal((await call('POST', `/notes/${secret._id}/unlock`, { pin: '1111' })).status, 403);
    assert.equal((await call('POST', `/notes/${secret._id}/unlock`, { pin: '2468' })).status, 429);
    await (await import('./src/models/User.js')).default.updateOne({ email: 'ada@example.com' }, { lockPinBlockedUntil: null, lockPinFailures: 0 });

    // changing the PIN requires the password and expires old unlock tokens
    assert.equal((await call('PUT', '/auth/lock-pin', { password: 'nope-nope', pin: '1357' })).status, 403);
    assert.equal((await call('PUT', '/auth/lock-pin', { password: 'password123', pin: '1357' })).status, 200);
    assert.equal((await withUnlock('GET', `/notes/${secret._id}`)).data.note.content, '');
    assert.equal((await call('POST', `/notes/${secret._id}/unlock`, { pin: '2468' })).status, 403);
    assert.equal((await call('POST', `/notes/${secret._id}/unlock`, { pin: '1357' })).status, 200);

    // removing the lock from one note needs the PIN
    assert.equal((await call('PATCH', `/notes/${secret._id}/lock`, { locked: false, pin: '0000' })).status, 403);
    r = await call('PATCH', `/notes/${secret._id}/lock`, { locked: false, pin: '1357' });
    assert.equal(r.data.note.locked, false); assert.equal(r.data.note.content, 'secret-sauce 5678');
    // removing the PIN needs the password and unlocks every locked note
    await call('PATCH', `/notes/${secret._id}/lock`, { locked: true });
    assert.equal((await call('DELETE', '/auth/lock-pin', { password: 'nope-nope' })).status, 403);
    r = await call('DELETE', '/auth/lock-pin', { password: 'password123' });
    assert.equal(r.data.user.hasLockPin, false); assert.equal(r.data.unlockedNotes, 1);
    assert.equal((await call('GET', `/notes/${secret._id}`)).data.note.content, 'secret-sauce 5678');
    await call('DELETE', `/notes/${secret._id}?permanent=true`);
  }

  // API responses are never cacheable
  { const res0 = await fetch(`${base}/notes`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res0.headers.get('cache-control'), 'no-store'); assert.equal(res0.headers.get('etag'), null); }

  // @@MORE@@

  // isolation: another user can't see Ada's notes
  token = (await call('POST', '/auth/register', { name: 'Bob', email: 'bob@example.com', password: 'password123' })).data.token;
  assert.equal((await call('GET', `/notes/${a._id}`)).status, 404);
  assert.equal((await call('GET', '/notes')).data.notes.length, 0);
  token = 'bad'; assert.equal((await call('GET', '/notes')).status, 401);

  // account: change password, delete account + notes
  token = (await call('POST', '/auth/login', { email: 'bob@example.com', password: 'password123' })).data.token;
  const bobNote = (await call('POST', '/notes', { title: 'Bob note' })).data.note;
  await call('PATCH', `/notes/${bobNote._id}`, { title: 'Bob note edited' }); // creates a version
  // Bob cannot see Ada's versions
  assert.equal((await call('GET', `/notes/${a._id}/versions`)).status, 404);
  assert.equal((await call('PATCH', '/auth/password', { currentPassword: 'wrong-pass', newPassword: 'newpassword1' })).status, 403);
  assert.equal((await call('PATCH', '/auth/password', { currentPassword: 'password123', newPassword: 'short' })).status, 400);
  const bobOther = (await call('POST', '/auth/login', { email: 'bob@example.com', password: 'password123' })).data.token;
  r = await call('PATCH', '/auth/password', { currentPassword: 'password123', newPassword: 'newpassword1' });
  assert.equal(r.status, 200); assert.ok(r.data.token);
  assert.equal((await call('GET', '/auth/me')).status, 401);           // this request's old token is revoked…
  token = r.data.token; assert.equal((await call('GET', '/auth/me')).status, 200); // …but the fresh one works
  { const keep = token; token = bobOther; assert.equal((await call('GET', '/auth/me')).status, 401); token = keep; }
  assert.equal((await call('POST', '/auth/login', { email: 'bob@example.com', password: 'password123' })).status, 401);
  token = (await call('POST', '/auth/login', { email: 'bob@example.com', password: 'newpassword1' })).data.token;
  assert.equal((await call('DELETE', '/auth/me', {})).status, 400);
  assert.equal((await call('DELETE', '/auth/me', { password: 'password123' })).status, 403);
  const bobId = (await call('GET', '/auth/me')).data.user.id;
  r = await call('DELETE', '/auth/me', { password: 'newpassword1' });
  assert.equal(r.status, 200); assert.equal(r.data.deletedNotes, 1);
  assert.equal(await Note.countDocuments({ user: bobId }), 0);
  assert.equal(await NoteVersion.countDocuments({ user: bobId }), 0);
  assert.equal((await call('GET', '/auth/me')).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'bob@example.com', password: 'newpassword1' })).status, 401);
  // Ada's data is untouched
  token = (await call('POST', '/auth/login', { email: 'ada@example.com', password: 'password123' })).data.token;
  assert.ok((await call('GET', '/notes')).data.notes.length >= 1);

  console.log('✅ All smoke tests passed');
} finally {
  server.close(); await mongoose.disconnect(); await mongo.stop();
}
