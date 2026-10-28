// v8: QA e2e on 1652677.
//  B1  Log out ends the session on the server (old token → 401 everywhere); offline logout is sent later.
//  d   /notes/local-<unknown> → "not found" with a way back (no endless skeleton); a mapped one redirects.
//  L   Unlocking a locked note shows its title in the list/sidebar right away (no refresh).
//  L   Right after sign-in the sidebar shows a folders skeleton, never "no folders".
//  L   New folder appears at once (dimmed "Saving…"), then opens; duplicate names are refused in the dialog.
//  c   Deleted-account banner on /login survives going offline and back online (CDP), clears on typing.
// Runs against production with BASE/API.
import { launch, newUser, api, ok, cleanup, BASE, sleep, pageAs } from './h.mjs';
const b = await launch();
const PW = 'quiet-otter-lamp-91';
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k);
const cdpOffline = async (p, offline) => {
  const c = p._cdp || (p._cdp = await p.target().createCDPSession());
  await c.send('Network.enable');
  await c.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
};
const loginUI = async (p, email) => {
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await p.type('input[type=email]', email); await p.type('input[type=password]', PW);
  await p.click('form button[type=submit]');
};
const menuLogout = async (p) => {
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label')?.match(/account|menu/i) && x.closest('header,nav,aside'))?.click());
  await sleep(300);
  const clicked = await p.evaluate(() => { const m = [...document.querySelectorAll('[role=menuitem]')].find((x) => /Log out/.test(x.textContent)); m?.click(); return !!m; });
  return clicked;
};

