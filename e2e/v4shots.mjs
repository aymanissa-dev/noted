// v4 screenshots: landing + app (list, editor, archive empty, settings) at 1920 / 1280 / 375, light + dark. OUT=dir PRE=prefix
import { launch, newUser, pageAs, api, cleanup, BASE, sleep } from './h.mjs';
const OUT = process.env.OUT || '/workspace', PRE = process.env.PRE || 'v4';
const b = await launch();
const errs = [];
const settle = async (p) => { await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); } window.scrollTo(0, 0); }); await sleep(1200); };
try {
  const u = await newUser('shots');
  const work = (await api('POST', '/folders', { name: 'Work' }, u.token)).data.folder;
  await api('POST', '/folders', { name: 'Personal' }, u.token);
  const seed = [
    ['Launch plan', '# Launch plan\n\n## Goals\n- [x] Ship v2\n- [ ] Write the ==release notes==\n\n---\n\n## Timeline\nMonday: =={green}final QA==\nTuesday: deploy\n\nKeep the scope small and the notes short. Everything else can wait until after the launch, when we have real feedback from real people.', ['work', 'launch'], work._id, '🚀', 'orange'],
    ['Reading list', '- Piranesi\n- The Overstory\n- **Kindred**', ['books'], null, '📚', ''],
    ['Groceries', 'oats, lemons, coffee beans', ['home'], null, '🛒', 'yellow'],
    ['Standup notes', '---\n\nReview PR #12, pair on search', ['work'], work._id, '', 'blue'],
    ['Ideas', '/Heading 1\n## A tiny app\nfor *one* thing at a time', [], null, '💡', 'purple'],
    ['Trip to Lamu', 'Ferry 9:30, pack the snorkel', ['travel'], null, '🌊', 'green'],
    ['Book club', 'Next: **The Remains of the Day**. Bring snacks.', ['books'], null, '', ''],
  ];
  let first;
  for (const [title, content, tags, folderId, emoji, color] of seed) { const n = (await api('POST', '/notes', { title, content, tags, folderId, emoji, color }, u.token)).data.note; first ||= n; await sleep(30); }
  await api('PATCH', `/notes/${first._id}/pin`, null, u.token);
  const W = (process.env.WIDTHS || '1920,1280,375').split(',').map(Number); const TH = (process.env.THEMES || 'light,dark').split(',');
  for (const [w, h] of [[1920, 1080], [1280, 800], [375, 812]].filter(([w]) => W.includes(w))) {
    for (const dark of TH.map((t) => t === 'dark')) {
      const tag = `${w}-${dark ? 'dark' : 'light'}`; const mobile = w < 500;
      const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(tag + ': ' + e.message)); // signed out
      await p.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
      await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
      await p.goto(BASE + '/', { waitUntil: 'networkidle0' }); await settle(p);
      await p.screenshot({ path: `${OUT}/${PRE}-landing-${tag}.png`, fullPage: false }); await ctx.close();
      if (process.env.LANDING_ONLY) continue;
      const a = await pageAs(b, u.token, u.user, { width: w, height: h, mobile, dark }); a.on('pageerror', (e) => errs.push(tag + ' app: ' + e.message));
      await a.evaluate((d) => { localStorage.setItem('noted.theme', d ? 'dark' : 'light'); localStorage.setItem('noted.tourDone', '1'); }, dark);
      await a.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(700);
      await a.screenshot({ path: `${OUT}/${PRE}-list-${tag}.png` });
      await a.goto(BASE + `/notes/${first._id}`, { waitUntil: 'networkidle0' }); await a.waitForSelector('.cm-content'); await sleep(800);
      await a.screenshot({ path: `${OUT}/${PRE}-editor-${tag}.png` });
      await a.goto(BASE + '/archive', { waitUntil: 'networkidle0' }); await sleep(600);
      await a.screenshot({ path: `${OUT}/${PRE}-empty-${tag}.png` });
      if (mobile) { await a.goto(BASE + '/settings', { waitUntil: 'networkidle0' }); await sleep(600); await a.screenshot({ path: `${OUT}/${PRE}-settings-${tag}.png`, fullPage: true }); }
      await a.close();
    }
  }
  console.log('errors:', errs.length, errs.join(' | '));
} finally { await cleanup(); await b.close(); }
