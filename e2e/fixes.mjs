// Browser checks for the QA retest fixes. ONLY=history,capture,... runs a subset.
import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep } from './h.mjs';
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const b = await launch();
const errors = [];
const page = async (u, opts) => { const p = await pageAs(b, u.token, u.user, opts); p.on('pageerror', (e) => errors.push(e.message)); return p; };
const typeInEditor = async (p, text) => { await p.click('.cm-content'); await p.keyboard.press('End'); await p.keyboard.down('Control'); await p.keyboard.press('End'); await p.keyboard.up('Control'); await p.keyboard.type(text); };
const saved = (p) => p.waitForFunction(() => /saved/.test(document.querySelector('[data-testid=save-status]')?.dataset.state || ''), { timeout: 15000 });
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
      r.continue();
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
    await p.setOfflineMode(true); await sleep(200);
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
    await p.setRequestInterception(false);
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
  // @@NEXT@@
  ok(!errors.length, 'no page errors ' + errors.join(' | '));
} finally { await cleanup(); await b.close(); }
