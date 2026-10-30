// Tests for reminders / due dates and the time zone preference.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
import { createApp } from './src/app.js';

process.env.JWT_SECRET = 'test-secret';
process.env.RATE_LIMITS = 'off';
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
  return { status: r.status, data };
};
const PW = 'quiet-otter-lamp-91';

try {
  let r = await call('POST', '/auth/register', { name: 'Rae', email: 'rae@example.com', password: PW });
  token = r.data.token;
  // time zone preference: Africa/Nairobi by default, validated
  assert.equal(r.data.user.preferences.timeZone, 'Africa/Nairobi');
  assert.equal((await call('PATCH', '/auth/preferences', { timeZone: 'Mars/Olympus' })).status, 400);
  assert.equal((await call('PATCH', '/auth/preferences', { timeZone: 'Europe/Lisbon' })).data.user.preferences.timeZone, 'Europe/Lisbon');
  assert.equal((await call('GET', '/auth/me')).data.user.preferences.timeZone, 'Europe/Lisbon');
  assert.equal((await call('PATCH', '/auth/preferences', { accent: 'violet' })).data.user.preferences.timeZone, 'Europe/Lisbon', 'other prefs leave it alone');

  const a = (await call('POST', '/notes', { title: 'Dentist', content: 'Bring the card' })).data.note;
  const b = (await call('POST', '/notes', { title: 'Taxes', content: 'File' })).data.note;
  const c = (await call('POST', '/notes', { title: 'No reminder', content: 'x' })).data.note;
  assert.equal(a.dueAt, null);

  // validation
  assert.equal((await call('PATCH', `/notes/${a._id}/due`, {})).status, 400);
  assert.equal((await call('PATCH', `/notes/${a._id}/due`, { dueAt: 'tomorrow-ish' })).status, 400);
  assert.equal((await call('PATCH', `/notes/${a._id}/due`, { dueAt: '1999-12-31T23:00:00Z' })).status, 400);
  assert.equal((await call('PATCH', `/notes/${a._id}/due`, { dueAt: true })).status, 400);

  // set: stored in UTC, doesn't count as an edit
  const soon = new Date(Date.now() + 3600e3).toISOString();
  const past = new Date(Date.now() - 3600e3).toISOString();
  r = await call('PATCH', `/notes/${a._id}/due`, { dueAt: '2026-11-02T09:00:00+03:00' });
  assert.equal(r.status, 200); assert.equal(r.data.note.dueAt, '2026-11-02T06:00:00.000Z');
  assert.equal(r.data.note.updatedAt, a.updatedAt, 'setting a reminder is not an edit');
  await call('PATCH', `/notes/${a._id}/due`, { dueAt: soon });
  await call('PATCH', `/notes/${b._id}/due`, { dueAt: past });

  // due list + smart filter: soonest (overdue) first, only notes with a reminder
  r = await call('GET', '/notes/due');
  assert.deepEqual(r.data.notes.map((n) => n.title), ['Taxes', 'Dentist']);
  r = await call('GET', '/notes?smart=due');
  assert.deepEqual(r.data.notes.map((n) => n.title), ['Taxes', 'Dentist']);
  assert.ok((await call('GET', '/notes')).data.notes.find((n) => n._id === a._id).dueAt, 'list items carry dueAt');

  // editing content keeps the reminder; clearing removes it
  r = await call('PATCH', `/notes/${a._id}`, { content: 'Bring the card and ID' });
  assert.equal(r.data.note.dueAt, new Date(soon).toISOString());
  r = await call('PATCH', `/notes/${b._id}/due`, { dueAt: null });
  assert.equal(r.data.note.dueAt, null);
  assert.deepEqual((await call('GET', '/notes/due')).data.notes.map((n) => n.title), ['Dentist']);

  // locked notes: reminder can be set without the PIN; lists show dueAt but never the title/content
  await call('PUT', '/auth/lock-pin', { password: PW, pin: '123412' });
  await call('PATCH', `/notes/${c._id}/lock`, { locked: true });
  r = await call('PATCH', `/notes/${c._id}/due`, { dueAt: past });
  assert.equal(r.status, 200); assert.equal(r.data.note.title, ''); assert.equal(r.data.note.content, ''); assert.ok(r.data.note.redacted);
  r = await call('GET', '/notes/due');
  const locked = r.data.notes.find((n) => n._id === c._id);
  assert.ok(locked && locked.dueAt && locked.redacted && locked.title === '' && locked.content === '');

  // trash hides reminders; trashed notes can't get one
  await call('DELETE', `/notes/${a._id}`);
  assert.ok(!(await call('GET', '/notes/due')).data.notes.some((n) => n._id === a._id));
  assert.equal((await call('PATCH', `/notes/${a._id}/due`, { dueAt: soon })).status, 400);

  // other users can't touch it
  const mine = token;
  token = (await call('POST', '/auth/register', { name: 'Eve', email: 'eve@example.com', password: PW })).data.token;
  assert.equal((await call('PATCH', `/notes/${c._id}/due`, { dueAt: null })).status, 404);
  assert.equal((await call('GET', '/notes/due')).data.notes.length, 0);
  token = mine;

  // export / import keep the reminder
  await call('POST', `/notes/${a._id}/restore`);
  const exp = (await call('POST', '/notes/export', { format: 'json' })).data;
  const ex = exp.notes.find((n) => n.title === 'Dentist');
  assert.ok(ex.dueAt, 'export includes dueAt');
  token = (await call('POST', '/auth/register', { name: 'Imp', email: 'imp@example.com', password: PW })).data.token;
  await call('POST', '/notes/import', { notes: [{ ...ex, id: undefined }] });
  assert.equal((await call('GET', '/notes/due')).data.notes[0].dueAt, new Date(ex.dueAt).toISOString());
  console.log('✅ reminder tests passed');
} finally {
  server.close(); await mongoose.disconnect(); await mongo.stop();
}
