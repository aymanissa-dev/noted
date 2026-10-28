import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep } from './h.mjs';
const b = await launch();
try {
  const u = await newUser('merge');
  for (const [t, c, tags] of [['One', 'first', ['a']], ['Two', 'second', ['b']], ['Three', 'third', []]]) { await api('POST', '/notes', { title: t, content: c, tags }, u.token); await sleep(20); }
  const p = await pageAs(b, u.token, u.user, { width: 1100 });
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  const btn = async (text) => { for (const h of await p.$$('xpath/.//button[normalize-space(.)="' + text + '"]')) if (await h.isVisible()) return h; };
  await p.click('[data-testid=list-more]'); await p.waitForSelector('[role=menu]');
  for (const h of await p.$$('xpath/.//*[@role="menuitem" and contains(normalize-space(.), "Select notes to merge")]')) if (await h.isVisible()) { await h.click(); break; }
  await p.click('button[aria-label="Select One"]'); await p.click('button[aria-label="Select Three"]'); await p.click('button[aria-label="Select Two"]');
  ok(await p.$eval('[role=status]', (e) => e.textContent.includes('3 selected')), 'selection count');
  await (await btn('Merge 3')).click(); await p.waitForSelector('[role=dialog]');
  await p.click('button[aria-label="Move Two up"]');
  await p.type('#merge-name', 'Combined');
  await p.click('[role=dialog] button[type=submit]');
  await p.waitForFunction(() => /\/notes\/[a-f0-9]{24}/.test(location.pathname), { timeout: 5000 });
  const id = p.url().split('/notes/')[1];
  const m = (await api('GET', `/notes/${id}`, null, u.token)).data.note;
  ok(m.title === 'Combined' && m.content === '## One\n\nfirst\n\n## Two\n\nsecond\n\n## Three\n\nthird', 'merged in chosen order');
  ok(m.tags.sort().join() === 'a,b', 'tags combined');
  ok((await api('GET', '/notes?view=trash', null, u.token)).data.notes.length === 3, 'originals in trash');
  await (await btn('Undo')).click(); await sleep(1500);
  const active = (await api('GET', '/notes', null, u.token)).data.notes.map((n) => n.title).sort();
  ok(active.join() === 'One,Three,Two', 'undo restores originals and trashes the merge: ' + active.join());
  ok(!p.errors.length, 'no errors ' + p.errors.join('|'));
} finally { await cleanup(); await b.close(); }
