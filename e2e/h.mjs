// Shared helpers for UI checks. BASE/API default to the local QA stack.
import puppeteer from 'puppeteer-core';
export const BASE = process.env.BASE || 'http://localhost:4173';
export const API = process.env.API || 'http://localhost:5055/api';
export const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
export const api = async (method, path, body, token) => {
  const r = await fetch(API + path, { method, headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: r.status, data: d };
};
export const created = [];
export async function newUser(tag = 'ui') {
  const email = `${tag}+${Date.now()}${Math.floor(Math.random() * 1e4)}@noted.test`;
  const r = await api('POST', '/auth/register', { name: 'Tester', email, password: 'password123' });
  created.push({ email, token: r.data.token });
  return { email, token: r.data.token, user: r.data.user };
}
export async function cleanup() {
  for (const u of created) {
    const r = await api('DELETE', '/auth/me', { password: 'password123' }, u.token);
    console.log('cleanup', u.email, r.status);
  }
}
export async function launch() {
  return puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
}
export async function pageAs(browser, token, user, { width = 1440, height = 900, mobile = false, dark = false } = {}) {
  const p = await browser.newPage();
  p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
  await p.setViewport({ width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  if (dark) await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await p.evaluate((t, u) => { localStorage.setItem('noted.token', t); localStorage.setItem('noted.user', JSON.stringify(u)); }, token, user);
  return p;
}
export const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
