// share: public read-only links. Owner creates a link from the note menu, copies it, sees it in
// Settings; a signed-out visitor reads it (escaped Markdown, no XSS, only that note's images via the
// share endpoint, noindex, no referrer); regenerate kills the old link; stop sharing → 404 page.
// Also: the new logo (favicons, manifest, dark mode) and the not-found page. Runs against prod with BASE/API.
import { launch, newUser, api, ok, cleanup, BASE, API, sleep, pageAs, noScroll } from './h.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const FIX = fileURLToPath(new URL('./fixtures/', import.meta.url));
const shots = '/workspace/screenshots/share'; mkdirSync(shots, { recursive: true });
const b = await launch();
const upload = async (noteId, token) => (await (await fetch(`${API}/notes/${noteId}/images`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' }, body: readFileSync(FIX + 'gps-photo.jpg') })).json()).image;
const openShare = async (p) => {
  await p.click('[data-testid=note-more]'); await p.waitForSelector('[role=menu] [aria-label="Share"]');
  await p.click('[role=menu] [aria-label="Share"]'); await p.waitForSelector('[data-testid=share-dialog]');
};
const clickText = async (p, sel, text) => {
  const h = await p.waitForFunction((sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === text && !e.disabled), { timeout: 8000 }, sel, text).catch(() => null);
  if (!h) return false; await h.asElement().click(); return true;
};
try {
  const A = await newUser('share'); const B = await newUser('share');
  // B's image: must never show through A's share, even if A's note references its id.
  const bn = (await api('POST', '/notes', { title: 'B private', content: 'secret' }, B.token)).data.note;
  const bImg = await upload(bn._id, B.token);
  const n = (await api('POST', '/notes', { title: 'Trip <b>plan</b>', emoji: '🧭', content: 'x' }, A.token)).data.note;
  const img = await upload(n._id, A.token);
  const content = [
    '## Packing', '- [x] Passport', '- [ ] **Boots**', '',
    'Map: [route](https://example.com/route)', '',
    '<script>window.__xss=1</script>', '<img src=x onerror="window.__xss=2">', '[bad](javascript:window.__xss=3)', '',
    `![the view](noted-image:${img._id})`, '', `![not mine](noted-image:${bImg._id})`,
  ].join('\n');
  ok((await api('PATCH', `/notes/${n._id}`, { content }, A.token)).status === 200, 'note with image + XSS payloads saved');

  // Owner: create + copy from the note menu
  await b.defaultBrowserContext().overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  const p = await pageAs(b, A.token, A.user);
  await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
  await openShare(p);
  ok(await clickText(p, '[data-testid=share-dialog] button', 'Create link'), 'Create link button');
  await p.waitForSelector('[data-testid=share-url]');
  const url1 = await p.$eval('[data-testid=share-url]', (i) => i.value);
  ok(new RegExp(`^${BASE}/s/[A-Za-z0-9_-]{43}$`).test(url1), `link format ${url1.replace(/[A-Za-z0-9_-]{43}$/, '<token>')}`);
  ok(await p.evaluate(() => navigator.clipboard.readText()) === url1, 'create copies the link');
  await p.evaluate(() => navigator.clipboard.writeText('')); await p.click('[data-testid=share-copy]'); await sleep(200);
  ok(await p.evaluate(() => navigator.clipboard.readText()) === url1 && /Copied/.test(await p.$eval('[data-testid=share-copy]', (e) => e.textContent)), 'Copy button copies + says Copied');
  await p.screenshot({ path: `${shots}/dialog.png` });
  ok(p.errors.length === 0, `owner: no page errors ${p.errors.join(' | ')}`);

  // Settings lists it
  await p.keyboard.press('Escape'); await sleep(200);
  await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-testid=shares]');
  ok(/Trip <b>plan<\/b>/.test(await p.$eval('[data-testid=shares]', (e) => e.textContent)), 'Settings → Shared links lists the note (title as text)');
  await (await p.$('#shared-links')).screenshot({ path: `${shots}/settings.png` });

  // B (other user) can't manage A's share
  ok((await api('GET', `/notes/${n._id}/share`, null, B.token)).status === 404 && (await api('DELETE', `/notes/${n._id}/share`, null, B.token)).status === 404, 'other user: 404 on manage');

  // Visitor: signed out, fresh context
  const ctx = await b.createBrowserContext();
  const v = await ctx.newPage(); v.errors = []; v.dialogs = 0;
  v.on('pageerror', (e) => v.errors.push(e.message)); v.on('dialog', (d) => { v.dialogs++; d.dismiss(); });
  const imgReqs = []; v.on('request', (r) => { if (r.resourceType() === 'image') imgReqs.push({ url: r.url(), auth: r.headers().authorization, ref: r.headers().referer }); });
  const nav = await v.goto(url1, { waitUntil: 'networkidle0' });
  ok(/noindex/.test(nav.headers()['x-robots-tag'] || '') || /localhost/.test(BASE), `page X-Robots-Tag (${nav.headers()['x-robots-tag'] || 'local preview'})`);
  await v.waitForSelector('[data-testid=shared-note]');
  await v.$eval('[data-testid=shared-body] img', (i) => i.scrollIntoView()).catch(() => {});
  await v.waitForFunction(() => document.querySelector('[data-testid=shared-body] img')?.naturalWidth > 0, { timeout: 8000 }).catch(() => {});
  const view = await v.evaluate(() => {
    const body = document.querySelector('[data-testid=shared-body]');
    const imgs = [...body.querySelectorAll('img')];
    return {
      h1: document.querySelector('h1').textContent, title: document.title,
      robots: document.querySelector('meta[name=robots]')?.content, referrer: document.querySelector('meta[name=referrer]')?.content,
      canonical: Boolean(document.querySelector('link[rel=canonical]')), xss: window.__xss, scripts: body.querySelectorAll('script').length,
      onerror: body.querySelectorAll('[onerror]').length, text: body.textContent,
      jsLinks: [...body.querySelectorAll('a')].filter((a) => /^javascript:/i.test(a.getAttribute('href'))).length,
      link: [...body.querySelectorAll('a')].map((a) => [a.href, a.rel, a.target])[0],
      imgs: imgs.map((i) => ({ src: i.getAttribute('src'), w: i.naturalWidth, done: i.complete })),
      missing: body.querySelector('.share-img-missing')?.textContent, task: body.querySelectorAll('li.task input[checked]').length,
      token: localStorage.getItem('noted.token'),
    };
  });
  ok(view.h1.includes('Trip <b>plan</b>') && view.title.startsWith('Trip <b>plan</b>'), 'title shown as text');
  ok(view.robots === 'noindex, nofollow, noarchive' && view.referrer === 'no-referrer' && !view.canonical, `noindex + no-referrer meta, no canonical (${view.robots})`);
  ok(view.xss === undefined && view.scripts === 0 && view.onerror === 0 && view.jsLinks === 0 && v.dialogs === 0, 'XSS payloads inert');
  ok(view.text.includes('<script>window.__xss=1</script>') && view.text.includes('onerror'), 'raw HTML shown as text');
  ok(view.link && view.link[0] === 'https://example.com/route' && /noopener/.test(view.link[1]) && /noreferrer/.test(view.link[1]) && /nofollow/.test(view.link[1]) && view.link[2] === '_blank', 'links: new tab, noopener noreferrer nofollow');
  ok(view.task === 1, 'task list renders');
  ok(view.imgs.length === 1 && view.imgs[0].src.includes(`/public/shares/`) && view.imgs[0].src.endsWith(img._id) && view.imgs[0].w > 0, `own image loads via share endpoint (${view.imgs[0]?.w}px)`);
  ok(view.missing === '[Image: not mine]' && !imgReqs.some((r) => r.url.includes(bImg._id)), 'other user’s image: not requested, placeholder');
  ok(imgReqs.every((r) => !r.auth && !r.ref), 'image requests carry no Authorization and no Referer');
  ok(!view.token, 'visitor has no session');
  const pub = await fetch(`${API}/public/shares/${url1.split('/s/')[1]}`);
  ok(/noindex/.test(pub.headers.get('x-robots-tag')) && pub.headers.get('referrer-policy') === 'no-referrer', 'API: X-Robots-Tag + no-referrer');
  const own = await fetch(`${API}/public/shares/${url1.split('/s/')[1]}/images/${img._id}`);
  ok(own.status === 200 && /image\//.test(own.headers.get('content-type')), `share endpoint serves the note’s image (${own.status} ${own.headers.get('content-type')})`);
  const direct = await fetch(`${API}/public/shares/${url1.split('/s/')[1]}/images/${bImg._id}`);
  ok(direct.status === 404, 'share endpoint refuses another note’s image');
  ok(await v.$eval('header svg[aria-label=Noted]', (s) => s.getBoundingClientRect().height > 15), 'logo in share header');
  await v.screenshot({ path: `${shots}/public-light.png`, fullPage: true });
  ok(v.errors.length === 0, `visitor: no page errors ${v.errors.join(' | ')}`);

  // Dark + mobile
  const vm = await ctx.newPage(); vm.errors = []; vm.on('pageerror', (e) => vm.errors.push(e.message));
  await vm.setViewport({ width: 375, height: 760, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await vm.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await vm.goto(url1, { waitUntil: 'networkidle0' }); await vm.waitForSelector('[data-testid=shared-note]');
  const logoColor = await vm.$eval('header svg[aria-label=Noted]', (s) => getComputedStyle(s).color);
  const lum = (logoColor.match(/\d+/g) || []).slice(0, 3).map(Number).reduce((a, c) => a + c, 0) / 3;
  ok(lum > 200, `dark mode: logo is light (${logoColor})`);
  ok(await noScroll(vm), '375px: no sideways scroll');
  await vm.screenshot({ path: `${shots}/public-dark-mobile.png`, fullPage: true });

  // Regenerate: old link dies, new one works
  await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
  await openShare(p); await p.waitForSelector('[data-testid=share-url]');
  ok(await clickText(p, '[data-testid=share-dialog] button', 'Regenerate link'), 'Regenerate asks first');
  ok(await clickText(p, '[data-testid=share-dialog] button', 'New link'), 'confirm new link');
  await p.waitForFunction((u) => document.querySelector('[data-testid=share-url]')?.value !== u, {}, url1);
  const url2 = await p.$eval('[data-testid=share-url]', (i) => i.value);
  ok(url2 !== url1, 'new link issued');
  await v.goto('about:blank'); await v.goto(url1, { waitUntil: 'domcontentloaded' }); await v.waitForSelector('[data-testid=not-found], [data-testid=shared-note]');
  ok(await v.$('[data-testid=not-found]') && /doesn’t work any more/.test(await v.$eval('h1', (e) => e.textContent)), 'old link → not-found page');
  await v.goto(url2, { waitUntil: 'domcontentloaded' }); ok(Boolean(await v.waitForSelector('[data-testid=shared-note]').catch(() => null)), 'new link works');

  // Stop sharing
  ok(await clickText(p, '[data-testid=share-dialog] button', 'Stop sharing'), 'Stop sharing asks first');
  ok(await clickText(p, '[data-testid=share-dialog] button', 'Stop sharing'), 'confirm stop');
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid=share-dialog] button')].some((x) => x.textContent.includes('Create link')));
  await v.goto('about:blank'); await v.goto(url2, { waitUntil: 'domcontentloaded' }); await v.waitForSelector('[data-testid=not-found], [data-testid=shared-note]');
  ok(Boolean(await v.$('[data-testid=not-found]')), 'revoked link → not-found page');
  await v.screenshot({ path: `${shots}/revoked.png` });
  ok((await fetch(`${API}/public/shares/${url2.split('/s/')[1]}`)).status === 404, 'revoked: API 404');
  await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-testid=shares-empty]');
  ok(true, 'Settings shows no shared links');

  // Unknown route → not-found page (signed out)
  await v.goto(`${BASE}/definitely/not/here`, { waitUntil: 'domcontentloaded' }); await v.waitForSelector('[data-testid=not-found]', { timeout: 8000 }).catch(() => {});
  ok(Boolean(await v.$('[data-testid=not-found]')) && new URL(v.url()).pathname === '/definitely/not/here', 'unknown path → Page not found');

  // Logo + icons
  await v.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await v.waitForSelector('header svg[aria-label=Noted]', { timeout: 8000 }).catch(() => {});
  const head = await v.evaluate(() => ({ icons: [...document.querySelectorAll('link[rel=icon]')].map((l) => l.getAttribute('href')), apple: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'), logo: Boolean(document.querySelector('header svg[aria-label=Noted]')) }));
  ok(head.icons.includes('/favicon.ico') && head.icons.includes('/favicon.svg') && head.apple, `favicon links (${head.icons})`);
  ok(head.logo, 'landing header logo');
  for (const [path, type] of [['/favicon.ico', /icon/], ['/favicon.svg', /svg/], ['/apple-touch-icon.png', /png/], ['/pwa-512x512.png', /png/], ['/maskable-512x512.png', /png/], ['/brand/noted-logo.svg', /svg/]]) {
    const r = await fetch(BASE + path); ok(r.status === 200 && type.test(r.headers.get('content-type') || ''), `${path} ${r.status} ${r.headers.get('content-type')}`);
  }
  const man = await (await fetch(BASE + '/manifest.webmanifest')).json();
  ok(man.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512') && man.icons.some((i) => i.sizes === '192x192'), 'manifest icons incl. maskable');
  ok(v.errors.length === 0, `visitor: no page errors ${v.errors.join(' | ')}`);
  await ctx.close();
} finally {
  await cleanup(); await b.close();
}
