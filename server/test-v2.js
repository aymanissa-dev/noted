// Tests for the v2 features (accent, folders, recent, merge, stats, login activity, audio, backups).
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
import { createApp } from './src/app.js';

process.env.JWT_SECRET = 'test-secret';
const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri());
const server = createApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
let token;
const call = async (method, path, body, headers = {}) => {
  const r = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
};
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---- accent preference ----
test('accent preference', async () => {
  let r = await call('POST', '/auth/register', { name: 'Vee', email: 'vee@example.com', password: 'password123' });
  token = r.data.token;
  assert.equal(r.data.user.preferences.accent, 'amber');
  assert.equal((await call('PATCH', '/auth/preferences', { accent: 'neon' })).status, 400);
  r = await call('PATCH', '/auth/preferences', { accent: 'violet' });
  assert.equal(r.data.user.preferences.accent, 'violet');
  r = await call('GET', '/auth/me'); assert.equal(r.data.user.preferences.accent, 'violet');
});

test('folders', async () => {
  let r = await call('POST', '/folders', { name: 'Work' }); assert.equal(r.status, 201);
  const work = r.data.folder;
  assert.equal((await call('POST', '/folders', { name: 'work' })).status, 409); // case-insensitive unique
  assert.equal((await call('POST', '/folders', { name: '  ' })).status, 400);
  const home = (await call('POST', '/folders', { name: 'Home' })).data.folder;
  const n1 = (await call('POST', '/notes', { title: 'In work', content: 'a', folderId: work._id })).data.note;
  const n2 = (await call('POST', '/notes', { title: 'Loose', content: 'b' })).data.note;
  assert.equal(n1.folderId, work._id); assert.equal(n2.folderId, null);
  r = await call('GET', `/notes?folder=${work._id}`); assert.deepEqual(r.data.notes.map((n) => n.title), ['In work']);
  r = await call('GET', '/notes?folder=none'); assert.deepEqual(r.data.notes.map((n) => n.title), ['Loose']);
  r = await call('PATCH', `/notes/${n2._id}/folder`, { folderId: home._id }); assert.equal(r.data.note.folderId, home._id);
  r = await call('GET', '/folders'); assert.deepEqual(r.data.folders.map((f) => [f.name, f.count]), [['Home', 1], ['Work', 1]]);
  r = await call('PATCH', `/folders/${home._id}`, { name: 'House' }); assert.equal(r.data.folder.name, 'House');
  // another user can't see or use my folder
  const mine = token;
  token = (await call('POST', '/auth/register', { name: 'Eve', email: 'eve@example.com', password: 'password123' })).data.token;
  assert.equal((await call('PATCH', `/folders/${work._id}`, { name: 'x' })).status, 404);
  const eveNote = (await call('POST', '/notes', { title: 'e', content: 'e' })).data.note;
  assert.equal((await call('PATCH', `/notes/${eveNote._id}/folder`, { folderId: work._id })).status, 404);
  token = mine;
  // deleting a folder keeps its notes
  r = await call('DELETE', `/folders/${work._id}`); assert.equal(r.data.movedNotes, 1);
  r = await call('GET', `/notes/${n1._id}`); assert.equal(r.status, 200); assert.equal(r.data.note.folderId, null); assert.equal(r.data.note.deletedAt, null);
  assert.equal((await call('GET', '/folders')).data.folders.length, 1);
});

test('folders survive export/import', async () => {
  const f = (await call('POST', '/folders', { name: 'Trips' })).data.folder;
  await call('POST', '/notes', { title: 'Lamu', content: 'ferry', folderId: f._id });
  const exp = (await call('GET', '/notes/export')).data;
  assert.equal(exp.notes.find((n) => n.title === 'Lamu').folder, 'Trips');
  const mine = token;
  token = (await call('POST', '/auth/register', { name: 'Imp', email: 'imp@example.com', password: 'password123' })).data.token;
  const r = await call('POST', '/notes/import', exp); assert.equal(r.status, 201);
  const trips = (await call('GET', '/folders')).data.folders.find((x) => x.name === 'Trips');
  assert.ok(trips); assert.equal(trips.count, 1);
  token = mine;
});

