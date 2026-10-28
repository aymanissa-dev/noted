import { launch, newUser, pageAs, api, ok, cleanup, BASE, noScroll, sleep } from './h.mjs';
const b = await launch();
try {
  const u = await newUser('layout');
  const f = (await api('POST', '/folders', { name: 'Work' }, u.token)).data.folder;
  await api('POST', '/notes', { title: 'Plan', content: 'ship it', tags: ['todo'], folderId: f._id }, u.token);
  const n = (await api('POST', '/notes', { title: 'Loose', content: 'free' }, u.token)).data.note;
  await api('GET', `/notes/${n._id}`, null, u.token);
  const p = await pageAs(b, u.token, u.user);
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  ok(await p.$('nav[aria-label="Sidebar"]'), 'sidebar on desktop');
  ok(await p.$eval('nav[aria-label="Sidebar"]', (e) => e.innerText.includes('Work') && !e.textContent.includes('Recently viewed') && !e.textContent.includes('Edited today')), 'sidebar is simple: folders, no smart lists or recent');
  await p.click('nav[aria-label="Sidebar"] button[aria-controls=sidebar-tags]'); await p.waitForSelector('#sidebar-tags');
  ok(await p.$eval('#sidebar-tags', (e) => e.innerText.includes('todo')), 'tags fold open from the sidebar');
  await p.click(`nav[aria-label="Sidebar"] a[href="/notes?folder=${f._id}"]`); await p.waitForFunction(() => !document.querySelector('main').innerText.includes('Loose'), { timeout: 8000 }).catch(() => {});
  ok(await p.$eval('main', (e) => e.innerText.includes('Plan') && !e.innerText.includes('Loose')), 'folder filter');
  ok(await p.$eval('main h1', (e) => e.textContent === 'Work'), 'folder heading');
  await p.screenshot({ path: '/tmp/layout-desk.png' });
  await p.goto(BASE + `/notes/${n._id}`, { waitUntil: 'networkidle0' });
  await p.evaluate(() => window.scrollTo(0, 400));
  ok(await p.$eval('[data-testid=editor-toolbar]', (e) => getComputedStyle(e).position === 'sticky'), 'sticky toolbar');
  const m = await pageAs(b, u.token, u.user, { width: 375, height: 812, mobile: true });
  await m.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  ok(await m.$eval('nav[aria-label="Primary"]', (e) => getComputedStyle(e).display !== 'none'), 'bottom nav on mobile');
  ok(!(await m.$eval('nav[aria-label="Sidebar"]', (e) => e.offsetParent)), 'no sidebar on mobile');
  ok(await noScroll(m), 'no horizontal scroll at 375');
  await m.screenshot({ path: '/tmp/layout-mob.png' });
  ok(![...p.errors, ...m.errors].length, 'no page errors ' + [...p.errors, ...m.errors].join('|'));
} finally { await cleanup(); await b.close(); }
