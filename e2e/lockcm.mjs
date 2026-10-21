import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep } from './h.mjs';
const b = await launch();
try {
  const u = await newUser('lockcm');
  await api('PUT', '/auth/lock-pin', { password: 'quiet-otter-lamp-91', pin: '123456' }, u.token);
  const n = (await api('POST', '/notes', { title: 'Secret', content: 'hidden text' }, u.token)).data.note;
  await api('PATCH', `/notes/${n._id}/lock`, { locked: true }, u.token);
  const p = await pageAs(b, u.token, { ...u.user, hasLockPin: true });
  await p.goto(BASE + `/notes/${n._id}`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('input[inputmode=numeric], input[type=password]');
  await p.type('input[inputmode=numeric], input[type=password]', '123456'); await p.keyboard.press('Enter');
  await p.waitForSelector('.cm-content'); await sleep(500);
  ok(await p.$eval('.cm-content', (e) => e.innerText.includes('hidden text')), 'unlocked content shows in editor');
  await p.click('.cm-content'); await p.keyboard.down('Control'); await p.keyboard.press('End'); await p.keyboard.up('Control');
  await p.keyboard.type(' more'); await sleep(1800);
  const un = (await api('POST', `/notes/${n._id}/unlock`, { pin: '123456' }, u.token)).data.note;
  ok(un.content === 'hidden text more', 'locked note edits saved: ' + un.content);
  const keys = await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('noted-undo', 1); r.onupgradeneeded = () => r.result.createObjectStore('history'); r.onsuccess = () => { const tx = r.result.transaction('history'); const q = tx.objectStore('history').getAllKeys(); q.onsuccess = () => res(q.result); }; }));
  ok(!keys.some((k) => k.endsWith(n._id)), 'no undo history stored for locked note');
  ok(!p.errors.length, 'no errors ' + p.errors.join('|'));
} finally { await cleanup(); await b.close(); }
