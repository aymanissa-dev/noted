// UX polish checks: auth form, welcome note, tips, in-app dialogs, touch targets, mobile overflow.
import { launch, newUser, pageAs, api, ok, cleanup, created, BASE, noScroll, sleep } from './h.mjs';
const b = await launch();
try {
  // Register through the UI → welcome note + tips
  const p = await b.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(BASE + '/register', { waitUntil: 'networkidle0' });
  await p.click('#reg-email'); await p.type('#reg-email', 'not-an-email'); await p.click('#reg-name');
  ok(await p.$('#reg-email-error'), 'inline email validation on blur');
  await p.type('#reg-password', 'abc');
  ok(await p.$eval('#reg-password', (e) => e.type) === 'password', 'password hidden by default');
  await p.click('button[aria-label="Show password"]');
  ok(await p.$eval('#reg-password', (e) => e.type) === 'text', 'show password toggles');
  await p.focus('#reg-password'); await p.$eval('#reg-password', (e) => e.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true, modifierCapsLock: true })));
  ok(await p.waitForSelector('[data-testid=caps-warning]', { timeout: 3000 }).then(() => true, () => false), 'caps lock warning');
  await p.$eval('#reg-password', (e) => e.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })));
  ok(!(await p.$('[data-testid=caps-warning]')), 'caps warning clears');
  const email = `ux+${Date.now()}@noted.test`;
  await p.$eval('#reg-email', (e) => { e.select(); }); await p.type('#reg-email', email);
  await p.$eval('#reg-password', (e) => e.select()); await p.type('#reg-password', 'password123');
  await p.type('#reg-name', 'UX Tester');
  await p.click('form button[type=submit]');
  await p.waitForFunction(() => location.pathname === '/notes', { timeout: 15000 });
  const login = await api('POST', '/auth/login', { email, password: 'password123' });
  created.push({ email, token: login.data.token });
  await p.waitForFunction(() => document.querySelector('main')?.innerText.includes('Welcome'), { timeout: 10000 }).catch(() => {});
  ok(await p.$eval('main', (e) => e.innerText.includes('Welcome')), 'welcome note on first run');
  ok(await p.$('[data-testid=tips]'), 'tips hint shown');
  await p.click('button[aria-label="Dismiss tips"]'); await sleep(300);
  await p.reload({ waitUntil: 'networkidle0' });
  ok(!(await p.$('[data-testid=tips]')), 'tips stay dismissed');
  // In-app folder dialog
  await p.click('nav[aria-label="Sidebar"] button[aria-label="New folder"]');
  await p.waitForSelector('[role=dialog] input');
  await p.type('[role=dialog] input', 'Projects'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('nav[aria-label="Sidebar"]').innerText.includes('Projects'), { timeout: 8000 }).catch(() => {});
  ok(await p.$eval('nav[aria-label="Sidebar"]', (e) => e.innerText.includes('Projects')), 'folder created via in-app dialog');
  ok(p.errors.length === 0, 'no page errors ' + p.errors.join('|'));
  // Mobile: overflow + touch targets
  const u = await newUser('ux');
  const n = (await api('POST', '/notes', { title: 'Touch', content: 'x' }, u.token)).data.note;
  for (const path of ['/notes', `/notes/${n._id}`, '/settings']) {
    const m = await pageAs(b, u.token, u.user, { width: 375, height: 812, mobile: true });
    await m.goto(BASE + path, { waitUntil: 'networkidle0' });
    ok(await noScroll(m), `no horizontal scroll at 375 on ${path}`);
    const small = await m.evaluate(() => [...document.querySelectorAll('main button, header button, nav[aria-label="Primary"] a')].filter((e) => e.offsetParent && !e.closest('.cm-editor')).map((e) => { const r = e.getBoundingClientRect(); return { l: e.getAttribute('aria-label') || e.innerText.trim(), w: r.width, h: r.height }; }).filter((r) => r.h < 43.5 || r.w < 43.5));
    ok(small.length === 0, `44px targets on ${path} ${JSON.stringify(small).slice(0, 300)}`);
    await m.close();
  }
} finally { await b.close(); await cleanup(); }
