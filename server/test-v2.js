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

// @@MORE@@

try {
  for (const [name, fn] of tests) {
    try { await fn(); } catch (e) { console.error(`✗ ${name}`); throw e; }
  }
  console.log(`✅ v2 tests passed (${tests.length})`);
} finally {
  server.close(); await mongoose.disconnect(); await mongo.stop();
}
