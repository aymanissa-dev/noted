// Browser checks for the QA retest fixes. ONLY=history,capture,... runs a subset.
import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep, created } from './h.mjs';
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const b = await launch();
const errors = [];
const page = async (u, opts) => { const p = await pageAs(b, u.token, u.user, opts); p.on('pageerror', (e) => errors.push(e.message)); return p; };
// Editor actions live in the "More actions" menu (or are visible buttons on wide toolbars).
const editorAction = async (p, label) => {
  const visible = await p.evaluate((l) => { const b = [...document.querySelectorAll(`button[aria-label="${l}"]`)].find((x) => x.offsetParent); if (b) { b.click(); return true; } return false; }, label);
  if (visible) return;
  await p.click('[data-testid=note-more]'); await p.waitForSelector(`[role=menu] [aria-label="${label}"]`);
  await p.click(`[role=menu] [aria-label="${label}"]`);
};
const typeInEditor = async (p, text) => { await p.click('.cm-content'); await p.keyboard.press('End'); await p.keyboard.down('Control'); await p.keyboard.press('End'); await p.keyboard.up('Control'); await p.keyboard.type(text); };
const saved = async (p) => { await p.waitForFunction(() => /dirty|saving/.test(document.querySelector('[data-testid=save-status]')?.dataset.state || ''), { timeout: 3000 }).catch(() => {}); return savedNow(p); };
const savedNow = (p) => p.waitForFunction(() => /saved/.test(document.querySelector('[data-testid=save-status]')?.dataset.state || ''), { timeout: 15000 });
try {
  // ---- 1. history: QA repro ----
  if (want('history')) {
    const u = await newUser('fix');
    const n = (await api('POST', '/notes', { title: 'Beta pancakes', content: 'Body of Beta pancakes' }, u.token)).data.note;
    const p = await page(u);
    await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
    for (const t of [' edit one', ' edit two', ' edit three']) { await typeInEditor(p, t); await saved(p); await sleep(3500); }
    let vs = (await api('GET', `/notes/${n._id}/versions`, null, u.token)).data.versions;
    ok(vs.length === 1 && vs[0].preview === 'Body of Beta pancakes', `history: original kept after the first edit (${vs.length} version)`);
    await editorAction(p, 'Version history'); await p.waitForSelector('[data-testid=history-current]');
    const listText = await p.$eval('[role=dialog] ul', (e) => e.innerText);
    ok(/Current version/.test(listText) && (listText.match(/chars/g) || []).length === 2, 'history panel lists the current version + the original');
    await p.keyboard.press('Escape');
    // reopen (new session) → first edit snapshots the state left behind
    await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
    await typeInEditor(p, ' next day'); await saved(p);
    vs = (await api('GET', `/notes/${n._id}/versions`, null, u.token)).data.versions;
    ok(vs.length === 2 && /edit three$/.test(vs[0].preview), 'history: reopening and editing keeps a new version');
    // cumulative change: many small saves add up to a version
    for (let i = 0; i < 4; i++) { await typeInEditor(p, ' ' + 'word '.repeat(18)); await saved(p); }
    vs = (await api('GET', `/notes/${n._id}/versions`, null, u.token)).data.versions;
    ok(vs.length === 3, `history: ~360 chars typed over 4 saves → another version (${vs.length})`);
    // Close it: an open, online tab shares localStorage and would sync the next test's offline queue.
    await p.close();
  }
  // (Quick capture was removed from the app in 1.8; its optimistic/offline checks went with it.
  //  Offline creation from the editor is covered by v7/final/sw.)
  if (want('pin')) {
    const u = await newUser('fix');
    await api('PUT', '/auth/lock-pin', { password: 'quiet-otter-lamp-91', pin: '246800' }, u.token);
    const n = (await api('POST', '/notes', { title: 'Secret', content: 'hidden' }, u.token)).data.note;
    await api('PATCH', `/notes/${n._id}/lock`, { locked: true }, u.token);
    const p = await page(u);
    await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' });
    const msgs = [];
    for (let i = 1; i <= 5; i++) {
      await p.waitForSelector('input[aria-label=PIN]:not([disabled])');
      await p.type('input[aria-label=PIN]', '111111'); await p.keyboard.press('Enter');
      await p.waitForFunction((k) => document.querySelector('[data-testid=pin-error]') && !document.querySelector('form button.btn-primary')?.innerText.includes('Checking'), {}, i);
      await sleep(150);
      msgs.push(await p.$eval('[data-testid=pin-error]', (e) => e.innerText));
    }
    ok(/4 attempts left/.test(msgs[0]) && /1 attempt left/.test(msgs[3]), `wrong PINs count down: ${msgs.slice(0, 4).join(' / ')}`);
    ok(/Too many wrong attempts\. Try again in [45]:\d\d/.test(msgs[4]), `5th wrong PIN blocks immediately: ${msgs[4]}`);
    ok(await p.$eval('input[aria-label=PIN]', (e) => e.disabled), 'PIN input disabled during the block');
    const r = await api('POST', `/notes/${n._id}/unlock`, { pin: '246800' }, u.token);
    ok(r.status === 429, 'server refuses even the right PIN during the block');
  }
  if (want('leave')) {
    const u = await newUser('fix');
    const n = (await api('POST', '/notes', { title: 'Leave', content: 'start' }, u.token)).data.note;
    const p = await page(u);
    let dialogs = 0; p.on('dialog', async (d) => { if (d.type() === 'beforeunload') dialogs++; await d.accept(); });
    const content = async () => (await api('GET', `/notes/${n._id}`, null, u.token)).data.note.content;
    // a) Unsaved (before autosave fires): prompt, and the keepalive save still lands
    await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
    await typeInEditor(p, ' unsaved-edit');
    await p.waitForSelector('[data-testid=save-status]', { timeout: 3000 }).catch(() => {});
    ok(await p.evaluate(() => document.querySelector('[data-testid=save-status]')?.dataset.state) === 'dirty', 'state is Unsaved');
    await p.reload({ waitUntil: 'networkidle0' }); await sleep(800);
    ok(dialogs === 1, `leave prompt shown while Unsaved (${dialogs})`);
    ok((await content()).endsWith('unsaved-edit'), 'keepalive save landed after leaving');
    // b) Saving… (request in flight): prompt
    await p.waitForSelector('.cm-content');
    await p.setRequestInterception(true);
    const hold = (r) => { if (r.isInterceptResolutionHandled()) return; if (r.method() === 'PUT') setTimeout(() => r.continue().catch(() => {}), 4000); else r.continue(); };
    p.on('request', hold);
    await typeInEditor(p, ' saving-edit');
    await p.waitForFunction(() => document.querySelector('[data-testid=save-status]')?.dataset.state === 'saving', { timeout: 5000 });
    await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(800);
    ok(dialogs === 2, `leave prompt shown while Saving… (${dialogs})`);
    p.off('request', hold); await p.setRequestInterception(false);
    await sleep(4500);
    ok((await content()).endsWith('saving-edit'), 'edit made while saving was kept');
    // c) Saved: no prompt
    await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
    await typeInEditor(p, ' done'); await saved(p); await sleep(300);
    await p.goto(`${BASE}/notes`, { waitUntil: 'networkidle0' }); await p.goto('about:blank'); await sleep(300);
    ok(dialogs === 2, `no prompt once saved (${dialogs})`);
  }
  if (want('redirect')) {
    const u = await newUser('fix');
    const n = (await api('POST', '/notes', { title: 'Deep', content: 'x' }, u.token)).data.note;
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 800 }); p.on('pageerror', (e) => errors.push(e.message));
    const loginFrom = async (path) => {
      await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
      await p.goto(BASE + path, { waitUntil: 'networkidle0' });
      await p.waitForSelector('input[type=email]');
      await p.type('input[type=email]', u.email); await p.type('input[autocomplete=current-password]', 'quiet-otter-lamp-91');
      await Promise.all([p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 15000 }), p.click('form button.btn-primary')]);
      await sleep(300); return new URL(p.url()).pathname;
    };
    for (const path of ['/trash', '/archive', '/settings', '/stats', '/notes?tag=x', '/notes/new']) {
      const got = await loginFrom(path); ok(got === '/notes', `login from ${path} → ${got}`);
    }
    const got = await loginFrom(`/notes/${n._id}`); ok(got === `/notes/${n._id}`, 'login from a note deep link returns to that note');
    await ctx.close();
  }
  if (want('undo')) {
    const u = await newUser('fix');
    await api('POST', '/notes', { title: 'Keeper', content: 'k' }, u.token);
    const n = (await api('POST', '/notes', { title: 'Delete me', content: 'bye' }, u.token)).data.note;
    const p = await page(u, { width: 1024, height: 800 });
    await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
    await p.setRequestInterception(true);
    let archives = 0;
    p.on('request', (r) => {
      if (r.isInterceptResolutionHandled()) return;
      const undo = r.method() === 'POST' && /\/restore$/.test(r.url()) || (r.method() === 'PATCH' && /\/archive$/.test(r.url()) && ++archives === 2);
      if (undo) setTimeout(() => r.continue().catch(() => {}), 2500); else r.continue().catch(() => {});
    });
    const has = () => p.evaluate((id) => Boolean(document.querySelector(`[data-flip-id="${id}"]`)), n._id);
    for (const [action, label] of [['delete', 'Delete'], ['archive', 'Archive']]) {
      await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
      await editorAction(p, label);
      await p.waitForFunction(() => location.pathname === '/notes');
      await p.waitForFunction(() => [...document.querySelectorAll('button')].some((x) => x.innerText.trim() === 'Undo'), { timeout: 5000 });
      await sleep(1200); // let the move request land and the list settle
      ok(!(await has()), `${action}: note left the list`);
      const t0 = Date.now();
      await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Undo').click());
      await p.waitForFunction((id) => document.querySelector(`[data-flip-id="${id}"]`), { timeout: 5000 }, n._id);
      const ms = Date.now() - t0;
      ok(ms < 300, `${action} → Undo: note back in the list in ${ms}ms (server takes 2.5s)`);
      await sleep(3200);
      ok(await has(), `${action} → Undo: still there after the server confirms`);
      const s2 = (await api('GET', `/notes/${n._id}`, null, u.token)).data.note;
      ok(!s2.deletedAt && !s2.archived, `${action} → Undo: server state restored`); if (s2.deletedAt) console.log(JSON.stringify(s2), await p.evaluate(() => document.body.innerText.slice(-300)));
    }
    await p.close();
  }
  if (want('recent')) {
    // The sidebar no longer shows "Recently viewed" (1.8); the server list still backs ⌘K.
    const u = await newUser('fix');
    const mk = async (title) => (await api('POST', '/notes', { title, content: title }, u.token)).data.note;
    const a = await mk('Alpha recent'), bn = await mk('Beta recent');
    for (const n of [a, bn]) { await api('GET', `/notes/${n._id}`, null, u.token); await sleep(20); }
    await api('DELETE', `/notes/${bn._id}`, null, u.token); // in the trash
    const p = await page(u); p.on('dialog', (d) => d.accept());
    await p.goto(`${BASE}/trash`, { waitUntil: 'networkidle0' }); await sleep(300);
    ok(!(await p.evaluate(() => [...document.querySelectorAll('nav[aria-label=Sidebar] h2')].some((x) => /recent/i.test(x.innerText)))), 'recent: not shown in the sidebar');
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Delete forever/.test(x.innerText)).click());
    await sleep(300);
    await p.evaluate(() => { const c = document.querySelector('[role=alertdialog] button[data-confirm], [role=dialog] button[data-confirm]'); c?.click(); });
    await p.waitForFunction(() => !document.body.innerText.includes('Beta recent'), { timeout: 5000 });
    const r1 = await api('GET', '/notes/recent', null, u.token);
    ok(!r1.data.notes.some((n) => n._id === bn._id) && r1.data.notes.some((n) => n._id === a._id), 'recent (server): permanently deleted note gone, others kept');
    await p.close();
  }
  if (want('activity')) {
    const u = await newUser('fix');
    const p = await page(u);
    await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-testid=activity] li');
    const count = () => p.$$eval('[data-testid=activity] li', (l) => l.length);
    const c0 = await count();
    p.on('dialog', (d) => d.accept());

    const other = await api('POST', '/auth/login', { email: u.email, password: 'quiet-otter-lamp-91' });
    await p.evaluate(() => window.dispatchEvent(new Event('focus'))); // you come back to the tab
    await p.waitForFunction((n) => document.querySelectorAll('[data-testid=activity] li').length > n, { timeout: 5000 }, c0).catch(() => {});
    ok((await count()) === c0 + 1, `activity: a new sign-in shows when you return to the tab (${c0} → ${await count()})`);
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Sign out of all other devices/i.test(x.innerText)).click());
    await sleep(300);
    await p.evaluate(() => { const c = document.querySelector('[role=alertdialog] button[data-confirm], [role=dialog] button[data-confirm]'); c?.click(); });
    await p.waitForFunction(() => document.querySelector('[data-testid=activity]')?.innerText.includes('Signed out'), { timeout: 6000 }).catch(() => {});
    ok(new URL(p.url()).pathname === '/settings', 'this session stays signed in (a request racing the token rotation retries instead of logging out)');
    ok(/Signed out/.test(await p.$eval('[data-testid=activity]', (e) => e.innerText)), 'activity: sign out everywhere marks other sessions as signed out right away');
    ok((await api('GET', '/auth/me', null, other.data.token)).status === 401, 'other session really signed out');
    created.push({ email: u.email, token: await p.evaluate(() => localStorage.getItem('noted.token')) }); // new token for cleanup
  }
  if (want('speed')) {
    const u = await newUser('fix');
    const ids = [];
    for (let i = 0; i < 12; i++) ids.push((await api('POST', '/notes', { title: `Speed ${i}`, content: `Body ${i} `.repeat(30) }, u.token)).data.note._id);
    const p = await page(u);
    await p.goto(`${BASE}/notes`, { waitUntil: 'networkidle0' }); // first visit fills the caches
    const cdp = await p.createCDPSession();
    const LAT = Number(process.env.LATENCY ?? 300);
    if (LAT) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: LAT, downloadThroughput: -1, uploadThroughput: -1 });
    const card = '[data-flip-id]:not([data-flip-id^=optimistic]) h3';
    const list = [], open = [];
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now(); await p.goto(`${BASE}/notes`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector(card); list.push(Date.now() - t0); await sleep(2500);
    }
    // count API requests on a repeat visit (duplicates)
    const seen = []; const onReq = (r) => { if (r.url().includes('/api/')) seen.push(r.method() + ' ' + new URL(r.url()).pathname); };
    p.on('request', onReq); await p.goto(`${BASE}/notes`, { waitUntil: 'domcontentloaded' }); await sleep(3000); p.off('request', onReq);
    const gets = seen.filter((x) => x.startsWith('GET'));
    const dups = gets.filter((x, i) => gets.indexOf(x) !== i);
    ok(!dups.length, `no duplicate API requests on a list visit (${gets.join(', ')})`);
    for (let i = 0; i < 3; i++) {
      const sel = `[data-flip-id="${ids[i + 2]}"] a`;
      await p.waitForSelector(sel); await p.hover(sel); await sleep(LAT * 2 + 300);
      const t0 = Date.now(); await p.click(sel);
      await p.waitForFunction((n) => document.querySelector('.cm-content')?.innerText.includes(`Body ${n}`), {}, i + 2);
      open.push(Date.now() - t0);
      await p.goto(`${BASE}/notes`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector(card); await sleep(1500);
    }
    const med = (a) => [...a].sort((x, y) => x - y)[1];
    ok(med(list) < 300, `repeat-visit list render ${list.join('/')}ms (median ${med(list)}, ${LAT}ms added latency)`);
    ok(med(open) < 500, `note open after hover ${open.join('/')}ms (median ${med(open)})`);
  }
  // @@NEXT@@
  ok(!errors.length, 'no page errors ' + errors.join(' | '));
} finally { await cleanup(); await b.close(); }
