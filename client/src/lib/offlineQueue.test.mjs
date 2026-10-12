// Run with: node src/lib/offlineQueue.test.mjs
import assert from 'node:assert/strict';
import { createQueue, isTempId } from './offlineQueue.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

// create + edits while offline merge into one create
let q = createQueue(mem());
const t = q.enqueueCreate({ title: 'Draft' });
assert.ok(isTempId(t));
q.enqueueUpdate(t, { content: 'hello' });
assert.equal(q.size(), 1);
assert.deepEqual(q.localNotes()[0].content, 'hello');
assert.equal(q.localNotes()[0].pending, true);

// updates to a server note coalesce and overlay
q.enqueueUpdate('abc', { title: 'A1' });
q.enqueueUpdate('abc', { content: 'body' });
assert.equal(q.size(), 2);
const [ov] = q.applyPending([{ _id: 'abc', title: 'old', content: '' }, { _id: 'zzz' }]);
assert.equal(ov.title, 'A1'); assert.equal(ov.content, 'body'); assert.equal(ov.pending, true);

// flush in order, map temp ids, stop on network error and resume
const sent = [];
let offline = true;
const send = async (e) => {
  if (offline) throw new TypeError('Failed to fetch');
  sent.push(e);
  return e.op === 'create' ? { _id: 'real1' } : { _id: e.id };
};
assert.equal(await q.flush(send), 0);
assert.equal(q.size(), 2);
offline = false;
const mapped = [];
assert.equal(await q.flush(send, { onIdMapped: (a, b) => mapped.push([a, b]) }), 2);
assert.equal(q.size(), 0);
assert.deepEqual(sent.map((e) => e.op), ['create', 'update']);
assert.deepEqual(sent[0].body, { title: 'Draft', content: 'hello' });
assert.deepEqual(mapped, [[t, 'real1']]);

// an update queued against a temp id after its create was sent gets remapped
q = createQueue(mem());
const t2 = q.enqueueCreate({ title: 'X' });
// simulate: create entry is sent, then a later update referencing temp id exists in queue
const storage = mem(); const q2 = createQueue(storage);
storage.setItem('noted.queue', JSON.stringify([{ op: 'create', tempId: t2, body: { title: 'X' } }, { op: 'update', id: t2, body: { title: 'Y' } }]));
const sent2 = [];
await q2.flush(async (e) => { sent2.push(e); return { _id: 'real2' }; });
assert.equal(sent2[1].id, 'real2');

// 4xx entries are dropped instead of jamming the queue
const q3 = createQueue(mem());
q3.enqueueUpdate('gone', { title: 'x' });
q3.enqueueUpdate('ok', { title: 'y' });
const sent3 = [];
await q3.flush(async (e) => { if (e.id === 'gone') throw Object.assign(new Error('Not found'), { status: 404 }); sent3.push(e.id); return { _id: e.id }; });
assert.deepEqual(sent3, ['ok']); assert.equal(q3.size(), 0);

console.log('✅ offline queue tests passed');