test('recently viewed and smart filters', async () => {
  token = (await call('POST', '/auth/register', { name: 'Rec', email: 'rec@example.com', password: 'password123' })).data.token;
  const ids = [];
  for (let i = 0; i < 12; i++) ids.push((await call('POST', '/notes', { title: `n${i}`, content: 'x', tags: i % 2 ? ['odd'] : [] })).data.note._id);
  for (const id of ids) await call('GET', `/notes/${id}`);
  await call('GET', `/notes/${ids[3]}`); // re-open moves to the front without duplicating
  let r = await call('GET', '/notes/recent');
  assert.equal(r.data.notes.length, 10);
  assert.equal(r.data.notes[0].title, 'n3'); assert.equal(r.data.notes[1].title, 'n11');
  assert.equal(new Set(r.data.notes.map((n) => n._id)).size, 10);
  await call('DELETE', `/notes/${ids[3]}`); // trashed notes drop out
  r = await call('GET', '/notes/recent'); assert.equal(r.data.notes[0].title, 'n11');
  await call('PATCH', `/notes/${ids[0]}/pin`);
  assert.deepEqual((await call('GET', '/notes?smart=pinned')).data.notes.map((n) => n.title), ['n0']);
  assert.equal((await call('GET', '/notes?smart=untagged')).data.notes.length, 6); // n0, n2 … n10
  assert.equal((await call('GET', '/notes?smart=today')).data.notes.length, 11);
  assert.equal((await call('GET', '/notes?smart=bogus')).status, 400);
});

test('markdown search matches plain text', async () => {
  const n = (await call('POST', '/notes', { title: 'MD', content: '# Plan\nThis is **really important** and ==glowing== stuff' })).data.note;
  assert.equal(n.plain, undefined);
  let r = await call('GET', '/notes?search=' + encodeURIComponent('really important and glowing'));
  assert.deepEqual(r.data.notes.map((x) => x.title), ['MD']);
  assert.equal(r.data.notes[0].plain, undefined);
  r = await call('GET', '/notes?search=' + encodeURIComponent('**really')); assert.equal(r.data.notes.length, 1); // raw markdown still matches
  await call('PATCH', `/notes/${n._id}`, { content: 'now _plain_ words' });
  r = await call('GET', '/notes?search=plain%20words'); assert.equal(r.data.notes.length, 1);
  r = await call('GET', '/notes?search=glowing'); assert.equal(r.data.notes.length, 0);
});

test('merge notes', async () => {
  token = (await call('POST', '/auth/register', { name: 'Mer', email: 'mer@example.com', password: 'password123' })).data.token;
  const a = (await call('POST', '/notes', { title: 'A', content: 'alpha', tags: ['x'] })).data.note;
  const b = (await call('POST', '/notes', { title: 'B', content: 'beta', tags: ['y', 'x'] })).data.note;
  const c = (await call('POST', '/notes', { title: 'C', content: 'gamma' })).data.note;
  assert.equal((await call('POST', '/notes/merge', { ids: [a._id] })).status, 400);
  let r = await call('POST', '/notes/merge', { ids: [c._id, a._id, b._id], title: 'All' });
  assert.equal(r.status, 201);
  assert.equal(r.data.note.title, 'All');
  assert.equal(r.data.note.content, '## C\n\ngamma\n\n## A\n\nalpha\n\n## B\n\nbeta');
  assert.deepEqual(r.data.note.tags.sort(), ['x', 'y']);
  const trash = (await call('GET', '/notes?view=trash')).data.notes.map((n) => n.title).sort();
  assert.deepEqual(trash, ['A', 'B', 'C']);
  assert.deepEqual((await call('GET', '/notes')).data.notes.map((n) => n.title), ['All']);
  // undo = restore originals + trash the merged note
  for (const id of r.data.trashed) await call('POST', `/notes/${id}/restore`);
  await call('DELETE', `/notes/${r.data.note._id}`);
  assert.deepEqual((await call('GET', '/notes')).data.notes.map((n) => n.title).sort(), ['A', 'B', 'C']);
  // trashed/foreign/locked notes can't be merged
  assert.equal((await call('POST', '/notes/merge', { ids: [a._id, r.data.note._id] })).status, 404);
  await call('PUT', '/auth/lock-pin', { password: 'password123', pin: '1234' });
  await call('PATCH', `/notes/${a._id}/lock`, { locked: true });
  assert.equal((await call('POST', '/notes/merge', { ids: [a._id, b._id] })).status, 423);
});

