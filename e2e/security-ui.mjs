// Security review fixes in the UI (local stack): friendly 429 on sign-in, generic sign-up failure,
// 6-digit new PINs (+ upgrade hint for short ones), PIN lockout → account password, locked notes need
// the PIN to be trashed / deleted for good / emptied from the trash.
import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep } from './h.mjs';
const PW = 'quiet-otter-lamp-91';
const b = await launch();
const click = (p, re, sel = 'button') => p.evaluate((src, s) => { const r = new RegExp(src); const el = [...document.querySelectorAll(s)].find((x) => r.test(x.textContent.trim()) && !x.disabled); el?.click(); return Boolean(el); }, re.source, sel);
const text = (p) => p.evaluate(() => document.body.innerText);
try {
  const u = await newUser('secui');
  // ---- sign-in limit: 5th wrong password → friendly wait message, no raw error ----
  const ctx = await b.createBrowserContext();
  const g = await ctx.newPage(); await g.setViewport({ width: 1100, height: 800 });
  await g.goto(BASE + '/login', { waitUntil: 'networkidle0' });
  const msgs = [];
  for (let i = 0; i < 5; i++) {
    await g.$eval('#login-email', (e) => { e.value = ''; }); await g.$eval('#login-password', (e) => { e.value = ''; });
    await g.click('#login-email', { clickCount: 3 }); await g.type('#login-email', u.email);
    await g.click('#login-password', { clickCount: 3 }); await g.type('#login-password', 'wrong-password-' + i);
    await g.click('button[type=submit]');
    await g.waitForFunction(() => !document.querySelector('button[type=submit]')?.disabled && document.querySelector('[role=alert]'), { timeout: 15000 }).catch(() => {});
    await sleep(300); msgs.push(await g.evaluate(() => [...document.querySelectorAll('[role=alert]')].map((e) => e.innerText).join(' ')));
  }
  ok(/Wrong email or password/.test(msgs[0]) && /Too many sign-in attempts.*15 minutes/.test(msgs[4]), `sign-in: 5th wrong password shows a calm wait message (${msgs[4]})`);
  // ---- sign-up with an existing email: generic, with a way to log in ----
  await g.goto(BASE + '/register', { waitUntil: 'networkidle0' });
  await g.type('#reg-name', 'Dup'); await g.type('#reg-email', u.email); await g.type('#reg-password', PW);
  await g.click('button[type=submit]'); await g.waitForSelector('[role=alert]', { timeout: 10000 }).catch(() => {});
  const reg = await g.evaluate(() => [...document.querySelectorAll('[role=alert]')].map((e) => e.innerText).join(' '));
  ok(/couldn’t create an account with these details.*log in instead/i.test(reg) && !/already (exists|registered)/i.test(reg), `sign-up, existing email: generic message (${reg})`);
  await ctx.close();

  // ---- Settings: new PINs are 6 digits ----
  const p = await pageAs(b, u.token, u.user);
  await p.goto(BASE + '/settings#lock-pin', { waitUntil: 'networkidle0' });
  await click(p, /^Set PIN$/);
  await p.type('#lock-pin input[type=password][autocomplete=current-password]', PW);
  const pins = await p.$$('#lock-pin input[inputmode=numeric]');
  await pins[0].type('2468'); await pins[1].type('2468'); await click(p, /^Save PIN$/); await sleep(500);
  ok(/PIN must be 6 digits/.test(await text(p)), 'settings: a 4-digit PIN is refused with "PIN must be 6 digits."');
  await pins[0].type('13'); await pins[1].type('13'); await click(p, /^Save PIN$/);
  await p.waitForFunction(() => /PIN set/.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
  ok(/PIN set/.test(await text(p)), 'settings: a 6-digit PIN is saved');

  // ---- locked note: trash from the editor needs it unlocked (it is, after the PIN) ----
  const mk = async (title) => { const n = (await api('POST', '/notes', { title, content: title + ' body' }, u.token)).data.note; await api('PATCH', `/notes/${n._id}/lock`, { locked: true }, u.token); return n; };
  const l1 = await mk('Locked one'); const l2 = await mk('Locked two'); const l3 = await mk('Locked three');
  await p.goto(BASE + `/notes/${l1._id}`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('input[aria-label=PIN]'); await p.type('input[aria-label=PIN]', '246813'); await p.keyboard.press('Enter');
  await p.waitForSelector('.cm-content'); await sleep(400);
  await p.click('[data-testid=note-more] button, button[data-testid=note-more]').catch(() => {}); await sleep(300);
  await click(p, /Move to trash/, '[role=menuitem]'); await sleep(1500);
  ok((await api('GET', '/notes?view=trash', null, u.token)).data.notes.some((n) => n._id === l1._id), 'editor: an unlocked locked note moves to the trash');
  // trash two more via unlock tokens (API), then delete one forever from the Trash page with the PIN
  for (const n of [l2, l3]) { const t = (await api('POST', `/notes/${n._id}/unlock`, { pin: '246813' }, u.token)).data.unlockToken; await fetch(`${process.env.API || 'http://localhost:5055/api'}/notes/${n._id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${u.token}`, 'X-Unlock-Token': t } }); }
  await p.goto(BASE + '/trash', { waitUntil: 'networkidle0' }); await sleep(600);
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Delete forever').click());
  await sleep(300); await click(p, /^Delete forever$/, '[role=dialog] button, [role=alertdialog] button'); await sleep(400);
  const promptShown = /Enter your PIN to delete it for good/.test(await text(p));
  ok(promptShown, 'trash: Delete forever on a locked note asks for the PIN');
  await p.keyboard.type('246813'); await click(p, /^Continue$/, '[role=dialog] button, [role=alertdialog] button'); await sleep(1500);
  let left = (await api('GET', '/notes?view=trash', null, u.token)).data.notes.length;
  ok(left === 2, `trash: deleted for good with the PIN (${left} left)`);
  // empty trash without the PIN keeps locked notes; a plain note goes
  const plain = (await api('POST', '/notes', { title: 'plain' }, u.token)).data.note; await api('DELETE', `/notes/${plain._id}`, null, u.token);
  await p.reload({ waitUntil: 'networkidle0' }); await sleep(600);
  await click(p, /Empty trash/); await sleep(300); await click(p, /^Empty trash$/, '[role=dialog] button, [role=alertdialog] button'); await sleep(400);
  ok(/Enter your PIN to delete the locked notes too/.test(await text(p)), 'empty trash with locked notes asks for the PIN (optional)');
  await click(p, /^Empty trash$/, '[role=dialog] button, [role=alertdialog] button'); await sleep(1500);
  left = (await api('GET', '/notes?view=trash', null, u.token)).data.notes;
  ok(left.length === 2 && left.every((n) => n.locked) && /2 locked notes stay in the trash/.test(await text(p)), `empty trash without the PIN: locked notes stay, toast says so (${left.length})`);

  // ---- PIN lockout → account password (server answer simulated: reaching it takes hours of waits) ----
  const l4 = await mk('Locked four');
  await p.setRequestInterception(true);
  let lockout = true;
  p.on('request', (r) => {
    if (lockout && r.method() === 'POST' && r.url().includes(`/notes/${l4._id}/unlock`)) return r.respond({ status: 429, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Too many wrong PINs. Enter your account password to use your PIN again.', passwordRequired: true }) });
    r.continue();
  });
  await p.goto(BASE + `/notes/${l4._id}`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('input[aria-label=PIN]'); await p.type('input[aria-label=PIN]', '000000'); await p.keyboard.press('Enter');
  await p.waitForSelector('[data-testid=pin-password]', { timeout: 5000 }).catch(() => {});
  ok(await p.$('[data-testid=pin-password]'), 'PIN lockout: asks for the account password');
  lockout = false;
  await p.type('[data-testid=pin-password] input', 'not-my-password'); await p.keyboard.press('Enter'); await sleep(1200);
  ok(/Wrong password|password/i.test(await p.$eval('[data-testid=pin-password]', (e) => e.innerText)) && await p.$('[data-testid=pin-password]'), 'wrong account password: stays on the password step');
  await p.$eval('[data-testid=pin-password] input', (e) => { e.value = ''; });
  await p.click('[data-testid=pin-password] input', { clickCount: 3 }); await p.type('[data-testid=pin-password] input', PW); await p.keyboard.press('Enter');
  await p.waitForSelector('input[aria-label=PIN]', { timeout: 5000 }).catch(() => {});
  ok(await p.$('input[aria-label=PIN]'), 'right account password: back to the PIN');
  await p.type('input[aria-label=PIN]', '246813'); await p.keyboard.press('Enter');
  await p.waitForSelector('.cm-content', { timeout: 8000 }).catch(() => {});
  ok(await p.$('.cm-content'), 'then the PIN opens the note');
  ok(!p.errors.length, `no page errors (${p.errors.join(' | ')})`);
} finally { await cleanup(); await b.close(); }
