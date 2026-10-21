// Shared helpers for UI checks. BASE/API default to the local QA stack.
import puppeteer from 'puppeteer-core';
import { appendFileSync } from 'node:fs';
export const BASE = process.env.BASE || 'http://localhost:4173';
export const API = process.env.API || 'http://localhost:5055/api';
export const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
// Local stack only: the API skips its sign-up/sign-in rate limits for these helper calls (the token is
// set by server/scripts/dev-memory.js; production never honours it). Browser traffic is never exempt.
const BYPASS = process.env.RATE_LIMIT_BYPASS_TOKEN || (/localhost|127\.0\.0\.1/.test(API) ? 'local-e2e' : '');
export const api = async (method, path, body, token) => {
  const r = await fetch(API + path, { method, headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }), ...(BYPASS && { 'X-Rate-Limit-Bypass': BYPASS }) }, body: body && JSON.stringify(body) });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: r.status, data: d };
};
export const created = [];
export async function newUser(tag = 'ui') {
  const email = `${tag}+${Date.now()}${Math.floor(Math.random() * 1e4)}@noted.test`;
  const r = await api('POST', '/auth/register', { name: 'Tester', email, password: 'quiet-otter-lamp-91' });
  created.push({ email, token: r.data.token });
  return { email, token: r.data.token, user: r.data.user };
}
export async function cleanup() {
  for (const u of created) {
    const r = await api('DELETE', '/auth/me', { password: 'quiet-otter-lamp-91' }, u.token);
    console.log('cleanup', u.email, r.status);
  }
}
// Every page of every suite reports Content-Security-Policy violations to CSP_LOG (one line each),
// so a run of all suites can assert the policy never blocks anything the app needs.
export const CSP_LOG = process.env.CSP_LOG || '/tmp/csp-violations.log';
const suite = (process.argv[1] || '').split('/').pop();
const watchCsp = async (target) => {
  if (target.type() !== 'page') return;
  const p = await target.page().catch(() => null); if (!p) return;
  const log = (what) => { try { appendFileSync(CSP_LOG, `${suite}\t${p.url()}\t${what}\n`); } catch { /* ignore */ } };
  await p.evaluateOnNewDocument(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP-VIOLATION ${e.violatedDirective} ${e.blockedURI} ${e.sourceFile || ''}:${e.lineNumber || ''}`))).catch(() => {});
  p.on('console', (m) => { const t = m.text(); if (/CSP-VIOLATION|Content Security Policy/.test(t)) log(t.slice(0, 300)); });
};
export async function launch() {
  // PROFILE=/dir reuses a Chrome profile between runs (service worker, caches and storage of earlier builds).
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', ...(process.env.PROFILE && { userDataDir: process.env.PROFILE }), args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  browser.on('targetcreated', watchCsp);
  for (const t of browser.targets()) watchCsp(t);
  return browser;
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
