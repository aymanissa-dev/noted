// Browser checks for the QA retest fixes. ONLY=history,capture,... runs a subset.
import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep, created } from './h.mjs';
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const b = await launch();
const errors = [];
const page = async (u, opts) => { const p = await pageAs(b, u.token, u.user, opts); p.on('pageerror', (e) => errors.push(e.message)); return p; };
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
    await p.click('[aria-label="Version history"]'); await p.waitForSelector('[data-testid=history-current]');
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
  }
  if (want('capture')) {
    const u = await newUser('fix');
    await api('POST', '/notes', { title: 'Existing', content: 'x' }, u.token);
    const p = await page(u);
    await p.goto(`${BASE}/notes`, { waitUntil: 'networkidle0' });
    // slow server: the note must show before the POST returns
    await p.setRequestInterception(true);
    let slow = true, failCreates = false;
    p.on('request', async (r) => {
      if (r.isInterceptResolutionHandled()) return;
      if (r.method() === 'POST' && /\/api\/notes$/.test(r.url())) {
        if (failCreates) return r.abort('internetdisconnected');
        if (slow) { await sleep(2000); }
      }
      r.continue().catch(() => {});
    });
    await p.click('#quick-capture'); await p.keyboard.type('QC line one');
    await p.keyboard.down('Shift'); await p.keyboard.press('Enter'); await p.keyboard.up('Shift');
    await p.keyboard.type('line two #qatag');
    const t0 = Date.now(); await p.keyboard.press('Enter');
    await p.waitForFunction(() => [...document.querySelectorAll('[data-flip-id] h3')].some((h) => h.innerText.includes('QC line one')), { timeout: 5000 });
    const shown = Date.now() - t0;
    ok(shown < 400, `quick capture shows the note immediately (${shown}ms, server takes 2s)`);
    await p.evaluate(() => window.dispatchEvent(new Event('noted:notes-changed'))); // a list refetch races the save
    await sleep(700);
    ok(await p.evaluate(() => [...document.querySelectorAll('[data-flip-id] h3')].some((h) => h.innerText.includes('QC line one'))), 'optimistic card survives a list refetch while saving');
    await p.waitForFunction(() => !document.querySelector('[data-flip-id^=optimistic]'), { timeout: 8000 });
    const list = (await api('GET', '/notes', null, u.token)).data.notes;
    const qc = list.find((n) => n.title === 'QC line one');
    ok(qc && qc.tags.includes('qatag') && qc.content === 'line two #qatag', `#tag in the body becomes a tag (${JSON.stringify(qc?.tags)})`);
    ok(await p.$$eval('[data-flip-id]', (els) => els.filter((e) => e.innerText.includes('QC line one')).length === 1), 'optimistic card replaced by the saved note (no duplicate)');
    slow = false;
    // offline: queue two notes, then come back online while the network is still flaky
    await p.setOfflineMode(true); await p.waitForFunction(() => !navigator.onLine); await sleep(300);
    for (const t of ['Offline QC note', 'Quick capture xyz']) { await p.click('#quick-capture'); await p.keyboard.type(t); await p.keyboard.press('Enter'); await sleep(200); }
    const banner = () => p.evaluate(() => document.querySelector('[role=status]')?.innerText || '');
    ok(/2 pending/.test(await banner()), 'offline: pending count 2 — ' + (await banner()));
    failCreates = true; // network "up" but requests still failing at first
    await p.setOfflineMode(false);
    await sleep(1500);
    failCreates = false;
    const t1 = Date.now();
    await p.waitForFunction(() => !/pending/.test(document.querySelector('[role=status]')?.innerText || ''), { timeout: 30000 });
    ok(true, `queue flushed without reload ${Date.now() - t1}ms after the network recovered`);
    const titles = (await api('GET', '/notes', null, u.token)).data.notes.map((n) => n.title);
    ok(titles.filter((t) => t === 'Offline QC note').length === 1 && titles.includes('Quick capture xyz'), 'offline notes synced once, full titles intact');
    // the online event alone flushes too
    await p.setOfflineMode(true); await sleep(200);
    await p.click('#quick-capture'); await p.keyboard.type('Third offline'); await p.keyboard.press('Enter'); await sleep(200);
    const t2 = Date.now(); await p.setOfflineMode(false);
    await p.waitForFunction(() => !/pending/.test(document.querySelector('[role=status]')?.innerText || ''), { timeout: 10000 });
    ok(Date.now() - t2 < 3000, `'online' event flushes the queue (${Date.now() - t2}ms)`);
    await p.close();
  }
  if (want('pin')) {
    const u = await newUser('fix');
    await api('PUT', '/auth/lock-pin', { password: 'password123', pin: '2468' }, u.token);
    const n = (await api('POST', '/notes', { title: 'Secret', content: 'hidden' }, u.token)).data.note;
    await api('PATCH', `/notes/${n._id}/lock`, { locked: true }, u.token);
    const p = await page(u);
    await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' });
    const msgs = [];
    for (let i = 1; i <= 5; i++) {
      await p.waitForSelector('input[aria-label=PIN]:not([disabled])');
      await p.type('input[aria-label=PIN]', '1111'); await p.keyboard.press('Enter');
      await p.waitForFunction((k) => document.querySelector('[data-testid=pin-error]') && !document.querySelector('form button.btn-primary')?.innerText.includes('Checking'), {}, i);
      await sleep(150);
      msgs.push(await p.$eval('[data-testid=pin-error]', (e) => e.innerText));
    }
    ok(/4 attempts left/.test(msgs[0]) && /1 attempt left/.test(msgs[3]), `wrong PINs count down: ${msgs.slice(0, 4).join(' / ')}`);
    ok(/Too many wrong attempts\. Try again in [45]:\d\d/.test(msgs[4]), `5th wrong PIN blocks immediately: ${msgs[4]}`);
    ok(await p.$eval('input[aria-label=PIN]', (e) => e.disabled), 'PIN input disabled during the block');
    const r = await api('POST', `/notes/${n._id}/unlock`, { pin: '2468' }, u.token);
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
      await p.type('input[type=email]', u.email); await p.type('input[autocomplete=current-password]', 'password123');
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
      await p.evaluate((l) => { const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === l || x.innerText.trim() === l); b.click(); }, label);
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
    const u = await newUser('fix');
    await api('PUT', '/auth/lock-pin', { password: 'password123', pin: '2468' }, u.token);
    const mk = async (title) => (await api('POST', '/notes', { title, content: title }, u.token)).data.note;
    const a = await mk('Alpha recent'), bn = await mk('Beta recent'), l = await mk('Secret recent');
    await api('PATCH', `/notes/${l._id}/lock`, { locked: true }, u.token);
    for (const n of [a, bn, l]) { await api('GET', `/notes/${n._id}`, null, u.token); await sleep(20); }
    await api('DELETE', `/notes/${bn._id}`, null, u.token); // in the trash
    const p = await page(u);
    const recent = () => p.evaluate(() => { const h = [...document.querySelectorAll('nav[aria-label=Sidebar] h2')].find((x) => /recent/i.test(x.innerText)); return h ? h.closest('div').parentElement.innerText : ''; });
    await p.goto(`${BASE}/trash`, { waitUntil: 'networkidle0' }); await sleep(300);
    ok(/Locked note/.test(await recent()) && !/Beta recent/.test(await recent()), 'recent: trashed note hidden, locked note shown as locked');
    p.on('dialog', (d) => d.accept());

    // delete forever from the trash
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Delete forever/.test(x.innerText)).click());
    await sleep(300);
    await p.evaluate(() => { const c = document.querySelector('[role=alertdialog] button[data-confirm], [role=dialog] button[data-confirm]'); c?.click(); });
    await p.waitForFunction(() => !document.body.innerText.includes('Beta recent'), { timeout: 5000 });
    const r1 = await api('GET', '/notes/recent', null, u.token);
    ok(!r1.data.notes.some((n) => n._id === bn._id), 'recent (server): permanently deleted note gone');
    // remove the PIN in Settings → the sidebar shows the note's real title without a reload
    await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
    await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Remove PIN').click());
    await p.waitForSelector('input[placeholder="Account password"]'); await p.type('input[placeholder="Account password"]', 'password123');
    await p.evaluate(() => [...document.querySelectorAll('form button')].find((x) => /Remove PIN/.test(x.innerText)).click());
    await p.waitForFunction(() => /PIN removed/.test(document.body.innerText), { timeout: 8000 });
    const t0 = Date.now();
    await p.waitForFunction(() => { const nav = document.querySelector('nav[aria-label=Sidebar]'); return nav && nav.innerText.includes('Secret recent') && !nav.innerText.includes('Locked note'); }, { timeout: 5000 }).catch(() => {});
    ok(/Secret recent/.test(await recent()), `recent: PIN removed → title shown (${Date.now() - t0}ms) — ${(await recent()).replace(/\s+/g, ' ')}`);
  }
  if (want('activity')) {
    const u = await newUser('fix');
    const p = await page(u);
    await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-testid=activity] li');
    const count = () => p.$$eval('[data-testid=activity] li', (l) => l.length);
    const c0 = await count();
    p.on('dialog', (d) => d.accept());

    const other = await api('POST', '/auth/login', { email: u.email, password: 'password123' });
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
