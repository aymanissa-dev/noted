// v5 regressions for the QA v3 retest: wide screens, landing CTA + contrast, standalone typewriter,
// fast "/Heading 2" after an emoji line, list exit on Enter, note-not-found, reactive online state.
import { createRequire } from 'node:module';
import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep } from './h.mjs';
const require = createRequire(import.meta.url);
let axePath = null; try { axePath = require.resolve('axe-core/axe.min.js'); } catch { /* optional */ }
const b = await launch();
const content = async (u, id) => (await api('GET', `/notes/${id}`, null, u.token)).data.note.content;
const mod = async (p, key) => { await p.keyboard.down('Control'); await p.keyboard.press(key); await p.keyboard.up('Control'); };
const open = async (p, path) => { await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }); };
try {
  const u = await newUser('v5');
  const other = await newUser('v5b');
  const p = await pageAs(b, u.token, u.user, { width: 1440, height: 900 });
  p.on('dialog', (d) => d.accept());
  await p.evaluate(() => localStorage.setItem('noted.tourDone', '1'));

  // A. Wide screens: the shell fills the viewport and the editor pane flexes; text column ~70ch, centered.
  const n = (await api('POST', '/notes', { title: 'Wide', content: 'Some text for the measure. '.repeat(30) }, u.token)).data.note;
  for (const w of [1920, 2560]) {
    await p.setViewport({ width: w, height: 1080 });
    await open(p, `/notes/${n._id}`); await p.waitForSelector('.cm-content'); await sleep(300);
    const m = await p.evaluate(() => {
      const card = document.querySelector('[data-testid=editor-card]').getBoundingClientRect();
      const text = document.querySelector('.cm-content').getBoundingClientRect();
      const main = document.querySelector('main').getBoundingClientRect();
      return { vw: innerWidth, mainR: Math.round(innerWidth - main.right), card: Math.round(card.width), text: Math.round(text.width), centered: Math.abs((text.left + text.right) / 2 - (card.left + card.right) / 2) < 40 };
    });
    ok(m.mainR <= 40, `${w}: app fills the viewport (right gap ${m.mainR}px)`);
    ok(m.card >= w * 0.5, `${w}: editor pane flexes wide (${m.card}px)`);
    ok(m.text >= 520 && m.text <= 720 && m.centered, `${w}: text column ~70ch and centered (${m.text}px)`);
  }
  await p.setViewport({ width: 1440, height: 900 });

  // C. Typewriter mode on its own: toolbar toggle, palette entry, Alt+Shift+T.
  const long = Array.from({ length: 90 }, (_, i) => `Line ${i + 1} of a long note`).join('\n');
  const t = (await api('POST', '/notes', { title: 'Long', content: long }, u.token)).data.note;
  await open(p, `/notes/${t._id}`); await p.waitForSelector('[data-testid=typewriter-toggle]');
  await p.click('[data-testid=typewriter-toggle]'); await sleep(200);
  ok(await p.$eval('[data-testid=typewriter-toggle]', (x) => x.getAttribute('aria-pressed') === 'true'), 'typewriter: toolbar toggle turns it on (outside focus mode)');
  await p.click('.cm-content'); await mod(p, 'End'); await p.keyboard.type(' end'); await sleep(400);
  const off = () => p.evaluate(() => { const s = getSelection(); const r = s.getRangeAt(0).getBoundingClientRect(); return Math.round((r.top + r.bottom) / 2 - innerHeight / 2); });
  let d = await off(); ok(Math.abs(d) < 60 && !(await p.$('.fixed.inset-0[data-testid=editor-card]')), `typewriter (no focus mode): caret centered at end (off ${d}px)`);
  for (let i = 0; i < 25; i++) await p.keyboard.press('ArrowUp');
  await sleep(400); d = await off(); ok(Math.abs(d) < 60, `typewriter (no focus mode): stays centered moving up (off ${d}px)`);
  await p.keyboard.down('Alt'); await p.keyboard.down('Shift'); await p.keyboard.press('KeyT'); await p.keyboard.up('Shift'); await p.keyboard.up('Alt'); await sleep(200);
  ok(await p.$eval('[data-testid=typewriter-toggle]', (x) => x.getAttribute('aria-pressed') === 'false'), 'typewriter: Alt+Shift+T toggles it off');
  await mod(p, 'k'); await p.waitForSelector('[data-testid=palette]'); await p.keyboard.type('typewriter'); await sleep(200);
  const first = await p.$eval('[data-testid=palette] [role=option]', (x) => x.textContent);
  ok(/Typewriter mode/.test(first), `palette: "typewriter" finds Typewriter mode (${first.trim().slice(0, 40)})`);
  await p.keyboard.press('Enter'); await sleep(300);
  ok(await p.$eval('[data-testid=typewriter-toggle]', (x) => x.getAttribute('aria-pressed') === 'true'), 'palette: Enter turns typewriter mode on');
  await p.evaluate(() => localStorage.setItem('noted:typewriter', '0'));
  await open(p, '/help'); await p.waitForSelector('[data-testid=help-page]');
  ok(await p.evaluate(() => document.body.innerText.includes('Typewriter')), 'Help mentions typewriter mode and its shortcut');

  // 2. "/Heading 2" typed fast on the line after an emoji, then Enter, becomes an H2.
  for (const pause of [0, 60, 150]) {
    const e = (await api('POST', '/notes', { title: 'Slash', content: '# Big head' }, u.token)).data.note;
    await open(p, `/notes/${e._id}`); await p.waitForSelector('.cm-content');
    await p.click('.cm-content'); await mod(p, 'End'); await p.keyboard.press('Enter');
    await p.keyboard.type(':smile'); await p.waitForSelector('.cm-tooltip-autocomplete'); await sleep(300); await p.keyboard.press('Enter');
    await p.keyboard.press('Enter'); await p.keyboard.type('/Heading 2'); await sleep(pause); await p.keyboard.press('Enter'); await p.keyboard.type('Second');
    const txt = await p.$eval('.cm-content', (x) => x.innerText);
    ok(txt.includes('😄\n## Second') && !txt.includes('/Heading'), `slash: fast "/Heading 2" + Enter after an emoji line (${pause}ms) → H2`);
  }
  // …and Esc then Enter keeps it literal (you dismissed the menu).
  {
    const e = (await api('POST', '/notes', { title: 'Esc', content: '' }, u.token)).data.note;
    await open(p, `/notes/${e._id}`); await p.waitForSelector('.cm-content'); await p.click('.cm-content');
    await p.keyboard.type('/h2'); await p.waitForSelector('.cm-tooltip-autocomplete'); await p.keyboard.press('Escape'); await sleep(100); await p.keyboard.press('Enter');
    ok((await p.$eval('.cm-content', (x) => x.innerText)).startsWith('/h2'), 'slash: Esc closes the menu and Enter is a plain new line');
  }

  // 3. Enter on an empty list item ends the list (bullets, numbers, tasks) or outdents a nested one.
  for (const [label, typed, expect] of [
    ['bullet', '- one', '- one\nafter'],
    ['ordered', '1. one', '1. one\nafter'],
    ['task', '- [ ] one', '- [ ] one\nafter'],
  ]) {
    const e = (await api('POST', '/notes', { title: label, content: '' }, u.token)).data.note;
    await open(p, `/notes/${e._id}`); await p.waitForSelector('.cm-content'); await p.click('.cm-content');
    await p.keyboard.type(typed); await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); await p.keyboard.type('after'); await sleep(1500);
    const c = await content(u, e._id);
    ok(c === expect, `list: Enter on an empty ${label} item exits the list (${JSON.stringify(c)})`);
  }
  {
    const e = (await api('POST', '/notes', { title: 'nested', content: '- one\n  - two' }, u.token)).data.note;
    await open(p, `/notes/${e._id}`); await p.waitForSelector('.cm-content'); await p.click('.cm-content'); await mod(p, 'End');
    await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); await p.keyboard.type('three'); await sleep(1500);
    const c = await content(u, e._id);
    ok(c === '- one\n  - two\n- three', `list: empty nested item outdents one level (${JSON.stringify(c)})`);
  }

  // 4. Someone else's note / a bad id: a real not-found state, no editor.
  const foreign = (await api('POST', '/notes', { title: 'Theirs', content: 'secret' }, other.token)).data.note;
  for (const id of [foreign._id, '6ad87c4ebbc68bed722dfa73', 'not-an-id']) {
    await open(p, `/notes/${id}`); await p.waitForSelector('[data-testid=note-not-found], .cm-content', { timeout: 8000 });
    const s = await p.evaluate(() => ({ nf: !!document.querySelector('[data-testid=note-not-found]'), editor: !!document.querySelector('.cm-content, input[aria-label=Title]'), primary: document.querySelector('[data-testid=note-not-found] .btn-primary')?.textContent, secret: document.body.innerText.includes('secret') }));
    ok(s.nf && !s.editor && /Back to notes/.test(s.primary || '') && !s.secret, `not found (${id.slice(0, 8)}…): proper state with Back to notes, no editor`);
  }
  await p.click('[data-testid=note-not-found] .btn-primary'); await sleep(400);
  ok(new URL(p.url()).pathname === '/notes', 'not found: Back to notes goes to the list');

  // 5. Online status is reactive: Settings and Archive recover without a reload.
  const cdp = await p.target().createCDPSession();
  const net = (offline) => cdp.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  for (const [path, sel] of [['/settings', '[data-testid=activity]'], ['/archive', '[data-testid=empty-state]']]) {
    await open(p, path); await sleep(800);
    await net(true); await p.evaluate(() => window.dispatchEvent(new Event('offline')));
    await p.evaluate((pth) => { history.pushState({}, '', '/notes'); dispatchEvent(new PopStateEvent('popstate')); history.pushState({}, '', pth); dispatchEvent(new PopStateEvent('popstate')); }, path);
    await sleep(800);
    const offText = await p.evaluate(() => document.body.innerText);
    ok(/offline/i.test(offText), `${path}: shows offline state while offline`);
    await net(false); await sleep(1500);
    const t2 = await p.evaluate(() => document.body.innerText);
    const hasSel = !!(await p.$(sel));
    ok(!/You are offline|You’re offline/.test(t2) && hasSel, `${path}: offline message clears and content loads after reconnect (no reload)`);
  }
  // Stats: recovers after reconnect (online event) …
  await open(p, '/stats'); await p.waitForSelector('[data-testid=stats]');
  await net(true); await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  const spa = (to) => p.evaluate((t) => { history.pushState({}, '', t); dispatchEvent(new PopStateEvent('popstate')); }, to);
  await spa('/notes'); await sleep(400); await spa('/stats');
  await p.waitForSelector('[data-testid=stats-error]', { timeout: 5000 });
  await net(false); await sleep(2000);
  ok(!!(await p.$('[data-testid=stats]')) && !(await p.$('[data-testid=stats-error]')), '/stats: error clears and numbers load within 2s of reconnecting (no reload)');
  await cdp.detach();
  // … and when requests fail while the browser still says it's online ("Failed to fetch", no online event).
  let block = true;
  await p.setRequestInterception(true);
  const onReq = (r) => (block && r.url().includes('/api/stats') ? r.abort('failed') : r.continue());
  p.on('request', onReq);
  await open(p, '/stats'); await p.waitForSelector('[data-testid=stats-error]', { timeout: 8000 });
  ok(await p.evaluate(() => navigator.onLine), '/stats: request failed while navigator.onLine is true');
  block = false; await sleep(4500);
  ok(!!(await p.$('[data-testid=stats]')) && !(await p.$('[data-testid=stats-error]')), '/stats: retries on its own (backoff) and recovers without an online event or reload');
  block = true; await open(p, '/stats'); await p.waitForSelector('[data-testid=stats-error]', { timeout: 8000 });
  block = false; await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await sleep(800);
  ok(!!(await p.$('[data-testid=stats]')), '/stats: refetches when the window regains focus');
  p.off('request', onReq); await p.setRequestInterception(false);
  // A note that fails to load (not a 404) shows a retrying error, not a blank editable editor.
  const ln = (await api('POST', '/notes', { title: 'Loads later', content: 'body text' }, u.token)).data.note;
  await p.setRequestInterception(true);
  block = true;
  const onReq2 = (r) => (block && r.url().includes(`/api/notes/${ln._id}`) && r.method() === 'GET' ? r.abort('failed') : r.continue());
  p.on('request', onReq2);
  await open(p, `/notes/${ln._id}`); await p.waitForSelector('[data-testid=note-load-failed]', { timeout: 8000 });
  ok(!(await p.$('.cm-content')), 'note load failure: no editor shown while it can’t load');
  block = false; await sleep(4500);
  ok(!!(await p.$('.cm-content')) && (await p.$eval('.cm-content', (x) => x.innerText)).includes('body text'), 'note load failure: retries and opens the note');
  p.off('request', onReq2); await p.setRequestInterception(false);
  ok(p.errors.length === 0, `no page errors (${p.errors.join(' | ')})`);

  // B + 1. Landing (signed out): one CTA label everywhere; AA contrast in light and dark.
  const ctx = await b.createBrowserContext();
  const lp = await ctx.newPage(); await lp.setViewport({ width: 1440, height: 900 });
  for (const dark of [false, true]) {
    await lp.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
    await lp.goto(BASE + '/', { waitUntil: 'networkidle0' });
    if (!dark) {
      // Every sign-up link uses the shared label, except the sticky header's intentional compact one.
      const links = await lp.$$eval('a[href="/register"]', (xs) => xs.map((x) => ({ t: x.textContent.trim(), compact: x.dataset.cta === 'compact', header: !!x.closest('header, nav') })));
      const full = links.filter((l) => !l.compact).map((l) => l.t);
      const compact = links.filter((l) => l.compact);
      ok(full.length >= 4 && full.every((t) => t === 'Start writing — it’s free'), `landing: all non-header sign-up links read 'Start writing — it’s free' (${JSON.stringify(full)})`);
      ok(compact.length === 1 && compact[0].header && compact[0].t === 'Start writing', `landing: only the header uses the compact 'Start writing' (${JSON.stringify(compact)})`);
    }
    if (axePath) {
      await lp.addScriptTag({ path: axePath });
      const r = await lp.evaluate(async () => (await window.axe.run(document, { runOnly: ['color-contrast'] })).violations.flatMap((v) => v.nodes.map((n) => n.target.join(' '))));
      ok(r.length === 0, `landing ${dark ? 'dark' : 'light'}: no color-contrast violations (${r.slice(0, 4).join(' ; ')})`);
    }
  }
  await ctx.close();
} finally { await cleanup(); await b.close(); }