test('storage stats', async () => {
  token = (await call('POST', '/auth/register', { name: 'Sta', email: 'sta@example.com', password: 'password123' })).data.token;
  await call('POST', '/folders', { name: 'F' });
  await call('POST', '/notes', { title: 'Big one', content: '# Heading\n' + 'word '.repeat(50), tags: ['t1', 't2'] });
  await call('POST', '/notes', { title: 'Small', content: 'two **words**', tags: ['t1'] });
  const s3 = (await call('POST', '/notes', { title: 'Secret', content: 'x '.repeat(500) })).data.note;
  await call('PUT', '/auth/lock-pin', { password: 'password123', pin: '1234' });
  await call('PATCH', `/notes/${s3._id}/lock`, { locked: true });
  const r = await call('GET', '/stats');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.notes, { total: 3, active: 3, archived: 0, trashed: 0, locked: 1 });
  assert.equal(r.data.words, 2 + 51 + 1 + 2); // titles + bodies, locked excluded
  assert.equal(r.data.folders, 1); assert.equal(r.data.tags, 2);
  assert.deepEqual(r.data.biggest.map((n) => n.title), ['Big one', 'Small']);
  assert.ok(!r.data.biggest.some((n) => n.title === 'Secret'));
});

test('login activity', async () => {
  const { parseUserAgent, maskIp } = await import('./src/lib/useragent.js');
  assert.deepEqual(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), { browser: 'Safari 17', os: 'iOS', device: 'mobile' });
  assert.deepEqual(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0'), { browser: 'Edge 129', os: 'Windows', device: 'desktop' });
  assert.equal(maskIp('203.0.113.77'), '203.0.x.x'); assert.equal(maskIp('::ffff:10.1.2.3'), '10.1.x.x'); assert.equal(maskIp('2001:db8:85a3:0:0:8a2e:370:7334'), '2001:db8:85a3:…');
  const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36' };
  const reg = await fetch(base + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', ...UA }, body: JSON.stringify({ name: 'Act', email: 'act@example.com', password: 'password123' }) }).then((r) => r.json());
  token = reg.token;
  let r = await call('GET', '/auth/activity');
  assert.equal(r.data.events.length, 1);
  assert.equal(r.data.events[0].kind, 'register'); assert.equal(r.data.events[0].browser, 'Chrome 129'); assert.equal(r.data.events[0].os, 'Linux');
  assert.equal(r.data.events[0].current, true); assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(r.data.events[0].ip));
  for (let i = 0; i < 22; i++) await call('POST', '/auth/login', { email: 'act@example.com', password: 'password123' });
  r = await call('GET', '/auth/activity');
  assert.equal(r.data.events.length, 20); // capped
  assert.equal(r.data.events.filter((e) => e.current).length, 0); // the register session was pruned
  token = (await call('POST', '/auth/login', { email: 'act@example.com', password: 'password123' })).data.token;
  r = await call('POST', '/auth/logout-all'); token = r.data.token;
  r = await call('GET', '/auth/activity');
  assert.equal(r.data.events[0].current, true); assert.equal(r.data.events[0].active, true);
  assert.ok(r.data.events.slice(1).every((e) => !e.active)); // other sessions revoked
  await call('DELETE', '/auth/me', { password: 'password123' });
  const LoginEvent = (await import('./src/models/LoginEvent.js')).default;
  assert.equal(await LoginEvent.countDocuments({}), await LoginEvent.countDocuments({ user: { $ne: null } }));
});

// @@MORE@@

try {
  for (const [name, fn] of tests) {
    try { await fn(); } catch (e) { console.error(`✗ ${name}`); throw e; }
  }
  console.log(`✅ v2 tests passed (${tests.length})`);
} finally {
  server.close(); await mongoose.disconnect(); await mongo.stop();
}
