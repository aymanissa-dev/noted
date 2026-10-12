// Smoke test: boots the API against an in-memory MongoDB and exercises the main flows.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from './src/app.js';
import Note from './src/models/Note.js';
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

  // @@MORE@@

  // isolation: another user can't see Ada's notes
  token = (await call('POST', '/auth/register', { name: 'Bob', email: 'bob@example.com', password: 'password123' })).data.token;
  assert.equal((await call('GET', `/notes/${a._id}`)).status, 404);
  assert.equal((await call('GET', '/notes')).data.notes.length, 0);
  token = 'bad'; assert.equal((await call('GET', '/notes')).status, 401);

  console.log('✅ All smoke tests passed');
} finally {
  server.close(); await mongoose.disconnect(); await mongo.stop();
}
