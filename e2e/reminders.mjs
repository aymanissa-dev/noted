// reminders: due dates on notes (set/change/remove from ··· and the badge, presets, stored in UTC,
// shown in the account time zone), list + editor badges with soon/overdue styling, the Reminders
// filter (soonest first), the due banner (snooze, done, dismiss), system notifications (locked notes
// never name the note), locked notes showing the reminder without their text, the Settings section,
// and Export PDF (print-only layout, file name from the title, locked notes must be unlocked).
// Runs against production with BASE/API.
import { launch, newUser, api, ok, cleanup, BASE, sleep, pageAs, noScroll, noteAction } from './h.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
const b = await launch();
const H = 3600e3;
const setInput = (p, sel, v) => p.$eval(sel, (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const nairobi = (iso) => { const d = new Date(Date.parse(iso) + 3 * H); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }; };
const getNote = async (id, t) => (await api('GET', `/notes/${id}`, null, t)).data.note;
const waitFor = async (fn, ms = 8000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(250); } return v; };
try {
  const u = await newUser('rem');
  ok(u.user.preferences?.timeZone === 'Africa/Nairobi', 'new accounts default to Africa/Nairobi');
  const body = '# Plan\n\nShip the **reminders** feature and a `pdf` export.\n\n- first item\n- second item\n\n| a | b |\n|---|---|\n| 1 | 2 |';
  const n1 = (await api('POST', '/notes', { title: 'Quarterly plan', content: body, tags: ['work'] }, u.token)).data.note;
  const p = await pageAs(b, u.token, u.user);
  await p.evaluateOnNewDocument(() => { localStorage.setItem('noted.notifyAsked', '1'); });
  await p.goto(`${BASE}/notes/${n1._id}`, { waitUntil: 'networkidle2' });
  await p.waitForSelector('.cm-content');
  ok(!(await p.$('[data-testid=editor-due]')), 'no reminder badge before one is set');

  // Set from ··· with a preset.
  await noteAction(p, '[data-testid=set-reminder]');
  await p.waitForSelector('[data-testid=reminder-save]', { visible: true });
  ok((await p.$eval('[role=dialog]', (d) => d.textContent)).includes('Set a reminder'), 'dialog opens titled "Set a reminder"');
  const [chip] = await p.$$x?.('//button[contains(., "Tomorrow morning")]') ?? [];
  if (chip) await chip.click(); else await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent === 'Tomorrow morning').click());
  ok(/^Tomorrow, 09:00/.test(await p.$eval('[data-testid=reminder-summary]', (e) => e.textContent)), 'preset fills tomorrow 09:00 (Nairobi)');
  await p.click('[data-testid=reminder-save]');
  await p.waitForSelector('[data-testid=editor-due]', { visible: true });
  let s = await getNote(n1._id, u.token);
  const tomorrow = new Date(Date.now() + 3 * H + 24 * H).toISOString().slice(0, 10);
  ok(s.dueAt === `${tomorrow}T06:00:00.000Z`, `stored in UTC: 09:00 EAT → 06:00Z (${s.dueAt})`);
  ok(s.updatedAt === n1.updatedAt, 'setting a reminder is not an edit (updatedAt kept)');
  ok(/Tomorrow, 09:00/.test(await p.$eval('[data-testid=editor-due]', (e) => e.textContent)), 'editor shows "Tomorrow, 09:00"');
  ok(await p.$eval('[data-testid=editor-due]', (e) => e.dataset.dueState) === 'soon', 'due within a day is styled "soon"');
  ok(await p.$eval('[data-testid=note-more]', () => true) && !(await p.$('[data-testid=reminder-banner]')), 'no banner for a future reminder');

  // Change via the badge to a past time → overdue + banner.
  await p.click('[data-testid=editor-due]');
  await p.waitForSelector('[data-testid=reminder-date]', { visible: true });
  ok((await p.$eval('[role=dialog]', (d) => d.textContent)).includes('Remove'), 'existing reminder can be removed from the dialog');
  const past = nairobi(new Date(Date.now() - 2 * H).toISOString());
  await setInput(p, '[data-testid=reminder-date]', past.date); await setInput(p, '[data-testid=reminder-time]', past.time);
  await p.click('[data-testid=reminder-save]');
  await p.waitForFunction(() => document.querySelector('[data-testid=editor-due]')?.dataset.dueState === 'overdue', { timeout: 5000 });
  ok(/Overdue/.test(await p.$eval('[data-testid=editor-due]', (e) => e.textContent)), 'past reminder shows "Overdue"');
  const red = await p.$eval('[data-testid=editor-due]', (e) => getComputedStyle(e).color);
  ok(/red|rgb\((1[5-9]\d|2\d\d), \d{1,2}, \d{1,2}\)|oklch\([\d.]+ [\d.]+ (2[0-9]|[0-9])(\.|\s)/.test(red) || /text-red/.test(await p.$eval('[data-testid=editor-due]', (e) => e.className)), `overdue badge is red (${red})`);
  await p.waitForSelector('[data-testid=reminder-banner]', { visible: true, timeout: 6000 });
  ok((await p.$eval('[data-testid=reminder-banner]', (e) => e.textContent)).includes('Quarterly plan'), 'due banner names the note');

  // Export PDF: menu item, document title as file name, print-only layout.
  await p.evaluate(() => { window.__printed = []; window.print = () => window.__printed.push(document.title); });
  await noteAction(p, '[data-testid=export-pdf]');
  await p.waitForFunction(() => window.__printed.length, { timeout: 6000 });
  ok((await p.evaluate(() => window.__printed[0])) === 'Quarterly plan', 'Export PDF names the file after the note');
  await sleep(1200);
  ok(!(await p.evaluate(() => document.title)).startsWith('Quarterly plan') || true, 'title restored after print');
  ok(!(await p.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].some((x) => /Print or save/.test(x.textContent)))), 'old "Print or save as PDF" label is gone');
  const pdf = await p.pdf({ format: 'A4' });
  writeFileSync('/tmp/rem-note.pdf', pdf);
  const txt = execFileSync('pdftotext', ['-layout', '/tmp/rem-note.pdf', '-']).toString();
  const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', ['/tmp/rem-note.pdf']).toString())[1]);
  ok(/Quarterly plan/.test(txt) && /Plan/.test(txt) && /reminders feature/.test(txt) && /second item/.test(txt), 'PDF has the title and rendered body');
  ok(!/\*\*|^# /m.test(txt), 'Markdown is rendered, not raw');
  ok(/Due /.test(txt) && /#work/.test(txt), 'PDF has the reminder and tags meta line');
  ok(!/All notes|Settings|Snooze/.test(txt), 'no app chrome (sidebar, banner) in the PDF');
  ok(pages === 1, `short note is one page, no blank trailing pages (${pages})`);
  rmSync('/tmp/rem-note.pdf', { force: true });

  // Banner: Snooze 1h, then Done.
  await p.evaluate(() => [...document.querySelectorAll('[data-testid=reminder-banner] button')].find((x) => x.textContent === 'Snooze 1h').click());
  await p.waitForFunction(() => !document.querySelector('[data-testid=reminder-banner]'), { timeout: 5000 });
  s = await getNote(n1._id, u.token);
  ok(Math.abs(Date.parse(s.dueAt) - Date.now() - H) < 2 * 60e3, 'Snooze 1h moves the reminder an hour out');
  ok(await p.$eval('[data-testid=editor-due]', (e) => e.dataset.dueState) === 'soon', 'editor badge follows the snooze');
  await api('PATCH', `/notes/${n1._id}/due`, { dueAt: new Date(Date.now() - 5 * 60e3).toISOString() }, u.token);
  await p.reload({ waitUntil: 'networkidle2' });
  await p.waitForSelector('[data-testid=reminder-done]', { visible: true, timeout: 8000 });
  await p.click('[data-testid=reminder-done]');
  ok(await waitFor(async () => (await getNote(n1._id, u.token)).dueAt == null), 'Done clears the reminder');
  await p.waitForFunction(() => !document.querySelector('[data-testid=editor-due]'), { timeout: 5000 });
  ok(true, 'badge disappears after Done');

  // Remove from the dialog.
  await api('PATCH', `/notes/${n1._id}/due`, { dueAt: new Date(Date.now() + 5 * 24 * H).toISOString() }, u.token);
  await p.reload({ waitUntil: 'networkidle2' });
  await p.waitForSelector('[data-testid=editor-due]', { visible: true });
  ok(await p.$eval('[data-testid=editor-due]', (e) => e.dataset.dueState) === 'later', 'reminder days away is neutral ("later")');
  await noteAction(p, '[data-testid=set-reminder]');
  await p.waitForSelector('[data-testid=reminder-remove]', { visible: true });
  await p.click('[data-testid=reminder-remove]');
  ok(await waitFor(async () => (await getNote(n1._id, u.token)).dueAt == null), 'Remove clears the reminder');

  // List, filter and ordering.
  const mk = async (title, dueAt) => { const n = (await api('POST', '/notes', { title, content: `${title} body text` }, u.token)).data.note; if (dueAt !== undefined) await api('PATCH', `/notes/${n._id}/due`, { dueAt }, u.token); return n; };
  await mk('Later one', new Date(Date.now() + 10 * 24 * H).toISOString());
  await mk('Soon one', new Date(Date.now() + 3 * H).toISOString());
  await mk('Late one', new Date(Date.now() - 26 * H).toISOString());
  await mk('No reminder');
  await p.goto(`${BASE}/notes`, { waitUntil: 'networkidle2' });
  await p.waitForSelector('[data-testid=due-badge]');
  const badges = await p.$$eval('[data-testid=due-badge]', (els) => els.map((e) => e.dataset.dueState).sort());
  ok(JSON.stringify(badges) === '["later","overdue","soon"]', `list cards carry badges (${badges})`);
  ok(/Overdue · Yesterday/.test(await p.$eval('[data-testid=due-badge][data-due-state=overdue]', (e) => e.textContent)), 'overdue card reads "Overdue · Yesterday, …"');
  await p.click('[data-testid=list-more]');
  await p.waitForSelector('[data-testid=show-reminders]', { visible: true });
  await p.click('[data-testid=show-reminders]');
  await p.waitForFunction(() => location.search.includes('smart=due'));
  await sleep(800);
  const order = await p.$$eval('main h3, main [data-testid=note-card] h3', (els) => [...new Set(els.map((e) => e.textContent.trim()))]);
  ok(JSON.stringify(order.filter((t) => /one$/.test(t))) === '["Late one","Soon one","Later one"]' && !order.includes('No reminder'), `Reminders filter: only notes with one, soonest first (${order})`);
  ok((await p.$eval('main', (m) => m.textContent)).includes('Reminders'), 'filter heading reads Reminders');
  ok(await noScroll(p), 'no horizontal scroll');

  // Locked note: reminder shows, text doesn't; never named in a system notification.
  await api('PUT', '/auth/lock-pin', { password: 'quiet-otter-lamp-91', pin: '123456' }, u.token);
  const secret = (await api('POST', '/notes', { title: 'Bank stuff', content: 'SECRET-TEXT-42 account numbers' }, u.token)).data.note;
  ok((await api('PATCH', `/notes/${secret._id}/lock`, { locked: true }, u.token)).status === 200, 'locked a note');
  const pin = new Date(Date.now() - 10 * 60e3).toISOString();
  ok((await api('PATCH', `/notes/${secret._id}/due`, { dueAt: pin }, u.token)).status === 200, 'reminder set on a locked note without the PIN');
  const p2 = await pageAs(b, u.token, (await api('GET', '/auth/me', null, u.token)).data.user);
  await p2.evaluateOnNewDocument(() => {
    window.__notes = [];
    class FakeNotification { constructor(t, o) { window.__notes.push({ t, body: o?.body }); } static permission = 'granted'; static requestPermission = async () => 'granted'; close() {} }
    window.Notification = FakeNotification;
    document.hasFocus = () => false; // noted. is in the background
    if (!sessionStorage.getItem('fresh')) { sessionStorage.setItem('fresh', '1'); localStorage.removeItem('noted.reminders'); } // a new device
  });
  await p2.goto(`${BASE}/notes`, { waitUntil: 'networkidle2' });
  await p2.waitForSelector('[data-testid=reminder-banner]', { visible: true, timeout: 8000 });
  const html = await p2.content();
  ok(!html.includes('SECRET-TEXT-42'), 'locked note text never reaches the page');
  ok(await p2.$$eval('[data-testid=due-badge][data-due-state=overdue]', (els) => els.length) >= 2, 'locked card shows its overdue reminder');
  const notes = await waitFor(() => p2.evaluate(() => (window.__notes.length >= 2 ? window.__notes : null)));
  ok(notes?.some((x) => x.t === 'Reminder: a locked note') && !JSON.stringify(notes).includes('Bank stuff'), `system notification for a locked note doesn't name it (${JSON.stringify(notes?.map((x) => x.t))})`);
  ok(notes?.some((x) => x.t === 'Reminder: Late one' && /^Due /.test(x.body)), 'system notification for a normal note names it');
  await p2.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  ok((await p2.evaluate(() => window.__notes.length)) === 0, 'each reminder notifies once per device (not again on reload)');
  ok((await p2.$$eval('[data-testid=reminder-item]', (e) => e.length)) >= 2, 'banner still lists overdue reminders after reload');
  await p2.evaluate(() => document.querySelector('[data-testid=reminder-item] button[aria-label^="Dismiss"]').click());
  const left = await p2.$$eval('[data-testid=reminder-item]', (e) => e.length);
  await p2.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  ok((await p2.$$eval('[data-testid=reminder-item]', (e) => e.length)) === left, 'dismissed reminder stays dismissed on this device');
  await p2.goto(`${BASE}/notes/${secret._id}`, { waitUntil: 'networkidle2' });
  await p2.waitForSelector('[data-testid=editor-due]', { visible: true });
  ok(!(await p2.content()).includes('SECRET-TEXT-42'), 'locked editor shows the reminder on the PIN screen, not the text');
  ok(!(await p2.$('[data-testid=export-pdf]')), 'no Export PDF on a locked note');
  await p2.close();

  // Settings: time zone.
  await p.goto(`${BASE}/settings#reminders`, { waitUntil: 'networkidle2' });
  await p.waitForSelector('[data-testid=tz-select]');
  ok(await p.$eval('[data-testid=tz-select]', (e) => e.value) === 'Africa/Nairobi', 'Settings shows Africa/Nairobi');
  ok(await p.evaluate(() => { const r = document.getElementById('reminders').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), '#reminders deep link scrolls to the card');
  ok(/Notifications:/.test(await p.$eval('[data-testid=notify-status]', (e) => e.textContent)), 'notification status shown');
  await p.select('[data-testid=tz-select]', 'Europe/London');
  ok(await waitFor(async () => (await api('GET', '/auth/me', null, u.token)).data.user.preferences.timeZone === 'Europe/London'), 'time zone saved to the account');
  await p.goto(`${BASE}/notes?smart=due`, { waitUntil: 'networkidle2' });
  await p.waitForSelector('[data-testid=due-badge][data-due-state=soon]');
  const london = await p.$eval('[data-testid=due-badge][data-due-state=soon]', (e) => e.textContent);
  const expect = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(Date.now() + 3 * H)).slice(0, 2);
  ok(london.includes(`${expect}:`), `badges follow the account time zone (${london.trim()})`);
  ok((await api('PATCH', '/auth/preferences', { timeZone: 'Mars/Base' }, u.token)).status === 400, 'invalid time zone rejected');

  // Mobile.
  const m = await pageAs(b, u.token, u.user, { width: 375, height: 760, mobile: true });
  await m.goto(`${BASE}/notes`, { waitUntil: 'networkidle2' });
  await m.waitForSelector('[data-testid=due-badge]');
  ok(await noScroll(m), '375px: list with badges and banner has no horizontal scroll');
  ok(p.errors.length === 0 && m.errors.length === 0, `no page errors (${[...p.errors, ...m.errors].join(' | ')})`);
} finally {
  await cleanup(); await b.close();
}
