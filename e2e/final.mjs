// QA final pass on 961c36b, items a–f. Local stack (or BASE/API for prod, no sign-up beyond one).
import { launch, newUser, pageAs, api, ok, cleanup, BASE, API, sleep } from './h.mjs';
const b = await launch();
const menu = async (p, re) => {
  await p.click('[aria-label="More actions"]'); await p.waitForSelector('[role=menuitem]');
  await p.evaluate((src) => [...document.querySelectorAll('[role=menuitem]')].find((x) => new RegExp(src).test(x.textContent)).click(), re.source);
};
try {
  const u = await newUser('final');
  const page = async (opts) => { const p = await pageAs(b, u.token, u.user, opts); await p.evaluate(() => localStorage.setItem('noted.tourDone', '1')); return p; };

  // (a) PIN copy: 6 digits, nowhere "4–6"
  {
    const p = await page();
    const n = (await api('POST', '/notes', { title: 'Copy check' }, u.token)).data.note;
    await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' });
    await menu(p, /Lock with PIN/);
    await p.waitForSelector('[role=dialog], [role=alertdialog]');
    const txt = await p.$eval('[role=dialog], [role=alertdialog]', (d) => d.innerText);
    ok(/6-digit PIN/.test(txt) && !/4\s*[–-]\s*6/.test(txt), `a: "Set a PIN first" says 6-digit (${txt.replace(/\s+/g, ' ').slice(0, 90)})`);
    const html = await (await fetch(BASE + '/')).text();
    const js = await Promise.all([...html.matchAll(/assets\/[\w.-]+\.js/g)].map(async (m) => (await fetch(`${BASE}/${m[0]}`)).text()));
    ok(!js.some((s) => /4[–-]6[ -]digit/.test(s)), 'a: no "4–6 digit" copy in the entry bundle');
    await p.close();
  }

  // (c) the account-deleted banner goes away once you start typing / submit
  {
    const ctx = await b.createBrowserContext(); // signed out
    const p = await ctx.newPage();
    await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => sessionStorage.setItem('noted.flash', 'Your account and all of your notes were deleted.'));
    await p.goto(BASE + '/login', { waitUntil: 'networkidle0' });
    ok(!!(await p.$('[data-testid=login-flash]')), 'c: banner shows on arrival');
    await p.type('input[type=email]', 'x');
    ok(!(await p.$('[data-testid=login-flash]')), 'c: banner cleared on first input');
    await p.reload({ waitUntil: 'networkidle0' });
    ok(!(await p.$('[data-testid=login-flash]')), 'c: banner shown only once');
    await ctx.close();
  }

  // (d) new note whose create reached the server but whose answer was lost (reload mid-request):
  // one note on the server, and the local link / list lead to the real id after sync.
  {
    const p = await page();
    await p.goto(`${BASE}/notes`, { waitUntil: 'networkidle0' });
    await p.setRequestInterception(true);
    let lost = 0;
    p.on('request', async (req) => {
      if (!lost && req.method() === 'POST' && /\/api\/notes$/.test(req.url())) {
        lost++;
        const h = { ...req.headers() }; if (new URL(API).hostname === 'localhost') h['x-rate-limit-bypass'] = 'local-e2e';
        await fetch(req.url(), { method: 'POST', headers: h, body: req.postData() }); // the server gets it…
        return req.abort('failed'); // …the page never hears back
      }
      req.continue();
    });
    await p.goto(`${BASE}/notes/new`, { waitUntil: 'networkidle0' }); await p.waitForSelector('input[aria-label=Title]');
    await p.type('input[aria-label=Title]', 'Reload race note');
    await p.waitForFunction(() => location.pathname.startsWith('/notes/local-'), { timeout: 8000 }).catch(() => {});
    const localHref = await p.evaluate(() => (location.pathname.startsWith('/notes/local-') ? location.pathname : null));
    ok(!!localHref && lost === 1, `d: lost answer → note waits under a local id (${localHref})`);
    await p.goto(`${BASE}/notes`, { waitUntil: 'networkidle0' });
    await p.waitForFunction(() => !document.querySelector('a[href^="/notes/local-"]') && [...document.querySelectorAll('a[href^="/notes/"]')].some((a) => /Reload race note/.test(a.innerText)), { timeout: 15000 }).catch(() => {});
    const after = await p.evaluate(() => [...document.querySelectorAll('a[href^="/notes/"]')].filter((a) => /Reload race note/.test(a.innerText)).map((a) => a.getAttribute('href')));
    const server = (await api('GET', '/notes', null, u.token)).data.notes.filter((n) => n.title === 'Reload race note' || /Reload race note/.test(n.content || ''));
    ok(server.length === 1, `d: exactly one note on the server (${server.length})`);
    ok(after.length === 1 && after[0] === `/notes/${server[0]?._id}`, `d: list links to the real id after sync (${after})`);
    if (process.env.DEBUG) console.log('idmap', await p.evaluate(() => localStorage.getItem('noted.idmap')), await p.evaluate(() => localStorage.getItem('noted.queue')));
    await p.goto(BASE + localHref, { waitUntil: 'networkidle0' });
    await p.waitForFunction((id) => location.pathname === `/notes/${id}`, { timeout: 8000 }, server[0]?._id).catch(() => {});
    ok(p.url().endsWith(`/notes/${server[0]?._id}`), `d: old local link redirects to the real id (${new URL(p.url()).pathname})`);
    await p.goBack({ waitUntil: 'networkidle0' }).catch(() => {});
    ok(!/local-/.test(new URL(p.url()).pathname), `d: the local URL was replaced in history (back → ${new URL(p.url()).pathname})`);
    await p.close();
  }

  // (e) unlock window: trash and delete-forever from the open (unlocked) editor don't re-ask
  {
    await api('PUT', '/auth/lock-pin', { password: 'quiet-otter-lamp-91', pin: '864213' }, u.token);
    const n = (await api('POST', '/notes', { title: 'Locked e', content: 'x' }, u.token)).data.note;
    await api('PATCH', `/notes/${n._id}/lock`, { locked: true }, u.token);
    const p = await pageAs(b, u.token, { ...u.user, hasLockPin: true });
    const unlockHere = async () => {
      await p.waitForSelector('input[inputmode=numeric], input[type=password]');
      await p.type('input[inputmode=numeric], input[type=password]', '864213'); await p.keyboard.press('Enter');
      await p.waitForSelector('.cm-content');
    };
    await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' }); await unlockHere();
    await menu(p, /Move to trash/);
    await p.waitForFunction(() => location.pathname === '/notes', { timeout: 5000 }).catch(() => {});
    await sleep(800);
    const t = (await api('GET', '/notes?view=trash', null, u.token)).data.notes.some((x) => x._id === n._id);
    ok(t && !(await p.$('[role=dialog] input[type=password]')), 'e: move to trash inside the unlock window needs no second PIN');
    await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' }); await unlockHere();
    await menu(p, /Delete forever/);
    await p.waitForSelector('[role=alertdialog] button[data-confirm]'); await p.click('[role=alertdialog] button[data-confirm]');
    await p.waitForFunction(() => location.pathname === '/trash', { timeout: 5000 }).catch(() => {});
    const gone = (await api('GET', `/notes/${n._id}`, null, u.token)).status;
    ok(gone === 404 && new URL(p.url()).pathname === '/trash', `e: delete forever inside the window needs no second PIN (GET → ${gone})`);
    await p.close();
  }

  // (f) manifest: wide + narrow screenshots, 96×96 icons on every shortcut, all loadable
  {
    const p = await b.newPage();
    await p.goto(BASE + '/login', { waitUntil: 'networkidle0' });
    const href = await p.$eval('link[rel=manifest]', (l) => l.href);
    const m = await (await fetch(href)).json();
    const ff = (m.screenshots || []).map((s) => s.form_factor).sort().join(',');
    ok(ff === 'narrow,wide', `f: screenshots for wide and narrow (${ff})`);
    ok((m.shortcuts || []).length >= 2 && m.shortcuts.every((s) => s.icons?.some((i) => i.sizes === '96x96')), 'f: every shortcut has a 96×96 icon');
    const imgs = [...m.screenshots.map((s) => [s.src, s.sizes]), ...m.shortcuts.flatMap((s) => s.icons.map((i) => [i.src, i.sizes]))];
    for (const [src, sizes] of imgs) {
      const real = await p.evaluate(async (u) => { const r = await fetch(u); if (!r.ok) return `HTTP ${r.status}`; const bm = await createImageBitmap(await r.blob()); return `${bm.width}x${bm.height}`; }, new URL(src, href).href);
      ok(real === sizes, `f: ${src} loads at its declared size (${real} vs ${sizes})`);
    }
    await p.close();
  }
} finally { await b.close(); await cleanup(); }
