// /changelog: public release notes page (guest + signed in), head tags, feeds, links in, layout.
import { launch, newUser, ok, cleanup, BASE, sleep, pageAs, noScroll, CSP_LOG } from './h.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { RELEASES } from '../client/src/data/changelog.js';

const shots = process.env.SHOTS || '/tmp/changelog-shots';
await import('node:fs').then((fs) => fs.mkdirSync(shots, { recursive: true }));
const browser = await launch();
try {
  // Guest, desktop, light
  const p = await browser.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(BASE + '/changelog', { waitUntil: 'networkidle0' });
  const head = await p.evaluate(() => ({
    title: document.title, desc: document.querySelector('meta[name=description]')?.content, robots: document.querySelector('meta[name=robots]')?.content,
    canonical: document.querySelector('link[rel=canonical]')?.href, h1: [...document.querySelectorAll('h1')].map((h) => h.textContent),
    h2: [...document.querySelectorAll('main h2')].map((h) => h.textContent), releases: [...document.querySelectorAll('main ol > li')].map((l) => l.id),
    times: [...document.querySelectorAll('main ol time')].map((t) => t.getAttribute('datetime')), path: location.pathname,
    nav: document.querySelector('header')?.textContent, footerLink: !!document.querySelector('footer a[href="/changelog"]'),
    alt: [...document.querySelectorAll('link[rel=alternate]')].map((l) => l.getAttribute('href')),
  }));
  ok(head.path === '/changelog', 'guest stays on /changelog');
  ok(head.title === 'Changelog · noted.', `title: ${head.title}`);
  ok(/release notes/.test(head.desc || ''), 'meta description');
  ok(head.robots === 'index, follow', 'indexable');
  ok(head.canonical === BASE + '/changelog', 'canonical');
  ok(head.h1.length === 1 && /What’s new in noted/.test(head.h1[0]), 'one h1');
  ok(head.releases.length === RELEASES.length && head.releases[0] === 'v1-8', `one entry per release, newest first (${head.releases.join(',')})`);
  ok(head.h2[0] === RELEASES[0].title && /simpler/i.test(head.h2[0]), 'latest is the simpler app');
  ok(JSON.stringify(head.times) === JSON.stringify(RELEASES.map((r) => r.date)), 'machine-readable dates');
  ok(/Log in/.test(head.nav), 'guest nav shows Log in');
  ok(head.footerLink, 'footer links to changelog');
  ok(head.alt.includes('/changelog.xml') && head.alt.includes('/changelog.json'), 'feed autodiscovery links');
  await p.screenshot({ path: `${shots}/desktop-light.png`, fullPage: false });

  // Feeds
  const xml = await p.evaluate(async () => { const r = await fetch('/changelog.xml'); return [r.status, await r.text()]; });
  ok(xml[0] === 200 && xml[1].includes('<rss') && xml[1].includes('Images in your notes'), 'RSS feed served');
  const json = await p.evaluate(async () => { const r = await fetch('/changelog.json'); return [r.status, await r.json()]; });
  ok(json[0] === 200 && json[1].items.length === RELEASES.length, 'JSON feed served');

  // Section links go back to the landing page
  ok(await p.$eval('header nav a', (a) => a.getAttribute('href')) === '/#features', 'nav section links point at /#…');

  // Landing footer → changelog (client-side)
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await p.$eval('footer a[href="/changelog"]', (a) => a.click());
  await p.waitForFunction(() => location.pathname === '/changelog' && document.querySelector('main ol > li'), { timeout: 5000 });
  ok(true, 'landing footer link opens changelog');
  ok(await p.evaluate(() => document.title) === 'Changelog · noted.', 'title updates on client navigation');

  // Deep link
  await p.goto(BASE + '/changelog#v1-3', { waitUntil: 'networkidle0' }); await sleep(400);
  const deep = await p.evaluate(() => { const r = document.getElementById('v1-3').getBoundingClientRect(); return { y: scrollY, top: r.top }; });
  ok(deep.y > 0 && deep.top < 200, `deep link scrolls to release (top ${Math.round(deep.top)})`);
  ok(p.errors.length === 0, `no page errors ${p.errors.join(' | ')}`);
  await p.close();

  // Mobile, dark
  const m = await browser.newPage(); m.errors = []; m.on('pageerror', (e) => m.errors.push(e.message));
  await m.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await m.goto(BASE + '/changelog', { waitUntil: 'networkidle0' });
  ok(await m.evaluate(() => document.documentElement.classList.contains('dark')), 'dark mode follows system');
  ok(await noScroll(m), 'no horizontal scroll at 375px');
  const bg = await m.evaluate(() => getComputedStyle(document.querySelector('.landing')).backgroundColor);
  ok(bg !== 'rgb(250, 250, 249)', `dark background (${bg})`);
  await m.screenshot({ path: `${shots}/mobile-dark.png` });
  await m.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')));
  await m.screenshot({ path: `${shots}/mobile-dark-full.png`, fullPage: true });
  ok(m.errors.length === 0, 'no page errors (mobile)');
  await m.close();

  // Signed in: page still public, nav offers the app, Help and Settings link here
  const { token, user } = await newUser('chg');
  const s = await pageAs(browser, token, user, { width: 1280, height: 900 });
  await s.goto(BASE + '/changelog', { waitUntil: 'networkidle0' });
  ok(await s.evaluate(() => location.pathname) === '/changelog', 'signed-in users can open the changelog');
  ok(await s.$('header a[href="/notes"]') !== null && !(await s.evaluate(() => /Log in/.test(document.querySelector('header').textContent))), 'signed-in nav shows Open notes');
  ok(await s.$('a[href^="/#"]') === null, 'no landing-section links for signed-in users (they would redirect to /notes)');
  await s.screenshot({ path: `${shots}/signed-in.png` });
  await s.goto(BASE + '/help', { waitUntil: 'networkidle0' });
  ok(await s.$('main a[href="/changelog"]') !== null, 'Help links to What’s new');
  await s.goto(BASE + '/settings', { waitUntil: 'networkidle0' });
  ok(await s.$('[data-testid="build-id"] a[href="/changelog"]') !== null, 'Settings build line links to What’s new');
  await s.close();

  const csp = existsSync(CSP_LOG) ? readFileSync(CSP_LOG, 'utf8').split('\n').filter((l) => l.startsWith('changelog.mjs')) : [];
  ok(csp.length === 0, `no CSP violations ${csp.join(' | ')}`);
} finally {
  await browser.close();
  await cleanup();
}
