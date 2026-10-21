// v6: QA retest 3, reproduced step by step.
//  1. Note load failure: title-only notes seen in the list (cached list copy), then GET /api/notes/<id>
//     blocked (like DevTools request blocking) + hard reload, and offline-open of a never-opened note.
//     Must show "Couldn't load this note" + Try again, never an editable editor, auto-recover after
//     unblocking, and never write to the note.
//  2. Settings: failing loads/actions never show raw "Failed to fetch"; calm status + Try again.
//  3. Landing CTAs (fresh, signed-out profile).
//  4. The page reports its build (html[data-build]) and the service worker activates new builds.
import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep } from './h.mjs';
const b = await launch();
const raw = (p) => p.evaluate(() => /Failed to fetch|NetworkError|Load failed/i.test(document.body.innerText));
try {
  const u = await newUser('v6');
  const p = await pageAs(b, u.token, u.user, { width: 1440, height: 900 });
  p.on('dialog', (d) => d.accept());
  await p.evaluate(() => localStorage.setItem('noted.tourDone', '1'));
  const alpha = (await api('POST', '/notes', { title: 'Alpha', content: '' }, u.token)).data.note;
  const beta = (await api('POST', '/notes', { title: 'Beta', content: '' }, u.token)).data.note;
  const gamma = (await api('POST', '/notes', { title: 'Gamma', content: 'Gamma body that must survive' }, u.token)).data.note;
  const before = async (id) => (await api('GET', `/notes/${id}`, null, u.token)).data.note;
  const snap = { alpha: await before(alpha._id), beta: await before(beta._id), gamma: await before(gamma._id) };
  // See them in the list first, so the device has list copies (what QA had).
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(500);

  // 1a. DevTools-style block of GET /api/notes/<id> + hard reload.
  let blocked = new Set([alpha._id, gamma._id]);
  const blockPaths = new Set();
  // One handler for the whole run (toggling interception mid-run races in-flight requests).
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    if (r.isInterceptResolutionHandled()) return;
    const url = new URL(r.url());
    const m = url.pathname.match(/^\/api\/notes\/([a-f0-9]{24})$/);
    if (m && blocked.has(m[1]) && r.method() === 'GET') return r.abort('blockedbyclient');
    if (blockPaths.has(url.pathname)) return r.abort('failed');
    return r.continue();
  });
  await p.goto(BASE + `/notes/${alpha._id}`, { waitUntil: 'domcontentloaded' });
  await p.reload({ ignoreCache: true, waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid=note-load-failed], .cm-content', { timeout: 10000 });
  let s = await p.evaluate(() => ({ failed: !!document.querySelector('[data-testid=note-load-failed]'), editor: !!document.querySelector('.cm-content, input[aria-label=Title]'), retry: [...document.querySelectorAll('[data-testid=note-load-failed] button')].some((x) => /Try again/.test(x.textContent)) }));
  ok(s.failed && !s.editor && s.retry, `blocked + hard reload (title-only note): "Couldn't load this note" + Try again, no editor (${JSON.stringify(s)})`);
  ok(!(await raw(p)), 'blocked: no raw "Failed to fetch" text');
  blocked.delete(alpha._id); await sleep(4500);
  s = await p.evaluate(() => ({ editor: !!document.querySelector('.cm-content'), title: document.querySelector('input[aria-label=Title]')?.value }));
  ok(s.editor && s.title === 'Alpha', `unblocked: recovers on its own and opens the note (${JSON.stringify(s)})`);
  // Same with a note that has a body (also only a list copy here).
  await p.goto(BASE + `/notes/${gamma._id}`, { waitUntil: 'domcontentloaded' });
  await p.reload({ ignoreCache: true, waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid=note-load-failed], .cm-content', { timeout: 10000 });
  ok(!!(await p.$('[data-testid=note-load-failed]')) && !(await p.$('.cm-content')), 'blocked + hard reload (note with body, list copy only): no editor');
  blocked.delete(gamma._id);
  await p.click('[data-testid=note-load-failed] .btn-primary'); await p.waitForSelector('.cm-content', { timeout: 5000 });
  ok((await p.$eval('.cm-content', (x) => x.innerText)).includes('Gamma body'), 'Try again opens it with its real body');

  // 1b. Offline-open of a never-opened note (Beta) from the list.
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(300);
  const cdp = await p.target().createCDPSession();
  const net = (offline) => cdp.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await net(true); await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await p.evaluate((id) => { history.pushState({}, '', `/notes/${id}`); dispatchEvent(new PopStateEvent('popstate')); }, beta._id);
  await p.waitForSelector('[data-testid=note-load-failed], .cm-content', { timeout: 8000 });
  s = await p.evaluate(() => ({ failed: !!document.querySelector('[data-testid=note-load-failed]'), editor: !!document.querySelector('.cm-content, input[aria-label=Title]'), preview: document.querySelector('[data-testid=note-load-preview]')?.innerText || '', text: document.querySelector('[data-testid=note-load-failed]')?.innerText || '' }));
  ok(s.failed && !s.editor && /offline/i.test(s.text) && /Beta/.test(s.preview), `offline, never opened: not editable; read-only preview + reconnect message (${JSON.stringify(s).slice(0, 160)})`);
  await net(false); await sleep(3500);
  ok(!!(await p.$('.cm-content')), 'back online: the note opens on its own');
  await cdp.detach();

  // Nothing was ever written to these notes.
  for (const [k, n] of Object.entries(snap)) {
    const now = await before(n._id);
    ok(now.content === n.content && now.title === n.title, `server copy of ${k} untouched (${JSON.stringify(now.content).slice(0, 40)})`);
  }
  // A full local copy (opened before) still opens and stays editable when the refresh is blocked.
  blocked.add(gamma._id);
  await p.goto(BASE + `/notes/${gamma._id}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('.cm-content', { timeout: 8000 });
  ok(!(await raw(p)), 'full local copy + blocked refresh: editor opens, no raw error');
  blocked.clear();

  // 2. Settings: blocked login activity, then a blocked action.
  blockPaths.add('/api/auth/activity');
  await p.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid=activity-error]', { timeout: 8000 });
  s = await p.evaluate(() => { const e = document.querySelector('[data-testid=activity-error]'); return { text: e.innerText, retry: !!e.querySelector('button'), red: !!e.querySelector('.text-red-700') }; });
  ok(/Couldn’t reach noted/.test(s.text) && s.retry && !s.red, `Settings login activity: calm status + Try again (${s.text.replace(/\n/g, ' ')})`);
  ok(!(await raw(p)), 'Settings: no raw "Failed to fetch" anywhere');
  blockPaths.delete('/api/auth/activity');
  await p.click('[data-testid=activity-error] button'); await p.waitForSelector('[data-testid=activity]', { timeout: 5000 });
  ok(!(await p.$('[data-testid=activity-error]')), 'Settings: Try again loads the activity and clears the status');
  // A later failure (the 30s/focus refresh) while the list is showing.
  blockPaths.add('/api/auth/activity');
  await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await sleep(800);
  ok(!(await raw(p)), 'Settings: a later failing refresh never shows raw "Failed to fetch"');
  blockPaths.add('/api/auth/password');
  const fill = (ph, v) => p.$eval(`input[placeholder="${ph}"]`, (el, val) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
  await fill('Current password', 'quiet-otter-lamp-91'); await fill('New password', 'amber-falcon-tide-73'); await fill('Confirm new password', 'amber-falcon-tide-73');
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Update password$/.test(x.textContent.trim()))?.click());
  await p.waitForSelector('[data-testid=settings-network-msg]', { timeout: 5000 }).catch(() => {});
  const msg = await p.$eval('[data-testid=settings-network-msg]', (x) => x.innerText).catch(() => '');
  ok(!(await raw(p)) && /Couldn’t reach noted/.test(msg), `Settings: a failed action reads calmly (${msg})`);
  blockPaths.clear();

  // 4. Build id is exposed; the service worker activates new builds immediately.
  const build = await p.evaluate(() => document.documentElement.dataset.build);
  ok(!!build && build !== 'dev', `html[data-build] = ${build}`);
  const sw = await (await fetch(BASE + '/sw.js')).text();
  ok(/skipWaiting/.test(sw) && /clientsClaim/.test(sw) && /cleanupOutdatedCaches/.test(sw), 'sw.js: skipWaiting + clientsClaim + cleanupOutdatedCaches');
  ok(p.errors.length === 0, `no page errors (${p.errors.join(' | ')})`);

  // 3. Landing in a fresh profile.
  const ctx = await b.createBrowserContext();
  const lp = await ctx.newPage(); await lp.setViewport({ width: 1440, height: 900 });
  await lp.goto(BASE + '/', { waitUntil: 'networkidle0' });
  const links = await lp.$$eval('a[href="/register"]', (xs) => xs.map((x) => ({ t: x.textContent.trim(), compact: x.dataset.cta === 'compact', header: !!x.closest('header') })));
  ok(links.filter((l) => !l.compact).every((l) => l.t === 'Start writing — it’s free') && links.filter((l) => l.compact).length === 1 && links.find((l) => l.compact).header, `landing (fresh profile): ${JSON.stringify(links.map((l) => l.t))}`);
  ok((await lp.evaluate(() => document.documentElement.dataset.build)) === build, 'landing serves the same build');
  await ctx.close();
} finally { await cleanup(); await b.close(); }
