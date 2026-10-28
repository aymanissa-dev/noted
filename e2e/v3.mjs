// v3: command palette, shortcuts (reference + behaviour), platform labels, Help, simple chrome, landing page.
import { launch, newUser, pageAs, api, ok, cleanup, created, BASE, noScroll, sleep } from './h.mjs';
const b = await launch();
const ctrl = async (p, key, shift = false) => { await p.keyboard.down('Control'); if (shift) await p.keyboard.down('Shift'); await p.keyboard.press(key); if (shift) await p.keyboard.up('Shift'); await p.keyboard.up('Control'); };
const path = (p) => p.evaluate(() => location.pathname);
const waitPath = (p, re) => p.waitForFunction((r) => new RegExp(r).test(location.pathname + location.search), { timeout: 8000 }, re.source).then(() => true, () => false);
try {
  // ---------- Landing ----------
  {
    const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport({ width: 1440, height: 900 });
    await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
    ok((await p.$eval('h1', (e) => e.textContent)).replace(/\s+/g, ' ').includes('Write it down.Find it later.') || (await p.$eval('h1', (e) => e.innerText)).includes('Find it later'), 'landing: tagline headline');
    const ids = await p.$$eval('main [id]', (s) => s.map((x) => x.id));
    ok(['features', 'privacy', 'faq'].every((i) => ids.includes(i)), 'landing: features, privacy, FAQ sections ' + ids.join(','));
    ok(await p.$$eval('#features article', (a) => a.length === 3), 'landing: three feature beats (write, find, private)');
    ok(await p.$$eval('a[href="/login"]', (a) => a.length >= 1) && await p.$('a[href="/changelog"]'), 'landing: links to log in and the changelog');
    ok(await p.$('a[href="https://github.com/aymanissa-dev/noted"]'), 'landing: GitHub link in footer');
    ok(await p.$$eval('a[href="/register"]', (a) => a.length >= 3), 'landing: CTAs to sign up');
    const meta = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], meta[name=description]')].map((m) => [m.getAttribute('property') || m.name, m.content])));
    ok(meta['og:image']?.endsWith('/og.png') && meta['og:image:width'] === '1200' && meta['twitter:card'] === 'summary_large_image' && meta.description, 'landing: OG/Twitter meta');
    const og = await p.evaluate(async () => { const r = await fetch('/og.png'); const buf = new DataView(await r.arrayBuffer()); return { status: r.status, type: r.headers.get('content-type'), w: buf.getUint32(16), h: buf.getUint32(20) }; });
    ok(og.status === 200 && og.type.includes('png') && og.w === 1200 && og.h === 630, `landing: og.png is a 1200x630 PNG ${JSON.stringify(og)}`);
    ok(await p.evaluate(() => getComputedStyle(document.body).fontFamily.includes('Geist') || getComputedStyle(document.querySelector('h1')).fontFamily.includes('Geist')), 'landing: Geist font');
    await p.click('#faq summary'); await sleep(200);
    ok(await p.$eval('#faq details', (d) => d.open), 'landing: FAQ expands');
    ok(await p.$eval('.mock-type', (e) => getComputedStyle(e).animationName !== 'none'), 'landing: hero demo animates');
    ok(await p.$eval('.cta-lift', (e) => getComputedStyle(e).transitionDuration !== '0s'), 'landing: CTAs have a hover transition');
    ok(errs.length === 0, 'landing: no page errors ' + errs.join('|'));
    const m = await b.newPage(); await m.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await m.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'dark' }]);
    await m.goto(BASE + '/', { waitUntil: 'networkidle0' });
    ok(await noScroll(m), 'landing: no horizontal scroll at 375');
    ok(await m.$$eval('.reveal', (els) => els.every((e) => getComputedStyle(e).opacity === '1')), 'landing: reduced motion shows everything');
    ok(await m.$$eval('.mock-type, .hero-orb, .mock-note', (els) => els.every((e) => ['none', ''].includes(getComputedStyle(e).animationName) || parseFloat(getComputedStyle(e).animationDuration) < 0.001)), 'landing: reduced motion stops the demo');
    ok(await m.evaluate(() => document.documentElement.classList.contains('dark')), 'landing: dark mode follows system');
    await m.close(); await p.close();
  }

  // ---------- App ----------
  const u = await newUser('v3');
  const note = (await api('POST', '/notes', { title: 'Zebra crossing plan', content: 'stripes' }, u.token)).data.note;
  await api('POST', '/notes', { title: 'Other', content: 'x' }, u.token);
  const p = await pageAs(b, u.token, u.user); p.on('dialog', (d) => d.accept()); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' });

  // Command palette
  await ctrl(p, 'k');
  ok(await p.waitForSelector('[data-testid=palette]', { timeout: 3000 }).then(() => true, () => false), 'palette: Ctrl+K opens');
  ok(await p.$$eval('[data-testid=palette] [role=option] kbd', (k) => k.length > 5), 'palette: commands show their shortcuts');
  await p.keyboard.type('zebra'); await sleep(700);
  ok(await p.$eval('[data-testid=palette] [aria-selected=true]', (e) => e.textContent.includes('Zebra crossing plan')), 'palette: searches notes');
  await p.keyboard.press('Enter');
  ok(await waitPath(p, new RegExp(`/notes/${note._id}`)), 'palette: Enter opens the note');
  await p.waitForSelector('.cm-content');
  await ctrl(p, 'k'); await p.waitForSelector('[data-testid=palette]');
  ok(true, 'palette: Ctrl+K works inside the editor');
  await p.keyboard.type('settings'); await sleep(200); await p.keyboard.press('Enter');
  ok(await waitPath(p, /^\/settings/), 'palette: runs "Settings" command');
  await ctrl(p, 'k'); await p.waitForSelector('[data-testid=palette]');
  await p.keyboard.press('Escape'); await sleep(150);
  ok(!(await p.$('[data-testid=palette]')), 'palette: Esc closes');
  ok(!(await p.$('[data-testid=palette-button]')) && !(await p.$('header [aria-label*="theme" i]')), 'header: simple (no palette button, no theme toggle)');

  // Shortcuts reference
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  await p.keyboard.press('?'); await p.waitForSelector('[role=dialog]');
  const groups = await p.$$eval('[role=dialog] [data-testid^=shortcut-group-] h3', (h) => h.map((x) => x.textContent));
  ok(JSON.stringify(groups) === JSON.stringify(['Navigation', 'Notes', 'Editor', 'Formatting', 'Search', 'App']), '? opens grouped shortcuts: ' + groups.join(', '));
  const nShort = await p.$$eval('[role=dialog] li', (l) => l.length);
  ok(nShort >= 15 && nShort <= 30, 'shortcuts: just the essentials (' + nShort + ')');
  await p.type('[aria-label="Filter shortcuts"]', 'bold');
  ok(await p.$$eval('[role=dialog] li', (l) => l.length === 1 && l[0].textContent.includes('Bold')), 'shortcuts: filter');
  await p.keyboard.press('Escape'); await sleep(150);
  // G-sequences
  for (const [k, re] of [['a', /^\/archive/], ['t', /^\/trash/], ['s', /^\/settings/], ['h', /^\/help/], ['n', /^\/notes$/]]) {
    await p.keyboard.press('g'); await p.keyboard.press(k);
    ok(await waitPath(p, re), `G then ${k.toUpperCase()} → ${re.source}`);
  }
  await p.keyboard.press('n'); ok(await waitPath(p, /^\/notes\/new/), 'N → new note');
  // Formatting shortcuts in the editor
  await p.goto(BASE + `/notes/${note._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
  await p.click('.cm-content'); await ctrl(p, 'End');
  await p.keyboard.press('Enter'); await p.keyboard.type('word');
  await p.keyboard.down('Shift'); for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowLeft'); await p.keyboard.up('Shift');
  await ctrl(p, 'b'); await sleep(100);
  ok((await p.$eval('.cm-content', (e) => e.innerText)).includes('**word**'), 'Ctrl+B bolds the selection');
  await ctrl(p, 'i'); await sleep(100);
  ok((await p.$eval('.cm-content', (e) => e.innerText)).includes('***word***'), 'Ctrl+I italicizes');
  await ctrl(p, 'Enter'); await sleep(100);
  ok(await p.$eval('.cm-content', (e) => /- \[ \] \*\*\*word|☐|cm-task/.test(e.innerHTML)), 'Ctrl+Enter makes a checklist item');

  await sleep(2000);
  // Help page reachable from account menu, sidebar, palette
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  await p.click('[data-testid=account-menu]'); await p.waitForSelector('[role=menu] a[href="/help"]');
  ok(await p.$eval('[role=menu]', (m) => m.innerText.includes('Help') && m.innerText.includes('Theme') && !m.innerText.includes('Storage stats')), 'help + theme in account menu');
  await p.click('[role=menu] a[href="/help"]'); ok(await waitPath(p, /^\/help/), 'help: account menu → /help');
  await p.waitForSelector('[data-testid=help-page]');
  ok(await p.$$eval('[data-testid=help-page] [data-testid^=shortcut-group-]', (g) => g.length === 6), 'help: full shortcut reference on the page');
  ok(await p.$eval('[data-testid=help-page]', (e) => e.innerText.includes('···') && !e.innerText.includes('tour')), 'help: explains the ··· menu, no tour');

  // Platform-aware labels
  const mac = await b.newPage();
  await mac.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
  await mac.setViewport({ width: 1440, height: 900 });
  await mac.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await mac.evaluate((t, us) => { localStorage.setItem('noted.token', t); localStorage.setItem('noted.user', JSON.stringify(us)); }, u.token, u.user);
  await mac.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  const kLabel = async (pg) => { await pg.keyboard.press('?'); await pg.waitForSelector('[role=dialog]'); const t = await pg.$$eval('[role=dialog] li', (l) => l.find((x) => x.textContent.includes('Search everything'))?.innerText || ''); await pg.keyboard.press('Escape'); await sleep(150); return t; };
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  ok((await kLabel(mac)).includes('⌘'), 'labels: ⌘ on Mac');
  ok((await kLabel(p)).includes('Ctrl'), 'labels: Ctrl elsewhere');
  await mac.close();

  // Mobile help
  const m = await pageAs(b, u.token, u.user, { width: 375, height: 812, mobile: true });
  await m.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  await m.click('[data-testid=mobile-menu]'); await m.waitForSelector('[role=menu] a[href="/help"]');
  await m.click('[role=menu] a[href="/help"]'); await m.waitForSelector('[data-testid=help-page]');
  await m.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.includes('Touch')).click());
  ok(await m.$('[data-testid=touch-help]'), 'help: touch version on mobile');
  ok(await noScroll(m), 'help: no horizontal scroll at 375');
  ok(errs.length === 0, 'app: no page errors ' + errs.join('|'));
} finally { await b.close(); await cleanup(); }
