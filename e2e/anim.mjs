import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep } from './h.mjs';
const b = await launch();
try {
  const u = await newUser('anim');
  await api('PUT', '/auth/lock-pin', { password: 'quiet-otter-lamp-91', pin: '1234' }, u.token);
  const ids = [];
  for (const t of ['A', 'B', 'C']) { ids.push((await api('POST', '/notes', { title: t, content: t }, u.token)).data.note._id); await sleep(20); }
  const p = await pageAs(b, u.token, { ...u.user, hasLockPin: true });
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  // FLIP: record animations when pinning the last card
  await p.evaluate(() => { window.__anims = []; const o = Element.prototype.animate; Element.prototype.animate = function (k, opt) { window.__anims.push({ id: this.dataset.flipId, d: opt?.duration }); return o.call(this, k, opt); }; });
  await p.click(`[data-flip-id="${ids[0]}"] button[aria-label="Pin note"]`); await sleep(400);
  const anims = await p.evaluate(() => window.__anims);
  ok(anims.some((a) => a.id === ids[0] && a.d === 200), 'pin glides via FLIP (200ms) ' + JSON.stringify(anims));
  // hover lift
  ok(await p.$eval(`[data-flip-id="${ids[1]}"]`, (e) => e.className.includes('hover:-translate-y-0.5') && getComputedStyle(e).transitionDuration.includes('0.2s')), 'card hover lift 200ms');
  // quick capture slides in
  await p.type('#quick-capture', 'Captured idea'); await p.keyboard.press('Enter'); await sleep(50);
  ok(await p.$eval('[class*="animate-slide-in"]', (e) => getComputedStyle(e).animationName === 'slide-in' && parseFloat(getComputedStyle(e).animationDuration) === 0.22), 'quick capture slides in (220ms)');
  // trash restore: shrink-fade
  await api('DELETE', `/notes/${ids[2]}`, null, u.token);
  await p.goto(BASE + '/trash', { waitUntil: 'networkidle0' });
  await (await p.$$('xpath/.//button[normalize-space(.)="Restore"]'))[0].click(); await sleep(60);
  ok(await p.$eval('.animate-leave', (e) => getComputedStyle(e).animationName === 'leave'), 'restore shrink-fades the card');
  await sleep(400); ok(!(await p.$('.animate-leave')), 'card removed after animation');
  // save indicator: pulse then checkmark
  await p.goto(BASE + `/notes/${ids[1]}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
  await p.click('.cm-content'); await p.keyboard.type('x');
  await p.waitForSelector('[data-testid=save-status][data-state=saving], [data-testid=save-status][data-state=saved-check]', { timeout: 4000 });
  await p.waitForSelector('[data-testid=save-status][data-state=saved-check]', { timeout: 4000 });
  ok(true, 'save indicator shows checkmark after saving');
  await sleep(1500);
  ok(await p.$eval('[data-testid=save-status]', (e) => e.dataset.state === 'saved'), 'checkmark settles');
  // PIN: shake on wrong, open on right
  await api('PATCH', `/notes/${ids[1]}/lock`, { locked: true }, u.token);
  await p.goto(BASE + `/notes/${ids[1]}`, { waitUntil: 'networkidle0' });
  await p.type('input[aria-label=PIN]', '9999'); await p.keyboard.press('Enter');
  await p.waitForSelector('[data-testid=pin-lock][data-state=shake]');
  ok(await p.$eval('[data-testid=pin-lock]', (e) => getComputedStyle(e).animationName === 'shake' && parseFloat(getComputedStyle(e).animationDuration) === 0.25), 'lock shakes on wrong PIN (250ms)');
  await p.type('input[aria-label=PIN]', '1234'); await p.keyboard.press('Enter');
  await p.waitForSelector('[data-testid=pin-lock][data-state=open]', { timeout: 3000 });
  ok(await p.$eval('[data-testid=pin-lock]', (e) => e.textContent === '🔓'), 'lock opens on correct PIN');
  await p.waitForSelector('.cm-content', { timeout: 3000 }); ok(true, 'note opens after unlock');
  // landing dot bounce, and reduced motion disables animations
  const lc = await b.createBrowserContext(); const l = await lc.newPage(); await l.goto(BASE + '/', { waitUntil: 'networkidle0' });
  ok(await l.$eval('header .animate-dot-bounce', (e) => getComputedStyle(e).animationName === 'dot-bounce' && getComputedStyle(e).animationIterationCount === '1'), 'landing dot bounces once');
  await l.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  ok(await l.$eval('header .animate-dot-bounce', (e) => parseFloat(getComputedStyle(e).animationDuration) < 0.001), 'reduced motion disables animation');
  ok(!p.errors.length, 'no errors ' + p.errors.join('|'));
} finally { await cleanup(); await b.close(); }
