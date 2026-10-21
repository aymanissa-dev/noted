// Security review fixes, checked against a live deployment (BASE/API; defaults to the local stack).
// Run it LAST against production: it uses up this IP's sign-up allowance for the hour (H1).
// Throwaway accounts are deleted at the end.
import { api, newUser, ok, cleanup, created, BASE, API, sleep } from './h.mjs';
const PW = 'quiet-otter-lamp-91';
const PROD = !/localhost|127\.0\.0\.1/.test(API);
const raw = (method, path, body, { token, headers = {} } = {}) => fetch(API + path, { method, headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }), ...headers }, body: body && JSON.stringify(body) });
const out = {};
try {
  // ---- M2 headers on the app (HTML, JS, service worker) ----
  const home = await fetch(BASE + '/');
  const html = await home.text();
  const js = html.match(/\/assets\/[^"]+\.js/)?.[0];
  for (const path of ['/', '/notes', '/settings', js, '/sw.js', '/boot.js']) {
    const h = (await fetch(BASE + path)).headers;
    const csp = h.get('content-security-policy') || '';
    out[path] = Object.fromEntries(['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy', 'strict-transport-security'].map((k) => [k, h.get(k)]));
    ok(/script-src 'self'(;|$)/.test(csp) && !/script-src[^;]*unsafe/.test(csp) && /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp), `M2 ${path}: CSP without unsafe scripts, frame-ancestors 'none'`);
    ok(h.get('x-frame-options') === 'DENY' && h.get('x-content-type-options') === 'nosniff' && h.get('referrer-policy') === 'strict-origin-when-cross-origin' && /microphone=\(self\)/.test(h.get('permissions-policy') || ''), `M2 ${path}: XFO DENY, nosniff, Referrer-Policy, Permissions-Policy`);
  }
  ok(!/<script>(?!\s*$)/.test(html.replace(/<script type="application\/ld\+json">[^<]*<\/script>/, '')), 'M2 no inline executable scripts in index.html');

  // ---- L1 CORS / I3 Server-Timing ----
  const evil = await raw('GET', '/health', null, { headers: { Origin: 'https://evil.example' } });
  ok(!evil.headers.get('access-control-allow-origin'), `L1 unknown origin: no Access-Control-Allow-Origin (${evil.headers.get('access-control-allow-origin')})`);
  const own = await raw('GET', '/health', null, { headers: { Origin: new URL(BASE).origin } });
  ok(own.headers.get('access-control-allow-origin') === new URL(BASE).origin, 'L1 the app origin is allowed');
  if (PROD) ok(!own.headers.get('server-timing'), `I3 no Server-Timing in production (${own.headers.get('server-timing')})`);
  out.api = Object.fromEntries([...own.headers].filter(([k]) => !/date|age|etag|content-length|x-vercel-id/.test(k)));

  // ---- L2 generic sign-up response ----
  const u = await newUser('sec');
  let r = await api('POST', '/auth/register', { name: 'Again', email: u.email, password: PW });
  ok(r.status === 400 && r.data.code === 'register_failed' && !/already registered|exists/i.test(r.data.error), `L2 existing email: generic 400 (${r.status} ${r.data.error})`);

  // ---- L3 timing (informational over the internet) ----
  const time = async (email) => { const t0 = performance.now(); await raw('POST', '/auth/login', { email, password: 'not-the-password-1' }); return performance.now() - t0; };
  const ghost = `ghost+${Date.now()}@noted.test`;
  const tg = await time(ghost); const tk = await time(u.email);
  console.log(`   L3 timing: unknown email ${tg.toFixed(0)}ms, wrong password ${tk.toFixed(0)}ms`);

  // ---- H1 login: 5 failures per email → 429 + Retry-After; right password also waits ----
  let last;
  for (let i = 0; i < 4; i++) last = await raw('POST', '/auth/login', { email: u.email, password: 'wrong-' + i });
  ok(last.status === 429 && Number(last.headers.get('retry-after')) > 0, `H1 5th failed sign-in for one email: 429 + Retry-After ${last.headers.get('retry-after')}s (${(await last.json()).error})`);
  r = await raw('POST', '/auth/login', { email: u.email, password: PW });
  ok(r.status === 429, 'H1 the right password waits too while the email is limited');

  // ---- M1 PIN rules and backoff; L5; I4 ----
  r = await api('PUT', '/auth/lock-pin', { password: PW, pin: '2468' }, u.token);
  ok(r.status === 400, `M1 a new 4-digit PIN is refused (${r.data.error})`);
  r = await api('PUT', '/auth/lock-pin', { password: PW, pin: '246813' }, u.token);
  ok(r.status === 200, 'M1 a 6-digit PIN is accepted');
  const n = (await api('POST', '/notes', { title: 'sec locked', content: 'sec-secret-body' }, u.token)).data.note;
  await api('PATCH', `/notes/${n._id}/lock`, { locked: true }, u.token);
  r = await api('GET', '/notes/export?format=json', null, u.token);
  let g = await raw('GET', '/notes/export?format=json', null, { token: u.token, headers: { 'X-Lock-Pin': '246813' } });
  ok(!(await g.text()).includes('sec-secret-body'), 'I4 GET export ignores X-Lock-Pin (locked note redacted)');
  r = await api('POST', '/notes/export', { format: 'json', pin: '246813' }, u.token);
  ok(JSON.stringify(r.data).includes('sec-secret-body'), 'I4 POST export with the PIN in the body includes it');
  r = await api('DELETE', `/notes/${n._id}`, null, u.token);
  ok(r.status === 423, `L5 trashing a locked note without unlocking: ${r.status}`);
  r = await api('DELETE', `/notes/${n._id}?permanent=true`, null, u.token);
  ok(r.status === 423, `L5 deleting a locked note for good without unlocking: ${r.status}`);
  const codes = [];
  for (let i = 0; i < 5; i++) { const x = await raw('POST', `/notes/${n._id}/unlock`, { pin: '000000' }, { token: u.token }); codes.push(`${x.status}${x.headers.get('retry-after') ? `/${x.headers.get('retry-after')}s` : ''}`); }
  ok(codes.slice(0, 4).every((c) => c === '403') && /^429\/300s$/.test(codes[4]), `M1 wrong PINs: ${codes.join(', ')}`);
  r = await api('POST', `/notes/${n._id}/unlock`, { pin: '246813' }, u.token);
  ok(r.status === 429, 'M1 the right PIN waits too during the block');

  // ---- L4 import folder cap ----
  const notes = Array.from({ length: 205 }, (_, i) => ({ title: `imp ${i}`, content: 'x', folder: `F${i}` }));
  r = await api('POST', '/notes/import', { app: 'noted', version: 1, notes }, u.token);
  const fc = (await api('GET', '/folders', null, u.token)).data.folders.length;
  ok(r.status === 201 && fc === 200 && r.data.foldersSkipped === 5, `L4 import of 205 folders: ${fc} created, ${r.data.foldersSkipped} skipped`);

  // ---- H1 sign-up per IP (last: uses up this IP's allowance for the hour) ----
  if (process.env.SKIP_REGISTER_LIMIT !== '1') {
    let hit = null; let i = 0;
    for (; i < 25 && !hit; i++) { const x = await raw('POST', '/auth/register', { name: '', email: 'not-an-email', password: '' }); if (x.status === 429) hit = x; }
    ok(hit && Number(hit.headers.get('retry-after')) > 0, `H1 sign-ups per IP: 429 after ${i} more attempts, Retry-After ${hit?.headers.get('retry-after')}s (${hit && (await hit.json()).error})`);
  }
  console.log(JSON.stringify(out, null, 1));
} finally { await cleanup(); }
