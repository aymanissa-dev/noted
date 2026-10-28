// v7: QA retest 4, reproduced the way QA did it in real Chrome.
//  1a. Notes created on this device (so it holds full copies), service worker active and controlling,
//      DevTools-style blocking (CDP Network.setBlockedURLs, pattern `<API>/notes/<id>*`), then open
//      from the list and hard reload: never editable, "Couldn't load", Try again, typing does nothing,
//      nothing is queued ("Saved offline"/"pending") and the server copy is untouched; recovers after.
//  1b. Offline (emulateNetworkConditions) + direct-URL hard load: a never-opened note shows
//      "Couldn't load this note"; a note with a local copy shows it read-only; nothing is queued.
//  1c. A profile holding an older build's caches (v1 cache key, v2 cache without an owner).
//  2.  Cross-account: A signs in (login form), creates notes/trash/archive, logs out; B registers in the
//      same profile: no trace of A anywhere (lists, trash, archive, offline, localStorage, IndexedDB,
//      CacheStorage). Also a token switch without logging out, and another tab switching accounts.
//  3.  Empty-state pictures don't look like real notes; list/trash/archive offline: calm status + Try again.
// Runs against production with BASE/API; PROFILE=/dir reuses a Chrome profile.
import { launch, newUser, api, ok, cleanup, created, BASE, API, sleep } from './h.mjs';
const b = await launch();
const PW = 'quiet-otter-lamp-91';
const st = (p) => p.evaluate(() => {
  const cm = document.querySelector('.cm-content');
  const title = document.querySelector('input[aria-label=Title]');
  return {
    failed: !!document.querySelector('[data-testid=note-load-failed]'),
    localCopy: !!document.querySelector('[data-testid=note-local-copy]'),
    editable: (cm?.getAttribute('contenteditable') === 'true') || (title ? !title.readOnly : false),
    title: title?.value ?? null,
    msg: (document.querySelector('[data-testid=note-load-failed], [data-testid=note-local-copy]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 140),
    retry: [...document.querySelectorAll('[data-testid=note-load-failed] button, [data-testid=note-local-copy] button')].some((x) => /Try again/.test(x.textContent)),
    status: document.querySelector('[role=status]')?.innerText || '',
    queue: localStorage.getItem('noted.queue'),
  };
});
const tryType = async (p) => {
  await p.evaluate(() => document.querySelector('.cm-content')?.focus());
  await p.keyboard.type('TYPED'); await sleep(1500);
};
const noQueue = (s) => !s.queue && !/pending|Saved offline/i.test(s.status);
const login = async (p, email) => {
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#login-email');
  await p.type('#login-email', email); await p.type('#login-password', PW);
  await Promise.all([p.waitForFunction(() => location.pathname.startsWith('/notes'), { timeout: 15000 }), p.click('button[type=submit]')]);
};
const register = async (p, email) => {
  await p.goto(BASE + '/register', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#reg-name');
  await p.type('#reg-name', 'Tester B'); await p.type('#reg-email', email); await p.type('#reg-password', PW);
  await Promise.all([p.waitForFunction(() => location.pathname.startsWith('/notes'), { timeout: 15000 }), p.click('button[type=submit]')]);
  created.push({ email, token: await p.evaluate(() => localStorage.getItem('noted.token')) });
};
// Creates a note through the UI (New note → title → autosave), then returns to the list.
const capture = async (p, t) => {
  await p.goto(BASE + '/notes/new', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('input[aria-label=Title]');
  await p.type('input[aria-label=Title]', t);
  await p.waitForFunction(() => /\/notes\/[a-f0-9]{24}/.test(location.pathname) && /Saved/.test(document.querySelector('[data-testid=editor-toolbar]')?.innerText || ''), { timeout: 10000 }).catch(() => {});
  await sleep(600); await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
};
const withSw = async (p) => p.waitForFunction(() => !!navigator.serviceWorker?.controller, { timeout: 15000 }).then(() => true).catch(() => false);

try {
  // ---------- 1. Note load failures ----------
  const u = await newUser('v7');
  // The default context, so PROFILE=/dir runs with that profile's service worker, caches and storage.
  const ctx1 = b.defaultBrowserContext();
  const p = await ctx1.newPage(); await p.setViewport({ width: 1024, height: 700 });
  p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  if (process.env.BUILD) {
    // A profile that ran an older build first gets that build's precached shell; the new worker takes
    // over and the page reloads itself. Count the loads it takes to run the expected build.
    const t0 = Date.now(); let seen = [];
    while (Date.now() - t0 < 30000) {
      const bid = await p.evaluate(() => document.documentElement.dataset.build).catch(() => null);
      if (bid && seen[seen.length - 1] !== bid) seen.push(bid);
      if (bid === process.env.BUILD) break;
      await sleep(1000);
    }
    ok(seen[seen.length - 1] === process.env.BUILD, `runs build ${process.env.BUILD} without a manual reload (builds seen: ${seen.join(' → ')}, ${Date.now() - t0}ms)`);
  }
  await p.evaluate(() => localStorage.setItem('noted.tourDone', '1'));
  await login(p, u.email);
  await p.waitForSelector('main');
  for (const t of ['R4 Alpha', 'R4 Beta']) await capture(p, t);
  // a note with a body, written in the editor
  await p.goto(BASE + '/notes/new', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('input[aria-label=Title]');
  await p.type('input[aria-label=Title]', 'R4 Body'); await p.click('.cm-content'); await p.keyboard.type('Body text that must survive.');
  await p.waitForFunction(() => /Saved/.test(document.querySelector('[data-testid=editor-toolbar]')?.innerText || ''), { timeout: 10000 }).catch(() => {});
  await sleep(1200);
  const gamma = (await api('POST', '/notes', { title: 'R4 Gamma', content: '' }, u.token)).data.note; // never opened here
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(800);
  ok(await withSw(p), 'service worker is active and controls the page');
  const list = (await api('GET', '/notes', null, u.token)).data.notes;
  const id = (t) => list.find((n) => n.title === t)._id;
  const server = async (t) => (await api('GET', `/notes/${id(t)}`, null, u.token)).data.note;
  const before = { beta: await server('R4 Beta'), alpha: await server('R4 Alpha'), body: await server('R4 Body') };
  const cdp = await p.target().createCDPSession(); await cdp.send('Network.enable');
  const block = (urls) => cdp.send('Network.setBlockedURLs', { urls });

  // 1a. DevTools request blocking, open from the list.
  await block([`${API}/notes/${id('R4 Beta')}*`]);
  await p.click(`[data-flip-id="${id('R4 Beta')}"] a`);
  await p.waitForSelector('[data-testid=note-load-failed], [data-testid=note-local-copy]', { timeout: 10000 }).catch(() => {});
  let s = await st(p);
  ok(!s.editable && (s.failed || s.localCopy) && /Couldn’t load/.test(s.msg) && s.retry, `1a blocked, list click: not editable, "Couldn't load" + Try again (${JSON.stringify(s)})`);
  await tryType(p); s = await st(p);
  ok(noQueue(s) && !s.editable, `1a typing does nothing: no "Saved offline", nothing pending (${s.status})`);
  await p.reload({ ignoreCache: true, waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid=note-load-failed], [data-testid=note-local-copy]', { timeout: 10000 }).catch(() => {});
  s = await st(p);
  ok(!s.editable && (s.failed || s.localCopy) && s.retry, `1a blocked, hard reload: not editable + Try again (${s.msg})`);
  await tryType(p); s = await st(p);
  ok(noQueue(s), '1a after reload: typing queues nothing');
  await block([]); await sleep(5000);
  s = await st(p);
  ok(s.editable && s.title === 'R4 Beta' && !s.localCopy && !s.failed, `1a unblocked: recovers on its own, editable (${JSON.stringify({ e: s.editable, t: s.title })})`);
  ok(noQueue(s), '1a unblocked: no "Syncing… pending" (nothing was queued)');
  ok((await server('R4 Beta')).content === before.beta.content && (await server('R4 Beta')).updatedAt === before.beta.updatedAt, '1a server copy of R4 Beta untouched');
  // Whole API blocked (QA's /api/* rule), from the list: same result for the note with a body.
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  await block([`${API}/*`]);
  await p.click(`[data-flip-id="${id('R4 Body')}"] a`);
  await p.waitForSelector('[data-testid=note-load-failed], [data-testid=note-local-copy]', { timeout: 10000 }).catch(() => {});
  s = await st(p);
  ok(!s.editable && s.localCopy && /Body text that must survive/.test(await p.$eval('.cm-content', (x) => x.innerText).catch(() => '')), `1a /api/* blocked: the body shows read-only from this device (${s.msg})`);
  await block([]);

  // 1b. Offline, direct URL hard loads.
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  const net = (offline) => cdp.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await net(true);
  await p.goto(BASE + `/notes/${gamma._id}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForSelector('[data-testid=note-load-failed], .cm-content', { timeout: 10000 }).catch(() => {});
  s = await st(p);
  ok(s.failed && !s.editable && s.title === null && /Couldn’t load this note/.test(s.msg) && s.retry, `1b offline hard load, never-opened note: "Couldn't load this note", no editor (${s.msg})`);
  await p.goto(BASE + `/notes/${id('R4 Alpha')}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForSelector('[data-testid=note-load-failed], [data-testid=note-local-copy]', { timeout: 10000 }).catch(() => {});
  s = await st(p);
  ok(!s.editable && (s.localCopy ? s.title === 'R4 Alpha' : s.failed) && s.retry, `1b offline hard load, note saved on this device: read-only (${JSON.stringify({ t: s.title, m: s.msg })})`);
  await tryType(p); s = await st(p);
  ok(noQueue(s), '1b offline: typing queues nothing');
  await net(false); await sleep(4500);
  s = await st(p);
  ok(s.editable && s.title === 'R4 Alpha', '1b back online: the note opens, editable');
  for (const [k, n] of Object.entries(before)) {
    const now = (await api('GET', `/notes/${n._id}`, null, u.token)).data.note;
    ok(now.content === n.content && now.title === n.title && now.updatedAt === n.updatedAt, `server copy of ${k} untouched`);
  }

  // 1c. A profile with an older build's data: v1 cache key, v2 cache without an owner holding a
  // stale "full" copy. Neither may open an editable note.
  await p.evaluate((gid) => {
    localStorage.setItem('noted.cache', JSON.stringify({ [gid]: { _id: gid, title: 'STALE v1', content: '', tags: [], updatedAt: new Date().toISOString() } }));
    localStorage.setItem('noted.cache.v2', JSON.stringify({ [gid]: { _id: gid, title: 'STALE v2', content: 'stale', tags: [], updatedAt: new Date().toISOString() } }));
    localStorage.removeItem('noted.owner');
  }, gamma._id);
  await net(true);
  await p.goto(BASE + `/notes/${gamma._id}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForSelector('[data-testid=note-load-failed], [data-testid=note-local-copy], .cm-content', { timeout: 10000 }).catch(() => {});
  s = await st(p);
  ok(!s.editable && !/STALE/.test(await p.evaluate(() => document.body.innerText)), `1c older build's caches: no stale copy shown, not editable (${s.msg})`);
  ok(await p.evaluate(() => !localStorage.getItem('noted.cache')), '1c the v1 cache key is removed');
  await net(false);

  // 3. List / Trash / Archive with the API unreachable: calm status + Try again; no fake-looking notes.
  for (const path of ['/notes', '/trash', '/archive']) {
    await p.goto(BASE + path, { waitUntil: 'networkidle0' });
    await block([`${API}/*`]); await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-testid=list-offline], [data-testid=list-error]', { timeout: 10000 }).catch(() => {});
    const t = await p.evaluate(() => { const e = document.querySelector('[data-testid=list-offline], [data-testid=list-error]'); return e ? { text: e.innerText, retry: [...e.querySelectorAll('button')].some((x) => /Try again/.test(x.textContent)) } : null; });
    ok(t && t.retry && !/Failed to fetch/.test(t.text), `${path} with the API blocked: calm status + Try again (${t?.text.replace(/\n/g, ' ')})`);
    await block([]);
  }
  for (const path of ['/trash', '/archive']) {
    await p.goto(BASE + path, { waitUntil: 'networkidle0' }); await p.waitForSelector('[data-testid=empty-state]', { timeout: 8000 }).catch(() => {});
    const pic = await p.evaluate(() => document.querySelector('[data-testid=empty-state] [aria-hidden=true]')?.innerText || '');
    ok(!/Old draft|Old project|Deleted \d|ago/i.test(pic), `${path} empty-state picture has no note-like titles or dates ("${pic.replace(/\n/g, ' ')}")`);
    ok(!/\w/.test(pic) && await p.$('[data-testid=empty-state] > [aria-hidden=true]'), `R5.3 ${path} empty-state picture has no readable words at all, and is aria-hidden ("${pic.trim()}")`);
  }

  // ---------- R5: QA retest 5 ----------
  // R5.1 Offline trash: cached trashed notes can't be restored / deleted for good (server actions).
  const tn = (await api('POST', '/notes', { title: 'R5 Trashed', content: 'x' }, u.token)).data.note;
  await api('DELETE', `/notes/${tn._id}`, null, u.token);
  await p.goto(BASE + '/trash', { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => /R5 Trashed/.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
  const trashButtons = () => p.evaluate(() => [...document.querySelectorAll('button')].filter((x) => /^(Restore|Delete forever|Empty trash)$/.test(x.textContent.trim())).map((x) => ({ t: x.textContent.trim(), d: x.disabled, tip: x.closest('[title]')?.title || '' })));
  ok((await trashButtons()).every((x) => !x.d), 'R5.1 online: Restore / Delete forever / Empty trash enabled');
  await net(true); await sleep(600);
  let tbs = await trashButtons();
  ok(tbs.length >= 3 && tbs.every((x) => x.d && x.tip === 'Needs a connection'), `R5.1 offline: all disabled with "Needs a connection" (${JSON.stringify(tbs)})`);
  await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(2000);
  tbs = await trashButtons();
  ok(/R5 Trashed/.test(await p.evaluate(() => document.body.innerText)) && tbs.length >= 3 && tbs.every((x) => x.d && x.tip === 'Needs a connection'), `R5.1 offline reload: cached item shown, actions disabled (${JSON.stringify(tbs)})`);
  // R5.2 offline, nothing saved for the list: say so instead of "Nothing archived" / "Trash is empty".
  await p.goto(BASE + '/archive', { waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(1500);
  let txt = await p.evaluate(() => document.body.innerText);
  ok(/Nothing saved on this device/.test(txt) && !/Nothing archived/.test(txt), 'R5.2 offline /archive with nothing saved: "Nothing saved on this device", not "Nothing archived"');
  await p.evaluate(() => localStorage.removeItem('noted.cache.v2'));
  await p.goto(BASE + '/trash', { waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(1500);
  txt = await p.evaluate(() => document.body.innerText);
  ok(/Nothing saved on this device/.test(txt) && !/Trash is empty/.test(txt), 'R5.2 offline /trash with nothing saved: "Nothing saved on this device", not "Trash is empty"');
  await net(false); await sleep(2500);
  txt = await p.evaluate(() => document.body.innerText);
  ok(/R5 Trashed/.test(txt) && !/Nothing saved on this device/.test(txt), 'R5.2 back online: the trash loads by itself');
  await api('DELETE', `/notes/${tn._id}?permanent=true`, null, u.token);

  // R5.5 offline hard load of a never-opened note with only a list preview here: honest wording.
  const pv = (await api('POST', '/notes', { title: 'R5 Preview', content: 'preview body '.repeat(5) }, u.token)).data.note;
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' }); await sleep(800);
  await net(true);
  await p.goto(BASE + `/notes/${pv._id}`, { waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(1500);
  let s5 = await st(p);
  ok(s5.failed && !s5.editable && /Couldn’t load this note/.test(s5.msg) && /preview saved on this device/.test(s5.msg) && !/isn’t saved on this device/.test(s5.msg), `R5.5 offline unopened note: "Couldn't load" + "preview saved on this device" (${s5.msg})`);
  await net(false);

  // R5.4 auto-recovery: (a) after reconnecting while noted. still needs a moment, no clicks;
  // (b) one Try again click is enough even if the network isn't back yet.
  await block([`${API}/notes/${pv._id}*`]);
  await p.goto(BASE + `/notes/${pv._id}`, { waitUntil: 'domcontentloaded' }); await sleep(1500);
  ok((await st(p)).failed || (await st(p)).localCopy, 'R5.4 blocked: load failed');
  await net(true); await sleep(1000); await net(false); // the 'online' event fires, requests still fail…
  await sleep(2000); await block([]); //                 …for 2 more seconds
  let t0 = Date.now();
  await p.waitForFunction(() => document.querySelector('.cm-content')?.getAttribute('contenteditable') === 'true', { timeout: 12000 }).catch(() => {});
  ok((await st(p)).editable, `R5.4a recovered on its own after reconnect (${Date.now() - t0}ms after noted. answered, no clicks)`);
  await block([`${API}/notes/${pv._id}*`]);
  await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(1500);
  ok(!(await st(p)).editable, 'R5.4 blocked again after reload');
  await sleep(4000); // the failing backoff is in its longer waits now
  await p.evaluate(() => [...document.querySelectorAll('[data-testid=note-load-failed] button, [data-testid=note-local-copy] button')].find((x) => /Try again/.test(x.textContent)).click());
  await sleep(1200); await block([]); // the click's own attempt failed; the network comes back right after
  t0 = Date.now();
  await p.waitForFunction(() => document.querySelector('.cm-content')?.getAttribute('contenteditable') === 'true', { timeout: 4000 }).catch(() => {});
  ok((await st(p)).editable, `R5.4b one Try again click was enough (${Date.now() - t0}ms after unblocking)`);
  ok(p.errors.length === 0, `no page errors (${p.errors.join(' | ')})`);
  await cdp.detach(); await p.close();

  // ---------- 2. Cross-account isolation in one profile ----------
  const A = await newUser('v7a');
  const ctx = b.defaultBrowserContext();
  const q = await ctx.newPage(); await q.setViewport({ width: 1280, height: 800 });
  await q.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await q.evaluate(() => { localStorage.clear(); localStorage.setItem('noted.tourDone', '1'); }); // the first account signs out of this profile
  await login(q, A.email); await q.waitForSelector('main');
  const secrets = ['Asecret kept note', 'Asecret trashed note', 'Asecret archived note'];
  for (const t of secrets) await capture(q, t);
  const aNotes = (await api('GET', '/notes', null, A.token)).data.notes;
  const aid = (t) => aNotes.find((n) => n.title === t)._id;
  await api('DELETE', `/notes/${aid(secrets[1])}`, null, A.token);
  await api('PATCH', `/notes/${aid(secrets[2])}/archive`, null, A.token);
  for (const path of ['/notes', '/trash', '/archive', `/notes/${aid(secrets[0])}`]) { await q.goto(BASE + path, { waitUntil: 'networkidle0' }); await sleep(400); }
  ok(await q.evaluate(() => /Asecret/.test(JSON.stringify(localStorage))), '2 setup: A has notes cached on this device');
  const leak = async (pg, label) => {
    const r = await pg.evaluate(async () => {
      const ls = JSON.stringify(localStorage);
      let idb = '';
      try {
        for (const d of await indexedDB.databases()) {
          // any database left must hold nothing of A's (noted-undo keys are `<userId>:<noteId>`)
          const keys = await new Promise((res) => { const r = indexedDB.open(d.name); r.onsuccess = () => { const db = r.result; const out = []; let left = db.objectStoreNames.length; if (!left) { db.close(); res(out); } for (const s of db.objectStoreNames) { const g = db.transaction(s).objectStore(s).getAllKeys(); g.onsuccess = () => { out.push(...g.result.map(String)); if (!--left) { db.close(); res(out); } }; } }; r.onerror = () => res([]); });
          idb += `${d.name}(${keys.length} keys: ${keys.join(',').slice(0, 80)});`;
        }
      } catch { /* ignore */ }
      let api = [];
      try { for (const k of await caches.keys()) { const c = await caches.open(k); api = api.concat((await c.keys()).map((r) => r.url).filter((u) => u.includes('/api/'))); } } catch { /* ignore */ }
      return { ls, idb, api, body: document.body.innerText };
    });
    const ids = aNotes.map((n) => n._id);
    const hit = /Asecret/.test(r.ls + r.body) || ids.some((x) => r.ls.includes(x) || r.body.includes(x) || r.idb.includes(x)) || r.idb.includes(A.user.id) || r.api.length > 0;
    ok(!hit, `${label}: no trace of account A (localStorage, page, cached API responses: ${r.api.length}; idb: ${r.idb || 'none'})`);
  };
  // A edits a note (editor undo history goes to IndexedDB), then logs out from the editor itself
  await q.goto(BASE + `/notes/${aid(secrets[0])}`, { waitUntil: 'networkidle0' });
  await q.waitForFunction(() => document.querySelector('.cm-content')?.getAttribute('contenteditable') === 'true', { timeout: 10000 });
  await q.evaluate(() => document.querySelector('.cm-content').focus()); await q.keyboard.type(' Asecret typed'); await sleep(1800);
  ok(await q.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === 'noted-undo')), 'R5.6 setup: A has editor undo history in IndexedDB');
  await q.click('[data-testid=account-menu]'); await q.waitForSelector('[role=menuitem]');
  await q.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].find((x) => /Log out/.test(x.textContent)).click());
  await q.waitForFunction(() => location.pathname === '/login' || location.pathname === '/', { timeout: 10000 });
  await sleep(1000); // let an unmounting editor try to write its undo history
  await leak(q, '2 after logout (R5.6 incl. IndexedDB contents)');
  await q.reload({ waitUntil: 'networkidle0' }); await sleep(800);
  await leak(q, '2 after logout + reload');
  const bEmail = `v7b+${Date.now()}@noted.test`;
  await register(q, bEmail);
  for (const path of ['/notes', '/trash', '/archive', '/stats']) { await q.goto(BASE + path, { waitUntil: 'networkidle0' }); await sleep(500); await leak(q, `2 B online ${path}`); }
  const qc = await q.target().createCDPSession();
  await qc.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  for (const path of ['/notes', '/trash', '/archive', `/notes/${aid(secrets[0])}`]) { await q.goto(BASE + path, { waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(1200); await leak(q, `2 B offline ${path}`); }
  await qc.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  // Account switch without logging out: A signs in again and browses (A's data cached), then another
  // tab puts B's session in storage directly. This tab must start over as B, not keep A's data.
  const bTok = created.find((c) => c.email === bEmail).token;
  const bUser = (await api('GET', '/auth/me', null, bTok)).data.user;
  await q.evaluate(() => { localStorage.removeItem('noted.token'); });
  await login(q, A.email); for (const path of ['/notes', '/trash', '/archive']) { await q.goto(BASE + path, { waitUntil: 'networkidle0' }); await sleep(300); }
  ok(await q.evaluate(() => /Asecret/.test(JSON.stringify(localStorage))), '2 A signed in again and cached');
  ok(await q.evaluate(() => !localStorage.getItem('noted.tourPending')), "2 B's pending welcome tour doesn't follow into A's session");
  const q2 = await ctx.newPage(); await q2.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await q2.evaluate((t, usr) => { localStorage.setItem('noted.token', t); localStorage.setItem('noted.user', JSON.stringify(usr)); }, bTok, bUser);
  await sleep(2500);
  await q.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 }).catch(() => {});
  await sleep(1500);
  await leak(q, '2 other tab switched to B (token set directly, no logout)');
  await q2.close(); await q.close();
} finally { await cleanup(); await b.close(); }
