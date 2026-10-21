// Re-verify NEW-1..3 against a deployment (BASE/API; defaults to the local stack): parallel bursts.
// Uses ONE throwaway account (one sign-up), deleted at the end. Leaves this network's failed
// sign-in budget mostly intact (20 of 60) so other suites can still sign in.
// Not done here on purpose: a wrong-account-password burst (it would block deleting the account for
// 15 minutes) and a per-IP sign-in/sign-up burst (would use up the network's allowance); both are
// covered by server/test-security.js.
import { api, newUser, ok, cleanup, API } from './h.mjs';
const raw = async (method, path, body, token) => {
  const r = await fetch(API + path, { method, headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch { /* empty */ }
  return { status: r.status, data, retryAfter: r.headers.get('retry-after') };
};
const tally = (rs) => rs.reduce((m, x) => ({ ...m, [x.status]: (m[x.status] || 0) + 1 }), {});
try {
  const u = await newUser('conc');
  // NEW-1: 20 parallel wrong passwords for one email → only 5 checked
  let rs = await Promise.all(Array.from({ length: 20 }, (_, i) => raw('POST', '/auth/login', { email: u.email, password: 'wrong-burst-' + i })));
  let t = tally(rs);
  ok(t[401] === 4 && t[429] === 16, `NEW-1 20 parallel wrong sign-ins for one email: ${JSON.stringify(t)} (expected 4×401, 16×429)`);
  ok((await raw('POST', '/auth/login', { email: u.email, password: 'quiet-otter-lamp-91' })).status === 429, 'NEW-1 the right password waits too');

  // NEW-3: 30 parallel wrong PINs → 4×403, then one 5-minute wait for everyone
  ok((await api('PUT', '/auth/lock-pin', { password: 'quiet-otter-lamp-91', pin: '864213' }, u.token)).status === 200, 'PIN set');
  const n = (await api('POST', '/notes', { title: 'conc locked', content: 'c' }, u.token)).data.note;
  await api('PATCH', `/notes/${n._id}/lock`, { locked: true }, u.token);
  rs = await Promise.all(Array.from({ length: 30 }, () => raw('POST', `/notes/${n._id}/unlock`, { pin: '000000' }, u.token)));
  t = tally(rs);
  const waits = [...new Set(rs.filter((x) => x.status === 429).map((x) => Math.round(x.retryAfter / 60)))];
  ok(t[403] === 4 && t[429] === 26 && waits.length === 1 && waits[0] === 5, `NEW-3 30 parallel wrong PINs: ${JSON.stringify(t)}, waits ${waits.join('/')} min (expected 4×403, all 5 min)`);
  ok((await raw('POST', `/notes/${n._id}/unlock`, { pin: '864213' }, u.token)).status === 429, 'NEW-3 the right PIN waits too');

  // NEW-2: two parallel 205-folder imports, then a burst of folder creates
  const imp = (tag) => raw('POST', '/notes/import', { app: 'noted', version: 1, notes: Array.from({ length: 205 }, (_, i) => ({ title: `${tag} ${i}`, content: tag, folder: `${tag}${i}` })) }, u.token);
  rs = await Promise.all([imp('A'), imp('B')]);
  let fc = (await api('GET', '/folders', null, u.token)).data.folders.length;
  ok(rs.every((x) => x.status === 201) && fc === 200, `NEW-2 two parallel 205-folder imports: ${rs.map((x) => x.status)}, ${fc} folders, skipped ${rs.map((x) => x.data.foldersSkipped)}`);
  const del = (await api('GET', '/folders', null, u.token)).data.folders.slice(0, 3).map((f) => f._id);
  await Promise.all(del.flatMap((id) => [api('DELETE', `/folders/${id}`, null, u.token), api('DELETE', `/folders/${id}`, null, u.token)]));
  rs = await Promise.all(Array.from({ length: 20 }, (_, i) => raw('POST', '/folders', { name: `burst${i}` }, u.token)));
  t = tally(rs);
  fc = (await api('GET', '/folders', null, u.token)).data.folders.length;
  ok(t[201] === 3 && t[400] === 17 && fc === 200, `NEW-2 3 deleted (each twice in parallel), then 20 parallel creates: ${JSON.stringify(t)}, ${fc} folders`);
} finally { await cleanup(); }
