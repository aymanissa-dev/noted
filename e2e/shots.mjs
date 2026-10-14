// Screenshots of the main views + perceived speed numbers. PREFIX=before|after, SHOTS=dir.
import { launch, newUser, pageAs, api, cleanup, BASE, sleep } from './h.mjs';
const OUT = process.env.SHOTS || '/workspace', PRE = process.env.PREFIX || 'shot';
const b = await launch();
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
try {
  const u = await newUser('shots');
  const work = (await api('POST', '/folders', { name: 'Work' }, u.token)).data.folder;
  await api('POST', '/folders', { name: 'Personal' }, u.token);
  const seed = [
    ['Launch plan', '# Launch plan\n\n## Goals\n- [x] Ship v2\n- [ ] Write the ==release notes==\n\n## Timeline\nMonday: =={green}final QA==\nTuesday: deploy', ['work', 'launch'], work._id, '🚀', 'orange'],
    ['Reading list', '- Piranesi\n- The Overstory\n- **Kindred**', ['books'], null, '📚', ''],
    ['Groceries', 'oats, lemons, coffee beans', ['home'], null, '🛒', 'yellow'],
    ['Standup notes', 'Review PR #12, pair on search', ['work'], work._id, '', 'blue'],
    ['Ideas', 'A tiny app for *one* thing at a time', [], null, '💡', ''],
  ];
  let first; const ids = [];
  for (const [title, content, tags, folderId, emoji, color] of seed) {
    const n = (await api('POST', '/notes', { title, content, tags, folderId, emoji, color }, u.token)).data.note;
    first ||= n; ids.push(n._id); await sleep(30);
  }
  for (let i = 0; i < 15; i++) await api('POST', '/notes', { title: `Note ${i}`, content: 'Some text '.repeat(20) }, u.token);
  await api('PATCH', `/notes/${first._id}/pin`, null, u.token);
  // Flip onboarding off for the seeded account if the app supports it (so views are comparable).
  await api('PATCH', '/auth/preferences', { onboarded: true }, u.token);

  const p = await pageAs(b, u.token, u.user, { width: 1440, height: 900 });
  await p.evaluate(() => localStorage.setItem('noted.tipsDismissed', '1'));
  // ---- speed ----
  const card = '[data-flip-id]:not([data-flip-id^=optimistic]) h3';
  const listT = [], openT = [];
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); // first (cold) visit
  for (let i = 0; i < 4; i++) {
    const t0 = Date.now();
    await p.goto(BASE + '/notes', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector(card, { timeout: 20000 });
    listT.push(Date.now() - t0);
    await sleep(1500);
  }
  for (let i = 0; i < 4; i++) {
    await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
    await sleep(300);
    const id = ids[1 + (i % 4)];
    const sel = `[data-flip-id="${id}"] a`;
    await p.hover(sel); await sleep(150); // a person moves the pointer before clicking
    const t0 = Date.now();
    await p.click(sel);
    await p.waitForFunction(() => document.querySelector('.cm-content')?.innerText.trim().length > 3, { timeout: 20000 });
    openT.push(Date.now() - t0);
  }
  console.log('list done');console.log(`SPEED list(repeat) ms: ${listT.join(', ')} median ${med(listT)}`);
  console.log(`SPEED note open ms: ${openT.join(', ')} median ${med(openT)}`);
  // ---- screenshots ----
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(500);
  await p.screenshot({ path: `${OUT}/ux-${PRE}-desktop-list.png` });
  await p.goto(BASE + `/notes/${first._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content'); await sleep(700);
  await p.screenshot({ path: `${OUT}/ux-${PRE}-desktop-editor.png` });
  await p.goto(BASE + '/settings', { waitUntil: 'networkidle0' }); await sleep(600);
  await p.screenshot({ path: `${OUT}/ux-${PRE}-settings.png`, fullPage: true });
  const d = await pageAs(b, u.token, u.user, { dark: true });
  await d.evaluate(() => { localStorage.setItem('noted.theme', 'dark'); localStorage.setItem('noted.tipsDismissed', '1'); });
  await d.goto(BASE + `/notes/${first._id}`, { waitUntil: 'networkidle0' }); await d.waitForSelector('.cm-content'); await sleep(700);
  await d.screenshot({ path: `${OUT}/ux-${PRE}-dark.png` });
  const m = await pageAs(b, u.token, u.user, { width: 375, height: 812, mobile: true });
  await m.evaluate(() => localStorage.setItem('noted.tipsDismissed', '1'));
  await m.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(500);
  await m.screenshot({ path: `${OUT}/ux-${PRE}-mobile-list.png` });
  console.log('shots saved', OUT, PRE);
} finally { await cleanup(); await b.close(); }
