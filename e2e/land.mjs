import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://localhost:4173';
const OUT = process.env.OUT || '/tmp/land';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const shot = async (name, w, dark) => {
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setViewport({ width: w, height: w < 500 ? 812 : 900, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
  await new Promise((r) => setTimeout(r, 1200));
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await p.screenshot({ path: `${OUT}-${name}.png`, fullPage: true });
  console.log(name, 'overflow', over, 'errors', errs.length, errs.join('|'));
  await p.close();
};
await shot('desktop', 1440, false); await shot('mobile', 375, false); await shot('dark', 1440, true);
await b.close();
