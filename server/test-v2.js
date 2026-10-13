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

// @@MORE@@

try {
  for (const [name, fn] of tests) {
    try { await fn(); } catch (e) { console.error(`✗ ${name}`); throw e; }
  }
  console.log(`✅ v2 tests passed (${tests.length})`);
} finally {
  server.close(); await mongoose.disconnect(); await mongo.stop();
}
