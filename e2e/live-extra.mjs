import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep, noScroll } from './h.mjs';
const b = await launch();
try {
  const u = await newUser('live');
  // seed a realistic notebook
  const work = (await api('POST', '/folders', { name: 'Work' }, u.token)).data.folder;
  await api('POST', '/folders', { name: 'Personal' }, u.token);
  const seed = [
    ['Launch plan', '# Launch plan\n\n## Goals\n- [x] Ship v2\n- [ ] Write the ==release notes==\n\n## Timeline\nMonday: =={green}final QA==\nTuesday: deploy', ['work', 'launch'], work._id, '🚀', 'orange'],
    ['Reading list', '- Piranesi\n- The Overstory\n- **Kindred**', ['books'], null, '📚', ''],
    ['Groceries', 'oats, lemons, coffee beans', ['home'], null, '🛒', 'yellow'],
    ['Standup notes', 'Review PR #12, pair on search', ['work'], work._id, '', 'blue'],
    ['Ideas', 'A tiny app for *one* thing at a time', [], null, '💡', ''],
  ];
  let first;
  for (const [title, content, tags, folderId, emoji, color] of seed) {
    const n = (await api('POST', '/notes', { title, content, tags, folderId, emoji, color }, u.token)).data.note;
    first ||= n; await sleep(30);
  }
  await api('PATCH', `/notes/${first._id}/pin`, null, u.token);
  await api('GET', `/notes/${first._id}`, null, u.token);

  const p = await pageAs(b, u.token, u.user);
  // accent color picker persists server-side
  await p.goto(BASE + '/settings', { waitUntil: 'networkidle0' });
  await p.click('[role=radiogroup] button[aria-label=Violet]'); await sleep(1200);
  const me = (await api('GET', '/auth/me', null, u.token)).data.user;
  ok(me.preferences.accent === 'violet', 'accent saved to account');
  ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '139 92 246'), 'accent applied (CSS variable)');
  // login activity listed
  await p.waitForSelector('[data-testid=activity] li');
  ok(await p.$eval('[data-testid=activity]', (e) => / on /.test(e.innerText) && /\d+\.\d+\.x\.x|…/.test(e.innerText)), 'login activity listed (browser on OS, masked IP)');
  const act = (await api('GET', '/auth/activity', null, u.token)).data.events[0];
  ok(act && act.ip && !/^\d+\.\d+\.\d+\.\d+$/.test(act.ip), `activity row: ${act.browser} on ${act.os}, ip ${act.ip}, location "${act.location}"`);
  // real browser login → dashboard, and it shows up as "This device" in login activity
  const bc = await b.createBrowserContext(); const lp = await bc.newPage(); await lp.setViewport({ width: 1280, height: 860 });
  await lp.goto(BASE + '/login', { waitUntil: 'networkidle0' });
  await lp.type('input[type=email]', u.email); await lp.type('input[type=password]', 'password123');
  await Promise.all([lp.waitForFunction(() => location.pathname === '/notes', { timeout: 15000 }), lp.click('form button.btn-primary')]);
  ok(true, 'browser login lands on /notes');
  await lp.goto(BASE + '/settings', { waitUntil: 'networkidle0' }); await lp.waitForSelector('[data-testid=activity] li');
  const top = await lp.$eval('[data-testid=activity] li', (e) => e.innerText.replace(/\s+/g, ' '));
  ok(/This device/.test(top) && /Chrome \d+ on Linux/.test(top), 'activity: ' + top);
  await bc.close();
  // stats page
  await p.goto(BASE + '/stats', { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-testid=stats]');
  ok(await p.$eval('[data-testid=stats]', (e) => e.innerText.includes('Notes') && e.innerText.includes('5') && e.innerText.includes('Folders')), 'stats page');
  // screenshots: desktop list, desktop editor (split), dark, mobile
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(400);
  await p.screenshot({ path: (process.env.SHOTS || '/workspace') + '/v2-desktop-list.png' });
  await p.goto(BASE + `/notes/${first._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content'); await sleep(600);
  await p.screenshot({ path: (process.env.SHOTS || '/workspace') + '/v2-desktop-editor.png' });
  const d = await pageAs(b, u.token, u.user, { dark: true });
  await d.evaluate(() => localStorage.setItem('noted.theme', 'dark'));
  await d.goto(BASE + `/notes/${first._id}`, { waitUntil: 'networkidle0' }); await d.waitForSelector('.cm-content'); await sleep(600);
  ok(await d.evaluate(() => document.documentElement.classList.contains('dark')), 'dark mode');
  await d.screenshot({ path: (process.env.SHOTS || '/workspace') + '/v2-dark.png' });
  const m = await pageAs(b, u.token, u.user, { width: 375, height: 812, mobile: true });
  for (const path of ['/notes', `/notes/${first._id}`, '/settings', '/stats', '/archive']) {
    await m.goto(BASE + path, { waitUntil: 'networkidle0' }); await sleep(300);
    ok(await noScroll(m), `no horizontal scroll at 375px: ${path === `/notes/${first._id}` ? '/notes/:id' : path}`);
  }
  await m.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(400);
  await m.screenshot({ path: (process.env.SHOTS || '/workspace') + '/v2-mobile.png' });
  const lc = await b.createBrowserContext(); const l = await lc.newPage(); await l.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  await l.goto(BASE + '/', { waitUntil: 'networkidle0' }); ok(await noScroll(l), 'no horizontal scroll at 375px: landing');
  const errs = [...p.errors, ...d.errors, ...m.errors];
  ok(!errs.length, 'no page errors ' + errs.join('|'));
} finally { await cleanup(); await b.close(); }
