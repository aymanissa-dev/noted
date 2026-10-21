// v4 regressions for QA v3 bugs: typewriter centering, palette Enter, "/Heading 1", ":smile", quick capture focus, live sidebar tags.
import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep } from './h.mjs';
const b = await launch();
const content = async (u, id) => (await api('GET', `/notes/${id}`, null, u.token)).data.note.content;
const mod = async (p, key) => { await p.keyboard.down('Control'); await p.keyboard.press(key); await p.keyboard.up('Control'); };
try {
  const u = await newUser('v4');
  const p = await pageAs(b, u.token, u.user, { width: 1440, height: 900 });
  await p.evaluate(() => localStorage.setItem('noted.tourDone', '1'));

  // 1. Typewriter: in focus mode the caret line stays centered, even at the end of a long note.
  const long = Array.from({ length: 90 }, (_, i) => `Line ${i + 1} of a long note`).join('\n');
  const n = (await api('POST', '/notes', { title: 'Long', content: long }, u.token)).data.note;
  await p.goto(BASE + `/notes/${n._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
  await p.click('button[aria-label="Focus mode"]'); await sleep(300);
  await p.click('.cm-content'); await mod(p, 'End'); await p.keyboard.type(' end'); await sleep(400);
  const off = () => p.evaluate(() => { const r = document.querySelector('.cm-cursor')?.getBoundingClientRect() || document.querySelector('.cm-activeLine, .cm-line')?.getBoundingClientRect(); const s = getSelection(); const rr = s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : r; const y = (rr.top + rr.bottom) / 2; return Math.round(y - innerHeight / 2); });
  let d = await off(); ok(Math.abs(d) < 40, `typewriter: caret centered at end of note (off by ${d}px)`);
  for (let i = 0; i < 25; i++) await p.keyboard.press('ArrowUp');
  await sleep(400); d = await off(); ok(Math.abs(d) < 40, `typewriter: caret stays centered moving up (off by ${d}px)`);
  await p.keyboard.press('Escape'); await sleep(200);

  // 3. Slash "/Heading 1" with a space; 4. ":smile" + Enter inserts 😄.
  const e = (await api('POST', '/notes', { title: 'Slash', content: 'start' }, u.token)).data.note;
  await p.goto(BASE + `/notes/${e._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
  await p.click('.cm-content'); await mod(p, 'End'); await p.keyboard.press('Enter');
  await p.keyboard.type('/Heading 1'); await p.waitForSelector('.cm-tooltip-autocomplete', { timeout: 3000 }); await sleep(200);
  ok(await p.$eval('.cm-tooltip-autocomplete', (x) => x.innerText.trim().startsWith('Heading 1')), 'slash: "/Heading 1" shows Heading 1 first');
  await p.keyboard.press('Enter'); await p.keyboard.type('Big title');
  await p.keyboard.press('Enter'); await p.keyboard.type('hi :smile'); await p.waitForSelector('.cm-tooltip-autocomplete'); await sleep(200); await p.keyboard.press('Enter');
  await sleep(1600);
  const c = await content(u, e._id);
  ok(c.includes('\n# Big title') && !c.includes('/Heading'), 'slash: "/Heading 1" + Enter makes an H1');
  ok(c.includes('hi 😄'), `emoji: ":smile" + Enter inserts 😄 (${c.split('\n').pop()})`);

  // 2. Palette: Enter on Settings / Trash / How to use goes there, even right after typing.
  for (const [q, path] of [['settings', '/settings'], ['trash', '/trash'], ['how to use', '/help'], ['sett', '/settings']]) {
    await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(300);
    await mod(p, 'k'); await p.waitForSelector('[data-testid=palette]');
    await p.keyboard.type(q); await p.keyboard.press('Enter'); await sleep(500);
    ok(new URL(p.url()).pathname === path, `palette: "${q}" + Enter opens ${path} (got ${new URL(p.url()).pathname})`);
  }
  // …and after server results arrive.
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await mod(p, 'k'); await p.waitForSelector('[data-testid=palette]');
  await p.keyboard.type('settings'); await sleep(1200); await p.keyboard.press('Enter'); await sleep(400);
  ok(new URL(p.url()).pathname === '/settings', 'palette: "settings" + wait + Enter opens Settings');
  // A note title still wins when it's the better match.
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await mod(p, 'k'); await p.waitForSelector('[data-testid=palette]');
  await p.keyboard.type('long'); await sleep(900); await p.keyboard.press('Enter'); await sleep(400);
  ok(p.url().includes(n._id), 'palette: note title match still opens the note');

  // Design 6: replaying the tour from Help goes to the notes list and anchors step 1 to New note.
  await p.goto(BASE + '/help', { waitUntil: 'networkidle0' });
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Take the tour/.test(x.textContent))?.click());
  await p.waitForSelector('[data-testid=tour] [role=dialog]', { timeout: 5000 }); await sleep(300);
  const tour = await p.evaluate(() => { const d = document.querySelector('[data-testid=tour] [role=dialog]').getBoundingClientRect(); const t = [...document.querySelectorAll('[data-tour=new]')].find((e) => e.getClientRects().length)?.getBoundingClientRect(); return { path: location.pathname, near: !!t && Math.abs(d.top - t.bottom) < 40 }; });
  ok(tour.path === '/notes' && tour.near, `tour replay from Help opens on /notes anchored to New note (${JSON.stringify(tour)})`);
  await p.keyboard.press('Escape'); await sleep(200);

  // 5. Quick capture releases focus after saving, so Q works again; 6. sidebar tags update live.
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(400);
  await p.keyboard.press('q'); ok(await p.evaluate(() => document.activeElement?.id === 'quick-capture'), 'Q focuses quick capture');
  await p.keyboard.type('Captured idea #freshtag'); await p.keyboard.press('Enter'); await sleep(300);
  ok(await p.evaluate(() => document.activeElement?.id !== 'quick-capture'), 'quick capture blurs after saving');
  await p.keyboard.press('q'); await sleep(100);
  ok(await p.evaluate(() => document.activeElement?.id === 'quick-capture' && document.activeElement.value === ''), 'Q reopens quick capture without typing "q"');
  await p.keyboard.press('Escape');
  const sidebarHas = (t) => p.evaluate((t) => [...document.querySelectorAll('nav[aria-label=Sidebar] a')].some((a) => a.textContent.trim() === t), t);
  await p.waitForFunction(() => [...document.querySelectorAll('nav[aria-label=Sidebar] a')].some((a) => a.textContent.trim() === 'freshtag'), { timeout: 5000 }).catch(() => {});
  ok(await sidebarHas('freshtag'), 'sidebar shows a quick-capture tag without reload');
  // Tag added in the editor
  await p.goto(BASE + `/notes/${e._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('input[placeholder="Add tag…"]');
  await p.type('input[placeholder="Add tag…"]', 'editortag'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => [...document.querySelectorAll('nav[aria-label=Sidebar] a')].some((a) => a.textContent.trim() === 'editortag'), { timeout: 6000 }).catch(() => {});
  ok(await sidebarHas('editortag'), 'sidebar shows an editor-added tag without reload');
  // Removing the last use of a tag drops it.
  await p.click('button[aria-label="Remove editortag"]').catch(() => {});
  await p.waitForFunction(() => ![...document.querySelectorAll('nav[aria-label=Sidebar] a')].some((a) => a.textContent.trim() === 'editortag'), { timeout: 6000 }).catch(() => {});
  ok(!(await sidebarHas('editortag')), 'sidebar drops a removed tag without reload');
  ok(p.errors.length === 0, 'no page errors ' + p.errors.join(' | '));

  // 8. Password rules: common passwords get a clear, field-level message (client hint + server verdict).
  const ctx = await b.createBrowserContext(); const r = await ctx.newPage(); await r.setViewport({ width: 1280, height: 900 });
  await r.goto(BASE + '/register', { waitUntil: 'networkidle0' });
  await r.type('#reg-name', 'Pw Tester'); await r.type('#reg-email', `pw+${Date.now()}@noted.test`);
  await r.type('#reg-password', 'Password1!'); await r.click('button[type=submit]'); await sleep(300);
  ok(/too common/.test(await r.$eval('#reg-password-error', (e) => e.textContent).catch(() => '')), 'register: instant "too common" hint for Password1!');
  await r.$eval('#reg-password', (e) => e.select()); await r.type('#reg-password', 'charlie123'); await r.click('button[type=submit]');
  await r.waitForFunction(() => /too common/.test(document.querySelector('#reg-password-error')?.textContent || ''), { timeout: 8000 }).catch(() => {});
  ok(/too common/.test(await r.$eval('#reg-password-error', (e) => e.textContent).catch(() => '')) && r.url().includes('/register'), 'register: server rejects charlie123 with a field message');
  ok(await r.evaluate(() => document.activeElement?.id === 'reg-password'), 'register: focus moves to the password field');
  await ctx.close();
} finally { await cleanup(); await b.close(); }
