// v3 screenshots: landing (desktop/mobile/dark) + app (list, editor, palette, help, mobile). OUT=dir PRE=prefix
import { launch, newUser, pageAs, api, cleanup, BASE, sleep } from './h.mjs';
const OUT = process.env.OUT || '/workspace', PRE = process.env.PRE || 'v3';
const b = await launch();
const errs = [];
const settle = async (p) => { await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); } window.scrollTo(0, 0); }); await sleep(1200); };
try {
  for (const [name, w, dark] of [['landing-desktop', 1440, false], ['landing-mobile', 375, false], ['landing-dark', 1440, true]]) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
    await p.setViewport({ width: w, height: w < 500 ? 812 : 900, isMobile: w < 500, hasTouch: w < 500, deviceScaleFactor: w < 500 ? 2 : 1 });
    await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
    await p.goto(BASE + '/', { waitUntil: 'networkidle0' }); await settle(p);
    await p.screenshot({ path: `${OUT}/${PRE}-${name}.png`, fullPage: true }); await p.close();
  }
  const u = await newUser('shots');
  const work = (await api('POST', '/folders', { name: 'Work' }, u.token)).data.folder;
  await api('POST', '/folders', { name: 'Personal' }, u.token);
  const seed = [
    ['Launch plan', '# Launch plan\n\n## Goals\n- [x] Ship v2\n- [ ] Write the ==release notes==\n\n## Timeline\nMonday: =={green}final QA==\nTuesday: deploy', ['work', 'launch'], work._id, '🚀', 'orange'],
    ['Reading list', '- Piranesi\n- The Overstory\n- **Kindred**', ['books'], null, '📚', ''],
    ['Groceries', 'oats, lemons, coffee beans', ['home'], null, '🛒', 'yellow'],
    ['Standup notes', 'Review PR #12, pair on search', ['work'], work._id, '', 'blue'],
    ['Ideas', 'A tiny app for *one* thing at a time', [], null, '💡', ''],
    ['Trip to Lamu', 'Ferry 9:30, pack the snorkel', ['travel'], null, '🌊', ''],
  ];
  let first;
  for (const [title, content, tags, folderId, emoji, color] of seed) { const n = (await api('POST', '/notes', { title, content, tags, folderId, emoji, color }, u.token)).data.note; first ||= n; await sleep(30); }
  await api('PATCH', `/notes/${first._id}/pin`, null, u.token);
  await api('GET', `/notes/${first._id}`, null, u.token);
  const p = await pageAs(b, u.token, u.user, { width: 1440, height: 900 }); p.on('pageerror', (e) => errs.push('app: ' + e.message));
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(600);
  await p.screenshot({ path: `${OUT}/${PRE}-app-list.png` });
  await p.goto(BASE + `/notes/${first._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content'); await sleep(700);
  await p.screenshot({ path: `${OUT}/${PRE}-app-editor.png` });
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(400);
  await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control');
  await p.waitForSelector('[data-testid=palette]'); await p.keyboard.type('l'); await sleep(700);
  await p.screenshot({ path: `${OUT}/${PRE}-palette.png` });
  await p.keyboard.press('Escape');
  await p.goto(BASE + '/help', { waitUntil: 'networkidle0' }); await sleep(500);
  await p.screenshot({ path: `${OUT}/${PRE}-help.png`, fullPage: true });
  await p.goto(BASE + '/settings', { waitUntil: 'networkidle0' }); await sleep(500);
  await p.screenshot({ path: `${OUT}/${PRE}-settings.png`, fullPage: true });
  const d = await pageAs(b, u.token, u.user, { dark: true });
  await d.evaluate(() => localStorage.setItem('noted.theme', 'dark'));
  await d.goto(BASE + `/notes/${first._id}`, { waitUntil: 'networkidle0' }); await d.waitForSelector('.cm-content'); await sleep(700);
  await d.screenshot({ path: `${OUT}/${PRE}-app-dark.png` });
  const m = await pageAs(b, u.token, u.user, { width: 375, height: 812, mobile: true }); await m.evaluate(() => localStorage.setItem('noted.theme', 'light'));
  await m.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(600);
  await m.screenshot({ path: `${OUT}/${PRE}-app-mobile.png` });
  await m.goto(BASE + '/help', { waitUntil: 'networkidle0' }); await sleep(500);
  await m.screenshot({ path: `${OUT}/${PRE}-help-mobile.png`, fullPage: true });
  await m.goto(BASE + '/login', { waitUntil: 'networkidle0' });
  console.log('errors:', errs.length, errs.join(' | '));
} finally { await cleanup(); await b.close(); }
