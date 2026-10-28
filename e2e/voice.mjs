import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep, API, noteAction } from './h.mjs';
const b = await launch();
try {
  const u = await newUser('voice');
  const n = (await api('POST', '/notes', { title: 'Talk', content: 'say it' }, u.token)).data.note;
  const p = await pageAs(b, u.token, u.user);
  const ctx = b.defaultBrowserContext(); await ctx.overridePermissions(new URL(process.env.BASE || 'http://localhost:4173').origin, ['microphone']);
  await p.goto(BASE + `/notes/${n._id}`, { waitUntil: 'networkidle0' });
  const btn = async (t) => (await p.$$(`xpath/.//button[contains(normalize-space(.), "${t}")]`))[0];
  await p.waitForSelector('.cm-content'); await noteAction(p, 'button[aria-label="Record voice note"]');
  await p.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /Stop/.test(b.textContent)), { timeout: 5000 });
  await sleep(2500);
  await (await btn('Stop')).click();
  await p.waitForSelector('audio', { timeout: 10000 });
  const clips = (await api('GET', `/notes/${n._id}/audio`, null, u.token)).data.clips;
  ok(clips.length === 1 && clips[0].size > 0 && clips[0].duration >= 2, `voice note uploaded via fake mic (${clips[0]?.size} bytes, ${clips[0]?.duration}s, ${clips[0]?.mime})`);
  await sleep(500);
  const playable = await p.$eval('audio', (a) => new Promise((res) => { if (a.readyState >= 1) return res(true); a.onloadedmetadata = () => res(true); a.onerror = () => res(false); setTimeout(() => res(a.readyState >= 1), 4000); }));
  ok(playable, 'audio plays back from authed blob');
  ok(p.errors.length === 0, 'no errors ' + p.errors.join('|'));
} finally { await cleanup(); await b.close(); }
