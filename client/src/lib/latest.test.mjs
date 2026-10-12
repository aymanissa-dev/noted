import assert from 'node:assert/strict';
import { latestOnly } from './latest.js';

const delay = (ms, v, signal) => new Promise((res, rej) => {
  const t = setTimeout(() => res(v), ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
});
const search = latestOnly((q, ms, signal) => delay(ms, `results for ${q}`, signal));
// slow old query, fast new query: only the newest wins, the old one is aborted/stale
const [a, b] = await Promise.all([search('old', 50), search('new', 5)]);
assert.equal(a.stale, true); assert.deepEqual(b, { result: 'results for new', stale: false });
// out of order without abort support still discarded
const noAbort = latestOnly((q, ms) => new Promise((r) => setTimeout(() => r(q), ms)));
const [c, d] = await Promise.all([noAbort('first', 30), noAbort('second', 1)]);
assert.equal(c.stale, true); assert.equal(d.result, 'second');
// errors from stale calls are swallowed, from the latest call are thrown
const failing = latestOnly(async (x) => { if (x === 'bad') throw new Error('boom'); return x; });
await assert.rejects(failing('bad'), /boom/);
console.log('✅ latest-only tests passed');
