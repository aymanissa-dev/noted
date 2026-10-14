// Browser checks for the QA retest fixes. ONLY=history,capture,... runs a subset.
import { launch, newUser, pageAs, api, ok, cleanup, BASE, sleep } from './h.mjs';
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const b = await launch();
const errors = [];
const page = async (u, opts) => { const p = await pageAs(b, u.token, u.user, opts); p.on('pageerror', (e) => errors.push(e.message)); return p; };
const typeInEditor = async (p, text) => { await p.click('.cm-content'); await p.keyboard.press('End'); await p.keyboard.down('Control'); await p.keyboard.press('End'); await p.keyboard.up('Control'); await p.keyboard.type(text); };
const saved = (p) => p.waitForFunction(() => /saved/.test(document.querySelector('[data-testid=save-status]')?.dataset.state || ''), { timeout: 15000 });
try {
  // ---- 1. history: QA repro ----
  if (want('history')) {
    const u = await newUser('fix');
    const n = (await api('POST', '/notes', { title: 'Beta pancakes', content: 'Body of Beta pancakes' }, u.token)).data.note;
    const p = await page(u);
    await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
    for (const t of [' edit one', ' edit two', ' edit three']) { await typeInEditor(p, t); await saved(p); await sleep(3500); }
    let vs = (await api('GET', `/notes/${n._id}/versions`, null, u.token)).data.versions;
    ok(vs.length === 1 && vs[0].preview === 'Body of Beta pancakes', `history: original kept after the first edit (${vs.length} version)`);
    await p.click('[aria-label="Version history"]'); await p.waitForSelector('[data-testid=history-current]');
    const listText = await p.$eval('[role=dialog] ul', (e) => e.innerText);
    ok(/Current version/.test(listText) && (listText.match(/chars/g) || []).length === 2, 'history panel lists the current version + the original');
    await p.keyboard.press('Escape');
    // reopen (new session) → first edit snapshots the state left behind
    await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
    await typeInEditor(p, ' next day'); await saved(p);
    vs = (await api('GET', `/notes/${n._id}/versions`, null, u.token)).data.versions;
    ok(vs.length === 2 && /edit three$/.test(vs[0].preview), 'history: reopening and editing keeps a new version');
    // cumulative change: many small saves add up to a version
    for (let i = 0; i < 4; i++) { await typeInEditor(p, ' ' + 'word '.repeat(18)); await saved(p); }
    vs = (await api('GET', `/notes/${n._id}/versions`, null, u.token)).data.versions;
    ok(vs.length === 3, `history: ~360 chars typed over 4 saves → another version (${vs.length})`);
  }
  // @@NEXT@@
  ok(!errors.length, 'no page errors ' + errors.join(' | '));
} finally { await cleanup(); await b.close(); }
