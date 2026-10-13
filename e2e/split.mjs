import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep } from './h.mjs';
const b = await launch();
try {
  const u = await newUser('split');
  const a = (await api('POST', '/notes', { title: 'Alpha', content: 'first' }, u.token)).data.note;
  const c = (await api('POST', '/notes', { title: 'Beta', content: 'second' }, u.token)).data.note;
  const p = await pageAs(b, u.token, u.user);
  await p.goto(BASE + `/notes/${a._id}`, { waitUntil: 'networkidle0' });
  ok(await p.$('aside[aria-label="Notes list"]'), 'split view list beside note at 1440');
  await p.waitForSelector('.cm-content'); await p.click('.cm-content'); await p.keyboard.down('Control'); await p.keyboard.press('End'); await p.keyboard.up('Control'); await p.keyboard.type(' edited');
  await p.click(`aside a[href="/notes/${c._id}"]`); await sleep(1500);
  ok(await p.$eval('input[placeholder=Title]', (e) => e.value) === 'Beta', 'switch note from list');
  const A = (await api('GET', `/notes/${a._id}`, null, u.token)).data.note;
  ok(A.content === 'first edited', 'previous note flushed on switch: ' + JSON.stringify(A.content));
  const B = (await api('GET', `/notes/${c._id}`, null, u.token)).data.note;
  ok(B.content === 'second', 'other note untouched');
  await p.screenshot({ path: '/tmp/split.png' });
  // new note keeps typing across id assignment
  await p.goto(BASE + '/notes/new', { waitUntil: 'networkidle0' });
  await p.type('input[placeholder=Title]', 'Gamma'); await sleep(1500); await p.keyboard.type(' ray');
  await sleep(1500);
  ok(await p.$eval('input[placeholder=Title]', (e) => e.value) === 'Gamma ray', 'new note title intact after create');
  const n = await api('GET', '/notes', null, u.token);
  ok(n.data.notes.filter((x) => x.title.startsWith('Gamma')).length === 1, 'single note created');
  await p.setViewport({ width: 900, height: 900 }); await sleep(300);
  ok(!(await p.$('aside[aria-label="Notes list"]')), 'standalone editor on narrow');
  ok(!p.errors.length, 'no errors ' + p.errors.join('|'));
} finally { await cleanup(); await b.close(); }
