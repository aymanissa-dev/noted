// New-build pickup (local stack only: it rebuilds client/dist under the running `vite preview`).
// A page running build X checks for a new version on window focus (logged, and <html data-sw-checked>
// is set); when the rebuilt worker (mocked build id) takes over, the page reloads into it. With a note
// open it shows "A new version of noted. is ready." instead and reloads once you leave the note.
import { execSync } from 'node:child_process';
import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep } from './h.mjs';
if (!/localhost/.test(BASE)) { console.log('SKIP update.mjs: local stack only'); process.exit(0); }
const build = (id) => execSync(`npx vite build`, { cwd: new URL('../client/', import.meta.url).pathname, env: { ...process.env, VITE_BUILD_ID: id || '', VITE_API_URL: process.env.API || 'http://localhost:5055/api' }, stdio: 'ignore' });
const b = await launch();
try {
  const u = await newUser('upd');
  const n = (await api('POST', '/notes', { title: 'Keep typing', content: 'Body' }, u.token)).data.note;
  const p = await pageAs(b, u.token, u.user);
  const logs = []; p.on('console', (m) => logs.push(m.text()));
  await p.evaluate(() => localStorage.setItem('noted.tourDone', '1'));
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 15000 });
  const b0 = await p.evaluate(() => document.documentElement.dataset.build);
  build('e2e-next');
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  const checked = await p.evaluate(() => document.documentElement.dataset.swChecked || '');
  await sleep(300);
  ok(logs.some((l) => /\[noted\] checking for a new version \(window focus; running /.test(l)) && !!checked, `window focus checks for a new version (logged, data-sw-checked=${checked}; running ${b0})`);
  await p.waitForFunction(() => document.documentElement.dataset.build === 'e2e-next', { timeout: 20000 }).catch(() => {});
  await sleep(500);
  ok(await p.evaluate(() => document.documentElement.dataset.build) === 'e2e-next' && logs.some((l) => /new version active, reloading now/.test(l)), 'the page reloads into the new build on its own (no note open)');
  // with a note open: no reload under your fingers; a toast, then reload after leaving the note
  await p.goto(BASE + `/notes/${n._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content[contenteditable=true]');
  build('e2e-next2');
  await p.evaluate(() => window.dispatchEvent(new Event('noted:check-update')));
  await p.waitForFunction(() => /A new version of noted\. is ready/.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
  const mid = await p.evaluate(() => ({ build: document.documentElement.dataset.build, toast: /A new version of noted\. is ready/.test(document.body.innerText), editor: !!document.querySelector('.cm-content') }));
  ok(mid.toast && mid.build === 'e2e-next' && mid.editor, `note open: "new version is ready" toast, no reload yet (${JSON.stringify(mid)})`);
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Done')?.click());
  await p.waitForFunction(() => document.documentElement.dataset.build === 'e2e-next2', { timeout: 15000 }).catch(() => {});
  ok(await p.evaluate(() => document.documentElement.dataset.build) === 'e2e-next2', 'leaving the note reloads into the new build');
  // (QA final b) a page LOAD after a deploy starts on the new build right away (network-first
  // navigations), even while the previous worker is still in control; offline, the shell still loads.
  build('e2e-next3');
  for (const path of ['/', '/notes', `/notes/${n._id}`]) {
    const q = await b.newPage();
    await q.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await q.waitForFunction(() => document.documentElement.dataset.build, { timeout: 10000 }).catch(() => {});
    const first = await q.evaluate(() => ({ build: document.documentElement.dataset.build, controlled: !!navigator.serviceWorker.controller }));
    ok(first.build === 'e2e-next3' && first.controlled, `first load of ${path} after a deploy runs the new build, no second reload (${JSON.stringify(first)})`);
    await q.close();
  }
  const off = await b.newPage(); const oc = await off.target().createCDPSession();
  await off.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  await oc.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  for (const path of ['/notes', '/', '/trash', `/notes/${n._id}`]) {
    await off.goto(BASE + path, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await off.waitForFunction(() => document.documentElement.dataset.build, { timeout: 8000 }).catch(() => {});
    ok(await off.evaluate(() => document.documentElement.dataset.build).catch(() => null) === 'e2e-next3', `offline: the app shell still loads at ${path}`);
  }
  await oc.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await off.close();
  ok(p.errors.length === 0, `no page errors (${p.errors.join(' | ')})`);
} finally { await cleanup(); await b.close(); build(''); }
