// Service worker offline behaviour: API calls are left to the page (no "no-response" rejections in the SW),
// the app shell still loads offline, and offline writes queue without page errors.
import { launch, newUser, pageAs, ok, cleanup, BASE, sleep } from './h.mjs';
const b = await launch();
try {
  const u = await newUser('sw');
  const p = await pageAs(b, u.token, u.user);
  await p.evaluate(() => localStorage.setItem('noted.tourDone', '1'));
  await p.goto(BASE + '/notes', { waitUntil: 'networkidle0' });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload({ waitUntil: 'networkidle0' });
  ok(await p.evaluate(() => !!navigator.serviceWorker.controller), 'page is controlled by the service worker');
  const swt = await b.waitForTarget((t) => t.type() === 'service_worker', { timeout: 10000 });
  const s = await swt.createCDPSession(); const swErrors = [];
  s.on('Runtime.exceptionThrown', (e) => swErrors.push(e.exceptionDetails?.exception?.description || e.exceptionDetails?.text));
  s.on('Runtime.consoleAPICalled', (e) => { if (e.type === 'error') swErrors.push(e.args.map((a) => a.value || a.description).join(' ')); });
  await s.send('Runtime.enable');
  const net = await p.createCDPSession(); await net.send('Network.enable');
  const cond = (offline) => ({ offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await s.send('Network.enable'); await s.send('Network.emulateNetworkConditions', cond(true));
  await net.send('Network.emulateNetworkConditions', cond(true));
  // "Lie-fi": the browser thinks it's online but nothing gets through (what the 5 s sync retry hits).
  const res = await p.evaluate(async (api) => { try { await fetch(api + '/health', { cache: 'no-store' }); return 'ok'; } catch (e) { return e.name; } }, process.env.API || 'http://localhost:5055/api');
  ok(res === 'TypeError', `offline API fetch fails as a plain network error in the page (${res})`);
  await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(1500);
  ok(await p.evaluate(() => !!document.querySelector('main, [data-testid]')), 'app shell loads offline from the precache');
  await sleep(6000); // let the periodic sync retry run at least once
  ok(swErrors.length === 0, `no service worker errors offline (${swErrors.slice(0, 3).join(' | ')})`);
  await net.send('Network.emulateNetworkConditions', cond(false)); await s.send('Network.emulateNetworkConditions', cond(false));
  ok(p.errors.length === 0, 'no page errors ' + p.errors.join(' | '));
} finally { await cleanup(); await b.close(); }