try {
  if (want('logout')) {
    // online: Log out from the account menu
    const u = await newUser('v8out');
    const p = await pageAs(b, u.token, u.user);
    await p.goto(`${BASE}/notes`, { waitUntil: 'networkidle0' });
    ok((await api('GET', '/auth/me', null, u.token)).status === 200, 'B1 token works before logout');
    ok(await menuLogout(p), 'B1 clicked Log out');
    await p.waitForFunction(() => location.pathname === '/login', { timeout: 5000 });
    await sleep(800);
    const codes = await Promise.all(['/auth/me', '/notes', '/folders', '/auth/activity'].map(async (x) => (await api('GET', x, null, u.token)).status));
    ok(codes.every((c) => c === 401), `B1 old token → 401 on /auth/me /notes /folders /auth/activity after logout (${codes})`);
    ok(await p.evaluate(() => !localStorage.getItem('noted.token') && !localStorage.getItem('noted.pendingLogout')), 'B1 local token cleared, nothing pending');
    await p.close();

    // offline: logout is remembered and sent once back online
    const v = await newUser('v8off');
    const q = await pageAs(b, v.token, v.user);
    await q.goto(`${BASE}/notes`, { waitUntil: 'networkidle0' });
    await cdpOffline(q, true); await sleep(300);
    ok(await menuLogout(q), 'B1 offline: clicked Log out');
    await q.waitForFunction(() => location.pathname === '/login', { timeout: 5000 });
    ok(await q.evaluate(() => !localStorage.getItem('noted.token')), 'B1 offline: signed out locally right away');
    ok(await q.evaluate(() => (JSON.parse(localStorage.getItem('noted.pendingLogout') || '[]')).length === 1), 'B1 offline: logout kept to send later');
    ok((await api('GET', '/auth/me', null, v.token)).status === 200, 'B1 offline: (server not reached yet)');
    await cdpOffline(q, false);
    await q.waitForFunction(() => !localStorage.getItem('noted.pendingLogout'), { timeout: 8000 }).catch(() => {});
    ok((await api('GET', '/auth/me', null, v.token)).status === 401, 'B1 back online: the old token is revoked (401)');
    ok(await q.evaluate(() => !localStorage.getItem('noted.pendingLogout')), 'B1 back online: pending list emptied');
    ok(q.errors.length === 0 && p.errors.length === 0, 'B1 no page errors ' + q.errors.join('|'));
    await q.close();
  }

  if (want('local')) {
    const u = await newUser('v8loc');
    const real = (await api('POST', '/notes', { title: 'Synced one', content: 'x' }, u.token)).data.note;
    const p = await pageAs(b, u.token, u.user);
    await p.goto(`${BASE}/notes`, { waitUntil: 'networkidle0' });
    const t0 = Date.now();
    await p.goto(`${BASE}/notes/local-abc123`, { waitUntil: 'domcontentloaded' });
    const nf = await p.waitForSelector('[data-testid=note-not-found]', { timeout: 4000 }).then(() => true, () => false);
    ok(nf, `d unknown /notes/local-abc123 → not found (${Date.now() - t0}ms)`);
    ok(await p.evaluate(() => !document.querySelector('[data-testid=note-skeleton], .animate-pulse[aria-busy]') || !!document.querySelector('[data-testid=note-not-found]')), 'd no endless skeleton');
    ok(await p.evaluate(() => [...document.querySelectorAll('a')].some((a) => /Back to notes/.test(a.textContent) && a.getAttribute('href') === '/notes')), 'd "Back to notes" link');
    await p.evaluate(() => [...document.querySelectorAll('a')].find((a) => /Back to notes/.test(a.textContent)).click());
    await p.waitForFunction(() => location.pathname === '/notes', { timeout: 4000 });
    ok(true, 'd way back works');
    // a mapped local id goes to the real note
    await p.evaluate((id) => localStorage.setItem('noted.idmap', JSON.stringify({ 'local-mapped1': id })), real._id);
    await p.goto(`${BASE}/notes/local-mapped1`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction((id) => location.pathname === `/notes/${id}`, { timeout: 4000 }, real._id).catch(() => {});
    ok(await p.evaluate((id) => location.pathname === `/notes/${id}`, real._id), 'd mapped local id → redirected to the real note');
    await p.waitForFunction(() => document.querySelector('input[aria-label=Title]')?.value === 'Synced one', { timeout: 5000 }).catch(() => {});
    ok(await p.evaluate(() => document.querySelector('input[aria-label=Title]')?.value === 'Synced one'), 'd … and it opens');
    ok(p.errors.length === 0, 'd no page errors ' + p.errors.join('|'));
    await p.close();
  }

  if (want('unlock')) {
    const u = await newUser('v8unl');
    await api('PUT', '/auth/lock-pin', { password: PW, pin: '246813' }, u.token);
    const n = (await api('POST', '/notes', { title: 'Hidden plans', content: 'top secret' }, u.token)).data.note;
    await api('GET', `/notes/${n._id}`, null, u.token);
    await api('PATCH', `/notes/${n._id}/lock`, { locked: true }, u.token);
    const p = await pageAs(b, u.token, u.user);
    await p.goto(`${BASE}/notes`, { waitUntil: 'networkidle0' });
    const card = () => p.evaluate((id) => document.querySelector(`[data-flip-id="${id}"]`)?.innerText || '', n._id);
    ok(/Locked note/.test(await card()), 'L unlock: card shows "Locked note" before');
    await p.evaluate((id) => document.querySelector(`[data-flip-id="${id}"] a`).click(), n._id);
    await p.waitForSelector('input[aria-label=PIN]');
    await p.type('input[aria-label=PIN]', '246813'); await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.querySelector('input[aria-label=Title]')?.value === 'Hidden plans', { timeout: 6000 });
    await p.evaluate(() => [...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/notes' && /Notes|All notes/.test(a.textContent)).click());
    await p.waitForFunction((id) => document.querySelector(`[data-flip-id="${id}"]`), { timeout: 5000 }, n._id);
    ok(/Hidden plans/.test(await card()) && !/Locked note/.test(await card()), `L unlock: list card shows the title without a refresh (${(await card()).replace(/\s+/g, ' ').slice(0, 60)})`);
    ok(!/top secret/.test(await card()), 'L unlock: the body stays out of the list');
    await p.reload({ waitUntil: 'networkidle0' });
    ok(/Locked note/.test(await card()), 'L unlock: after a reload it is "Locked note" again (memory only)');
    ok(p.errors.length === 0, 'L unlock no page errors ' + p.errors.join('|'));
    await p.close();
  }

  if (want('sidebar')) {
    const u = await newUser('v8side');
    for (const f of ['Alpha', 'Beta']) await api('POST', '/folders', { name: f }, u.token);
    const ctx = await b.createBrowserContext(); // fresh storage: really signed out
    const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
    await p.setViewport({ width: 1440, height: 900 });
    await p.setRequestInterception(true);
    let slow = true;
    p.on('request', (r) => { if (slow && r.method() === 'GET' && /\/api\/folders$/.test(r.url())) setTimeout(() => r.continue(), 1500); else r.continue(); });
    await loginUI(p, u.email);
    await p.waitForSelector('nav[aria-label=Sidebar]', { timeout: 8000 });
    const seen = await p.evaluate(() => new Promise((res) => {
      const nav = () => document.querySelector('nav[aria-label=Sidebar]');
      const s = { skeleton: false, empty: false };
      const tick = () => {
        if (document.querySelector('[data-testid=folders-loading]')) s.skeleton = true;
        if ([...nav().querySelectorAll('button')].some((x) => x.textContent.trim() === 'New folder')) s.empty = true;
        if (/Alpha/.test(nav().innerText)) return res(s);
        requestAnimationFrame(tick);
      };
      tick(); setTimeout(() => res(s), 6000);
    }));
    ok(seen.skeleton && !seen.empty, `L sidebar after sign-in: skeleton while loading, never "no folders" (${JSON.stringify(seen)})`);
    ok(/Alpha[\s\S]*Beta/.test(await p.$eval('nav[aria-label=Sidebar]', (e) => e.innerText)), 'L sidebar: folders appear');

    // optimistic create, with the server slowed down
    p.removeAllListeners('request');
    p.on('request', (r) => { if (r.method() === 'POST' && /\/api\/folders$/.test(r.url())) setTimeout(() => r.continue(), 1500); else r.continue(); });
    await p.click('nav[aria-label="Sidebar"] button[aria-label="New folder"]');
    await p.waitForSelector('[role=dialog] input');
    await p.type('[role=dialog] input', 'alpha'); await p.keyboard.press('Enter'); await sleep(200);
    ok(await p.evaluate(() => /already have a folder/.test(document.querySelector('[role=dialog]')?.innerText || '')), 'L folder: duplicate name refused in the dialog (no round trip)');
    await p.evaluate(() => { const i = document.querySelector('[role=dialog] input'); i.select(); });
    await p.type('[role=dialog] input', 'Gamma');
    const t0 = Date.now(); await p.keyboard.press('Enter');
    await p.waitForSelector('[data-testid=folder-pending]', { timeout: 1000 }).catch(() => {});
    const ui = Date.now() - t0;
    ok(ui < 500 && !(await p.$('[role=dialog]')), `L folder: dialog closed and "Gamma" shown at once (${ui}ms, server delayed 1.5s)`);
    await p.waitForFunction(() => /folder=/.test(location.search), { timeout: 8000 }).catch(() => {});
    ok(/folder=/.test(await p.evaluate(() => location.search)) && !(await p.$('[data-testid=folder-pending]')), `L folder: saved, then opened (${Date.now() - t0}ms)`);
    const fl = (await api('GET', '/folders', null, u.token)).data.folders.map((f) => f.name);
    ok(fl.includes('Gamma') && fl.length === 3, `L folder: created once on the server (${fl})`);
    ok(p.errors.length === 0, 'L sidebar no page errors ' + p.errors.join('|'));
    await ctx.close();
  }

  if (want('banner')) {
    const u = await newUser('v8del');
    const p = await pageAs(b, u.token, u.user);
    await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Delete my account/.test(x.textContent)).click());
    await p.type('input[placeholder="Enter your password to confirm"]', PW);
    await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /Delete account and notes/.test(x.textContent)).click());
    await p.waitForSelector('[data-testid=login-flash]', { timeout: 8000 });
    const flash = () => p.evaluate(() => document.querySelector('[data-testid=login-flash]')?.innerText || '');
    ok(/account and all of your notes were deleted/.test(await flash()), 'c deleted-account banner on /login');
    await cdpOffline(p, true); await sleep(1500);
    ok(/were deleted/.test(await flash()), 'c banner stays while offline (CDP)');
    const offlineText = await p.evaluate(() => document.body.innerText);
    ok(!/session expired/i.test(offlineText), 'c no stray "session expired" while offline');
    await cdpOffline(p, false); await sleep(2500);
    ok(/were deleted/.test(await flash()), 'c banner stays after coming back online');
    await p.type('input[type=email]', 'a');
    ok(!(await p.$('[data-testid=login-flash]')), 'c banner clears once you start typing');
    await p.reload({ waitUntil: 'networkidle0' });
    ok(!(await p.$('[data-testid=login-flash]')), 'c one-time: gone after reload');
    ok(p.errors.length === 0, 'c no page errors ' + p.errors.join('|'));
    await p.close();
  }
} finally { await cleanup(); await b.close(); }
