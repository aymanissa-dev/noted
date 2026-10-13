import fs from 'node:fs';
import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep } from './h.mjs';
const b = await launch();
try {
  const u = await newUser('backup');
  await api('POST', '/notes', { title: 'Keep me', content: 'secret backup text', tags: ['x'] }, u.token);
  await api('POST', '/notes', { title: 'Also', content: '**two**' }, u.token);
  const p = await pageAs(b, u.token, u.user);
  const dir = fs.mkdtempSync('/tmp/dl-');
  const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  await p.goto(BASE + '/settings', { waitUntil: 'networkidle0' });
  const btn = async (t) => (await p.$$('xpath/.//button[normalize-space(.)="' + t + '"]'))[0];
  await (await btn('Encrypted backup…')).click(); await p.waitForSelector('#pw1');
  await p.type('#pw1', 'backup-pass-1'); await p.type('#pw2', 'backup-pass-1');
  await (await btn('Encrypt & download')).click();
  let file; for (let i = 0; i < 40 && !file; i++) { await sleep(250); file = fs.readdirSync(dir).find((f) => f.endsWith('.noted-backup')); }
  ok(file, 'backup downloaded ' + file);
  const raw = fs.readFileSync(`${dir}/${file}`, 'utf8');
  ok(!raw.includes('secret backup text') && JSON.parse(raw).cipher.name === 'AES-GCM', 'file is encrypted');
  // restore into a fresh account
  const v = await newUser('restore');
  const q = await pageAs(b, v.token, v.user);
  await q.goto(BASE + '/settings', { waitUntil: 'networkidle0' });
  const input = await q.$('[data-testid=import-file]'); await input.uploadFile(`${dir}/${file}`);
  await q.waitForSelector('#pw1'); await q.type('#pw1', 'wrong-password');
  await (await q.$$('xpath/.//button[normalize-space(.)="Decrypt & import"]'))[0].click();
  await q.waitForSelector('[role=alert]');
  ok((await q.$eval('[role=alert]', (e) => e.textContent)).includes('Wrong password'), 'wrong password rejected');
  await q.click('#pw1', { clickCount: 3 }); await q.type('#pw1', 'backup-pass-1');
  await (await q.$$('xpath/.//button[normalize-space(.)="Decrypt & import"]'))[0].click();
  await q.waitForFunction(() => document.querySelector('[role=status]')?.textContent.includes('Imported'), { timeout: 8000 });
  ok((await q.$eval('[role=status]', (e) => e.textContent)).includes('Imported 2 notes'), 'restored 2 notes');
  const titles = (await api('GET', '/notes', null, v.token)).data.notes.map((n) => n.title).sort();
  ok(titles.join() === 'Also,Keep me', 'restored contents');
  // again: duplicates skipped
  await input.uploadFile(`${dir}/${file}`); await q.waitForSelector('#pw1'); await q.type('#pw1', 'backup-pass-1');
  await (await q.$$('xpath/.//button[normalize-space(.)="Decrypt & import"]'))[0].click();
  await q.waitForFunction(() => document.querySelector('[role=status]')?.textContent.includes('Skipped'), { timeout: 8000 });
  ok((await q.$eval('[role=status]', (e) => e.textContent)).includes('Skipped 2 duplicates'), 'duplicate skipping on re-import');
  ok(!p.errors.length && !q.errors.length, 'no errors');
} finally { await cleanup(); await b.close(); }
