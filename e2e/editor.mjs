import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep, noteAction } from './h.mjs';
const b = await launch();
const content = async (u, id) => (await api('GET', `/notes/${id}`, null, u.token)).data.note.content;
try {
  const u = await newUser('editor');
  const legacy = 'Plain old note\nwith two lines';
  const n = (await api('POST', '/notes', { title: 'Doc', content: legacy }, u.token)).data.note;
  const p = await pageAs(b, u.token, u.user);
  await p.goto(BASE + `/notes/${n._id}`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.cm-content');
  ok(await p.$eval('.cm-content', (e) => e.innerText.includes('Plain old note')), 'legacy plain text renders');
  const cm = async (fn, ...a) => p.evaluate(fn, ...a);
  // go to end and use slash commands
  await p.click('.cm-content'); await p.keyboard.down('Control'); await p.keyboard.press('End'); await p.keyboard.up('Control');
  await p.keyboard.press('Enter'); await p.keyboard.type('/h2');
  await p.waitForSelector('.cm-tooltip-autocomplete', { timeout: 3000 });
  ok(await p.$eval('.cm-tooltip-autocomplete', (e) => e.innerText.includes('Heading 2')), 'slash menu opens'); await sleep(200);
  await p.keyboard.press('Enter'); await p.keyboard.type('Section A');
  await p.keyboard.press('Enter'); await p.keyboard.type('/check'); await p.waitForSelector('.cm-tooltip-autocomplete'); await sleep(200); await p.keyboard.press('Enter');
  await p.keyboard.type('buy milk');
  await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); await p.keyboard.type('/divider'); await p.waitForSelector('.cm-tooltip-autocomplete'); await sleep(200); await p.keyboard.press('Enter');
  await p.keyboard.type('/date'); await p.waitForSelector('.cm-tooltip-autocomplete'); await sleep(200); await p.keyboard.press('Enter');
  await p.keyboard.press('Enter'); await p.keyboard.type('# Part B'); await p.keyboard.press('Enter'); await p.keyboard.type('hello world :rocke');
  await p.waitForSelector('.cm-tooltip-autocomplete'); await sleep(200); await p.keyboard.press('Enter');
  await sleep(1500);
  let c = await content(u, n._id);
  ok(c.includes('## Section A') && c.includes('- [ ] buy milk') && /\n---\n/.test(c) && c.includes('# Part B') && c.includes('🚀'), 'slash: h2, checklist, divider, date; inline emoji; autosaved');
  ok(c.includes(String(new Date().getFullYear())), 'date inserted');
  // checkbox toggle
  await p.click('input.cm-task'); await sleep(1300);
  ok((await content(u, n._id)).includes('- [x] buy milk'), 'checkbox toggles');
  // highlight: select "world" via search positions
  const selectWord = (w) => p.evaluate((w) => {
    const walker = document.createTreeWalker(document.querySelector('.cm-content'), NodeFilter.SHOW_TEXT);
    let node; while ((node = walker.nextNode())) { const i = node.data.indexOf(w); if (i >= 0) { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + w.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; } }
    return false;
  }, w);
  await p.focus('.cm-content'); ok(await selectWord('world'), 'select text');
  await p.waitForSelector('.cm-hl-bar', { timeout: 3000 });
  ok(true, 'highlight bar appears on selection');
  await p.evaluate(() => document.querySelector('.cm-hl-bar [data-color=green]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  await sleep(1300);
  ok((await content(u, n._id)).includes('=={green}world=='), 'highlight persisted as =={green}text==');
  ok(await p.$('.cm-hl-green'), 'highlight rendered');
  // outline
  await noteAction(p, 'button[aria-label=Outline]'); await p.waitForSelector('[data-testid=outline]');
  const items = await p.$$eval('[data-testid=outline] button', (bs) => bs.map((x) => x.textContent));
  ok(items.join('|') === 'Section A|Part B', 'outline lists headings ' + items.join('|'));
  await p.evaluate(() => [...document.querySelectorAll('[data-testid=outline] button')].find((x) => x.textContent === 'Section A').click());
  await sleep(100); await p.keyboard.type(' ✓'); await sleep(1300);
  ok((await content(u, n._id)).includes('## Section A ✓'), 'outline jumps to heading (cursor at heading end)');
  // fold
  const folds = await p.$$('.cm-foldGutter .cm-gutterElement span[title="Fold section"]');
  ok(folds.length >= 2, 'fold markers on headings');
  await folds[0].click(); await sleep(200);
  ok(await p.$('.cm-foldPlaceholder'), 'section folds');
  await p.click('.cm-foldPlaceholder'); await sleep(200);
  ok(!(await p.$('.cm-foldPlaceholder')), 'section unfolds');
  // find & replace
  await noteAction(p, 'button[aria-label^="Find and replace"]'); await p.waitForSelector('.cm-search');
  await p.type('.cm-search input[name=search]', 'milk');
  await p.type('.cm-search input[name=replace]', 'oat milk');
  await p.click('.cm-search button[name=replaceAll]'); await sleep(1300);
  ok((await content(u, n._id)).includes('buy oat milk'), 'find & replace all');
  await p.keyboard.press('Escape');
  // undo across sessions: reload page then Ctrl+Z
  const before = await content(u, n._id);
  await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content'); await sleep(800);
  await p.click('.cm-content'); await p.keyboard.down('Control'); await p.keyboard.press('z'); await p.keyboard.up('Control'); await sleep(1500);
  const after = await content(u, n._id);
  ok(before.includes('oat milk') && !after.includes('oat milk') && after.includes('buy milk'), 'undo history survives reload (IndexedDB)');
  // focus mode
  await noteAction(p, 'button[aria-label="Focus mode"]'); await sleep(200);
  ok(await p.$eval('[data-testid=editor-card]', (e) => getComputedStyle(e).position === 'fixed'), 'focus mode full-screen');
  await p.click('.cm-content'); await p.keyboard.press('Escape'); await sleep(200);
  ok(await p.$eval('[data-testid=editor-card]', (e) => getComputedStyle(e).position !== 'fixed'), 'Esc leaves focus mode');
  ok(p.url().includes(n._id), 'still on the note after Esc');
  // print stylesheet
  await p.emulateMediaType('print');
  ok(await p.$eval('.print-area', (e) => getComputedStyle(e).display === 'block' && e.innerHTML.includes('<h2>Section A')), 'print area renders markdown');
  ok(await p.$eval('header', (e) => getComputedStyle(e).visibility === 'hidden'), 'app chrome hidden in print');
  await p.emulateMediaType('screen');
  // search matches plain text
  const s = (await api('GET', '/notes?search=' + encodeURIComponent('hello world'), null, u.token)).data.notes;
  ok(s.length === 1, 'search matches plain text across highlight markup');
  // emoji picker search
  await noteAction(p, 'button[aria-label="Color and emoji"]'); await p.waitForSelector('input[aria-label="Search emoji"]'); await p.type('input[aria-label="Search emoji"]', 'pizza'); await sleep(100);
  const em = await p.$$eval('button[aria-label^="Emoji "]', (bs) => bs.map((x) => x.textContent));
  ok(em.length === 1 && em[0] === '🍕', 'emoji picker search by name');
  ok(!p.errors.length, 'no page errors ' + p.errors.join('|'));
  await p.screenshot({ path: '/tmp/editor.png' });
} finally { await cleanup(); await b.close(); }
