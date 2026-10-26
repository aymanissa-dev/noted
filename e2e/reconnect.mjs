// reconnect: after the network comes back, the offline banner clears fast (health probe every ~1s
// for 15s), even when the first probes still fail; a fake "online" never clears it.
import { launch, newUser, ok, cleanup, BASE, sleep, pageAs } from './h.mjs';
const b = await launch();
const BLOCK_MS = Number(process.env.RECONNECT_BLOCK_MS || 8000); // the network "settling" after reconnect
try {
  const u = await newUser('rec');
  const p = await pageAs(b, u.token, u.user);
  await p.goto(`${BASE}/notes`, { waitUntil: 'networkidle0' });
  const c = await p.target().createCDPSession(); await c.send('Network.enable');
  const cond = (offline) => c.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  let blockUntil = 0; let probes = 0;
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    if (/\/api\/health/.test(r.url())) { probes++; if (Date.now() < blockUntil) return r.abort('internetdisconnected'); }
    r.continue();
  });
  const banner = () => p.$eval('[data-testid=sync-banner]', (e) => e.textContent).catch(() => '');
  await cond(true); await sleep(1500);
  ok(/offline/i.test(await banner()), 'offline: banner shows');
  // Fake online: the event fires but the network is still down → stays offline.
  await p.evaluate(() => window.dispatchEvent(new Event('online'))); await sleep(2000);
  ok(!/Back online/.test(await banner()) && /offline/i.test(await banner()), 'fake online: banner stays offline');
  // Real reconnect, but health requests keep failing for BLOCK_MS (network still settling).
  await sleep(20000); // a long time offline must not slow the recovery down
  blockUntil = Date.now() + BLOCK_MS; probes = 0;
  const t0 = Date.now(); await cond(false);
  let cleared = null;
  for (;;) {
    const t = await banner();
    if (!/offline/i.test(t)) { cleared = Date.now() - t0; break; }
    if (Date.now() - t0 > 60000) break;
    await sleep(100);
  }
  console.log(`reconnect: offline banner cleared ${cleared === null ? 'never (60s)' : (cleared / 1000).toFixed(1) + 's'} after the network came back (health blocked for ${BLOCK_MS / 1000}s, ${probes} probes)`);
  ok(cleared !== null && cleared <= BLOCK_MS + 2500, `reconnect: clears within ~1s of health answering (${cleared}ms)`);
  ok(cleared === null || cleared >= BLOCK_MS - 200, 'reconnect: not before noted. answers');
  ok(p.errors.length === 0, 'no page errors ' + p.errors.join('|'));
} finally { await b.close(); await cleanup(); }
