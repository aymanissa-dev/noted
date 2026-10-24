// images: image uploads in notes (paste, drop, toolbar picker, /image), compression + EXIF stripping,
// render + reload (from the local cache), lightbox, alt text, offline "Needs a connection" + retry,
// SVG rejection, lock (423 / PIN), Markdown export with images/, delete cleanup, logout wipes the
// image cache, 375px mobile + dark mode. Runs against production with BASE/API.
import { launch, newUser, api, ok, cleanup, BASE, API, sleep, pageAs, noScroll } from './h.mjs';
import { mkdirSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import JSZip from '../server/node_modules/jszip/lib/index.js';
const FIX = fileURLToPath(new URL('./fixtures/', import.meta.url));
const b = await launch();
const ID_RE = /noted-image:([a-f0-9]{24})/g;
const ids = (s) => [...(s || '').matchAll(ID_RE)].map((m) => m[1]);
const getImage = async (id, token, unlock) => {
  const r = await fetch(`${API}/images/${id}`, { headers: { Authorization: `Bearer ${token}`, ...(unlock && { 'X-Unlock-Token': unlock }) } });
  return { status: r.status, headers: r.headers, bytes: Buffer.from(await r.arrayBuffer()) };
};
const noteOf = async (id, token) => (await api('GET', `/notes/${id}`, null, token)).data.note;
const waitContent = async (id, token, pred, ms = 15000) => {
  const end = Date.now() + ms; let n;
  while (Date.now() < end) { n = await noteOf(id, token); if (pred(n?.content || '')) return n; await sleep(400); }
  return n;
};
const cdp = async (p) => p._cdp || (p._cdp = await p.target().createCDPSession());
const net = async (p, opts) => { const c = await cdp(p); await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, ...opts }); };
// A File made in the page (canvas → PNG with transparency, or noisy JPEG), then pasted / dropped.
const makeFile = (p, { w = 320, h = 200, type = 'image/png', name = 'pic.png', alpha = true } = {}) => p.evaluateHandle(async (w, h, type, name, alpha) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (!alpha) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
  g.fillStyle = '#3b82f6'; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) / 3, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${i * 37 % 360} 70% 50%)`; g.fillRect((i * 97) % w, (i * 53) % h, 6, 6); }
  const blob = await new Promise((r) => c.toBlob(r, type, 0.95));
  return new File([blob], name, { type });
}, w, h, type, name, alpha);
const paste = (p, file) => p.evaluate((f) => {
  const dt = new DataTransfer(); dt.items.add(f);
  document.querySelector('.cm-content').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, file);
const drop = (p, file) => p.evaluate((f) => {
  const dt = new DataTransfer(); dt.items.add(f);
  const t = document.querySelector('.cm-content'); const r = t.getBoundingClientRect();
  const o = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 };
  t.dispatchEvent(new DragEvent('dragover', o));
  const marked = document.querySelector('.cm-editor').classList.contains('cm-drop-target');
  t.dispatchEvent(new DragEvent('drop', o));
  return marked;
}, file);
const frames = (p) => p.$$eval('.cm-image-frame img', (xs) => xs.filter((x) => x.src.startsWith('blob:') && x.complete && x.naturalWidth > 0).length);
const endOfDoc = async (p) => { await p.$eval('.cm-content', (e) => e.focus()); await p.keyboard.down('Control'); await p.keyboard.press('End'); await p.keyboard.up('Control'); };

try {
  const u = await newUser('img');
  const n = (await api('POST', '/notes', { title: 'Pictures', content: 'Intro line' }, u.token)).data.note;
  const p = await pageAs(b, u.token, u.user);
  await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.cm-content'); await endOfDoc(p);

  // 1. Paste a transparent PNG
  await paste(p, await makeFile(p));
  let note = await waitContent(n._id, u.token, (c) => ids(c).length === 1);
  const [pasted] = ids(note.content);
  ok(Boolean(pasted), 'paste: markdown ![…](noted-image:id) saved ' + JSON.stringify(note.content));
  await p.waitForFunction(() => document.querySelectorAll('.cm-image-frame img[src^="blob:"]').length >= 1, { timeout: 10000 }).catch(() => {});
  ok(await frames(p) === 1, 'paste: image renders inline in the editor');
  let img = await getImage(pasted, u.token);
  ok(img.status === 200 && /^image\/(webp|png)$/.test(img.headers.get('content-type')), 'paste: stored as ' + img.headers.get('content-type'));
  ok(img.headers.get('x-content-type-options') === 'nosniff' && /immutable/.test(img.headers.get('cache-control')), 'serve: nosniff + private immutable cache');

  // 2. Drop a large JPEG (slow network → placeholder with progress, then swapped in). Resized to ≤2000px.
  await net(p, { latency: 600, uploadThroughput: 150 * 1024 });
  await endOfDoc(p);
  const big = await makeFile(p, { w: 3200, h: 1800, type: 'image/jpeg', name: 'big.jpg', alpha: false });
  ok(await drop(p, big), 'drop: editor highlights as a drop target on dragover');
  const sawPlaceholder = await p.waitForSelector('.cm-image-upload [role=progressbar]', { timeout: 8000 }).then(() => true).catch(() => false);
  ok(sawPlaceholder, 'drop: upload placeholder with a progress bar');
  note = await waitContent(n._id, u.token, (c) => ids(c).length === 2, 30000);
  await net(p, {});
  const dropped = ids(note.content).find((x) => x !== pasted);
  img = await getImage(dropped, u.token);
  const dw = +img.headers.get('x-image-width'), dh = +img.headers.get('x-image-height');
  ok(img.status === 200 && Math.max(dw, dh) <= 2000 && dw > 1000, `drop: resized to ${dw}×${dh} (long side ≤ 2000)`);
  ok(img.bytes.length < 3 * 1024 * 1024, 'drop: under the 3 MB cap (' + img.bytes.length + ' bytes)');
  await p.waitForFunction(() => !document.querySelector('.cm-image-upload'), { timeout: 10000 }).catch(() => {});
  ok(!(await p.$('.cm-image-upload')), 'drop: placeholder swapped for the image');
  ok(note.content.startsWith('Intro line\n'), 'drop: mid-line drop goes on its own line (text not split)');

  // 3. Toolbar button → file picker, with a photo carrying EXIF + GPS → stripped
  await endOfDoc(p);
  const [chooser] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }), p.click('[data-testid=add-image]')]);
  ok(chooser.isMultiple(), 'picker: toolbar "Image" opens a multi-file picker');
  await chooser.accept([FIX + 'gps-photo.jpg']);
  note = await waitContent(n._id, u.token, (c) => ids(c).length === 3, 30000);
  const picked = ids(note.content).find((x) => x !== pasted && x !== dropped);
  img = await getImage(picked, u.token);
  ok(img.status === 200, 'picker: uploaded');
  ok(!img.bytes.includes(Buffer.from('Exif')) && !img.bytes.includes(Buffer.from('NotedTestCam')), 'picker: EXIF/GPS stripped before upload');
  ok(/!\[gps photo\]\(noted-image:/.test(note.content), 'picker: alt text from the file name');

  // 4. /image slash command → picker; then cancel (no change)
  await endOfDoc(p); await p.keyboard.press('Enter'); await p.keyboard.type('/image'); await sleep(300);
  const [ch2] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }).catch(() => null), p.keyboard.press('Enter')]);
  ok(Boolean(ch2), '/image opens the file picker');
  if (ch2) await ch2.cancel();
  await sleep(1500);
  ok(!(await p.$eval('.cm-content', (e) => e.innerText.includes('/image'))), '/image text removed');

  // 5. SVG rejected client-side (and the server rejects it too)
  await endOfDoc(p);
  const svg = await p.evaluateHandle(() => new File(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'], 'x.svg', { type: 'image/svg+xml' }));
  await paste(p, svg); await sleep(800);
  ok(await p.evaluate(() => /SVG|PNG, JPEG, WebP or GIF/i.test(document.body.innerText)), 'svg: rejected with a clear message');
  const svgUp = await fetch(`${API}/notes/${n._id}/images`, { method: 'POST', headers: { Authorization: `Bearer ${u.token}`, 'Content-Type': 'image/svg+xml' }, body: readFileSync(FIX + 'evil.svg') });
  ok(svgUp.status === 415, 'svg: server says 415');

  // 6. Reload: images come back (cache), lightbox, alt text
  await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('.cm-content');
  await p.waitForFunction(() => document.querySelectorAll('.cm-image-frame img[src^="blob:"]').length >= 3, { timeout: 10000 }).catch(() => {});
  ok(await frames(p) === 3, 'reload: all three images render');
  ok(await p.evaluate(async () => (await (await caches.open('noted-images-v1')).keys()).length >= 3), 'reload: images kept in the local image cache');
  ok(await p.$eval('.cm-image-frame img', (i) => i.loading === 'lazy'), 'images are lazy-loaded');
  await p.click('.cm-image-frame');
  ok(await p.waitForSelector('[data-testid=lightbox-image]', { timeout: 3000 }).then(() => true).catch(() => false), 'lightbox opens on click');
  await p.keyboard.press('Escape'); await sleep(300);
  ok(!(await p.$('[data-testid=lightbox-image]')), 'lightbox closes with Escape');
  await p.hover('.cm-image'); await p.click('.cm-image-alt');
  await p.waitForSelector('#prompt-input');
  await p.$eval('#prompt-input', (i) => { i.select(); }); await p.keyboard.type('Blue circle on white');
  await p.keyboard.press('Enter');
  note = await waitContent(n._id, u.token, (c) => c.includes('![Blue circle on white](noted-image:'));
  ok(note.content.includes('![Blue circle on white](noted-image:'), 'alt text edited');

  // 7. Offline: "Needs a connection", then Retry once back online
  await (await cdp(p)).send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await sleep(500); await endOfDoc(p);
  await paste(p, await makeFile(p, { name: 'offline.png' })); await sleep(800);
  ok(await p.evaluate(() => /Needs a connection/.test(document.body.innerText)), 'offline: "Needs a connection"');
  ok(await frames(p) === 3, 'offline: already-viewed images still show');
  await net(p, {}); await sleep(800);
  await paste(p, await makeFile(p, { name: 'online.png' }));
  note = await waitContent(n._id, u.token, (c) => ids(c).length === 4, 20000);
  ok(ids(note.content).length === 4, 'back online: upload works');
  ok(p.errors.length === 0, 'desktop: no page errors ' + p.errors.join('|'));

  // 8. Markdown export: images/ folder with relative links, no manifest left
  const dl = '/tmp/noted-e2e-dl'; rmSync(dl, { recursive: true, force: true }); mkdirSync(dl, { recursive: true });
  await (await cdp(p)).send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl }).catch(async () => (await cdp(p)).send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl }));
  await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Markdown \(\.zip\)/.test(x.textContent))?.click());
  let zipName; for (let i = 0; i < 40 && !zipName; i++) { await sleep(500); zipName = readdirSync(dl).find((f) => f.endsWith('.zip')); }
  ok(Boolean(zipName), 'export: zip downloaded');
  if (zipName) {
    const zip = await JSZip.loadAsync(readFileSync(`${dl}/${zipName}`));
    const files = Object.keys(zip.files);
    const imgs = files.filter((f) => /^images\/[a-f0-9]{24}\.(webp|png|jpg|gif)$/.test(f));
    const md = await zip.file(files.find((f) => f.endsWith('.md') && !f.startsWith('images/'))).async('string');
    ok(imgs.length === 4, 'export: 4 images in images/ ' + files.join(','));
    ok(!files.includes('images/manifest.json') && !files.includes('images/MISSING.txt'), 'export: no manifest/missing list left');
    ok(/!\[Blue circle on white\]\(images\/[a-f0-9]{24}\.\w+\)/.test(md) && !md.includes('noted-image:'), 'export: relative links in the .md');
    const first = await zip.file(imgs[0]).async('nodebuffer');
    ok(first.length > 100, 'export: image bytes present');
  }
  await p.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' });

  // 9. Lock: 423 without unlock; UI shows images after the PIN
  await api('PUT', '/auth/lock-pin', { password: 'quiet-otter-lamp-91', pin: '123456' }, u.token);
  await api('PATCH', `/notes/${n._id}/lock`, { locked: true }, u.token);
  ok((await getImage(pasted, u.token)).status === 423, 'locked: image → 423 without unlock');
  const q = await pageAs(b, u.token, { ...u.user, hasLockPin: true });
  await q.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' });
  await q.waitForSelector('input[inputmode=numeric]');
  await q.type('input[inputmode=numeric]', '123456'); await q.keyboard.press('Enter');
  await q.waitForSelector('.cm-content');
  await q.waitForFunction(() => document.querySelectorAll('.cm-image-frame img[src^="blob:"]').length >= 4, { timeout: 10000 }).catch(() => {});
  ok(await frames(q) === 4, 'locked: images show after entering the PIN');
  await sleep(500);
  const lockedLeft = await q.evaluate(async () => (await (await caches.open('noted-images-v1')).keys()).map((k) => k.url.slice(-24)));
  ok(lockedLeft.length === 0, 'locked: locked images are not kept in the persistent cache (lock purged them)');
  await q.close();
  await api('PATCH', `/notes/${n._id}/lock`, { locked: false, pin: '123456' }, u.token);
  await p.close();

  // 10. Another user can't see them
  const v = await newUser('img2');
  ok((await getImage(pasted, v.token)).status === 404, 'another user → 404');

  // 11. Mobile 375px, dark mode: renders, menu "Add image", no sideways scroll
  const m = await pageAs(b, u.token, u.user, { width: 375, height: 740, mobile: true, dark: true });
  await m.goto(`${BASE}/notes/${n._id}`, { waitUntil: 'networkidle0' }); await m.waitForSelector('.cm-content');
  await m.waitForFunction(() => document.querySelectorAll('.cm-image-frame img[src^="blob:"]').length >= 1, { timeout: 10000 }).catch(() => {});
  ok(await m.evaluate(() => document.documentElement.classList.contains('dark')), 'mobile: dark mode on');
  ok(await m.$eval('.cm-image-frame img', (i) => i.getBoundingClientRect().width <= 375), 'mobile: image fits the width');
  ok(await noScroll(m), 'mobile: no sideways scroll');
  const bg = await m.$eval('.cm-image-frame', (e) => getComputedStyle(e).backgroundColor);
  ok(bg === 'rgb(41, 37, 36)', 'dark: image frame uses the dark surface ' + bg);
  await m.screenshot({ path: '/tmp/images-mobile-dark.png' });
  await m.click('[data-testid=note-more]'); await sleep(300);
  const hasMenu = await m.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].some((x) => /Add image/.test(x.textContent)));
  ok(hasMenu, 'mobile: "Add image" in the note menu');
  if (hasMenu) {
    const [c3] = await Promise.all([m.waitForFileChooser({ timeout: 5000 }).catch(() => null), m.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].find((x) => /Add image/.test(x.textContent)).click())]);
    ok(Boolean(c3) && (await m.$eval('[data-testid=image-file-input]', (i) => i.accept).catch(() => 'image/*')) === 'image/*', 'mobile: opens the photo/camera picker (accept=image/*)');
    if (c3) await c3.cancel();
  }
  ok(m.errors.length === 0, 'mobile: no page errors ' + m.errors.join('|'));
  await m.close();

  // 12. Delete cleanup: trash keeps images, permanent delete removes them
  const all = ids((await noteOf(n._id, u.token)).content);
  await api('DELETE', `/notes/${n._id}`, null, u.token);
  ok((await getImage(all[0], u.token)).status === 200, 'trash: images kept');
  const del = await api("DELETE", `/notes/${n._id}?permanent=true`, null, u.token);
  const after = await Promise.all(all.map(async (id) => (await getImage(id, u.token)).status));
  ok([200, 204].includes(del.status) && after.every((s) => s === 404), `permanent delete: images gone (${del.status}; ${after})`);

  // 13. Logout wipes the local image cache
  const n2 = (await api('POST', '/notes', { title: 'Two', content: '' }, u.token)).data.note;
  const z = await pageAs(b, u.token, u.user);
  await z.goto(`${BASE}/notes/${n2._id}`, { waitUntil: 'networkidle0' }); await z.waitForSelector('.cm-content'); await z.click('.cm-content');
  await paste(z, await makeFile(z));
  await z.waitForFunction(() => document.querySelectorAll('.cm-image-frame img[src^="blob:"]').length >= 1, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const before = await z.evaluate(async () => (await (await caches.open('noted-images-v1')).keys()).length);
  await z.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label')?.match(/account|menu/i) && x.closest('header,nav,aside'))?.click()); await sleep(300);
  await z.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].find((x) => /Log out/.test(x.textContent))?.click());
  await z.waitForFunction(() => location.pathname === '/login', { timeout: 5000 }).catch(() => {});
  await sleep(800);
  const left = await z.evaluate(async () => ((await caches.has('noted-images-v1')) ? (await (await caches.open('noted-images-v1')).keys()).length : 0));
  ok(before >= 1 && left === 0, `logout: local image cache wiped (${before} → ${left})`);
  await z.close();
} finally { await cleanup(); await b.close(); }
