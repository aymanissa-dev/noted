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
  ok(p.errors.length === 0, `no page errors (${p.errors.join(' | ')})`);
} finally { await cleanup(); await b.close(); build(''); }
