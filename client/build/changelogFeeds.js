// Emits /changelog.xml (RSS 2.0) and /changelog.json (JSON Feed 1.1) from src/data/changelog.js at
// build time, so the feeds can never drift from the /changelog page.
import { CHANGE_TYPES, RELEASES } from '../src/data/changelog.js';

export const SITE = 'https://noted-lac-phi.vercel.app';
const PAGE = `${SITE}/changelog`;
const ORDER = ['new', 'improved', 'fixed', 'security'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const anchor = (v) => `v${String(v).replace(/\./g, '-')}`;
const when = (d) => new Date(`${d}T12:00:00Z`);

const html = (r) => `<p>${esc(r.summary)}</p>${ORDER.map((t) => {
  const list = r.changes.filter((c) => c.type === t);
  return list.length ? `<h3>${esc(CHANGE_TYPES[t])}</h3><ul>${list.map((c) => `<li>${esc(c.text)}</li>`).join('')}</ul>` : '';
}).join('')}`;
const text = (r) => [r.summary, ...r.changes.map((c) => `• ${CHANGE_TYPES[c.type]}: ${c.text}`)].join('\n');

export function rss(releases = RELEASES) {
  const items = releases.map((r) => `
    <item>
      <title>${esc(`noted. ${r.version}: ${r.title}`)}</title>
      <link>${PAGE}#${anchor(r.version)}</link>
      <guid isPermaLink="true">${PAGE}#${anchor(r.version)}</guid>
      <pubDate>${when(r.date).toUTCString()}</pubDate>
      <description>${esc(html(r))}</description>
    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>noted. changelog</title>
    <link>${PAGE}</link>
    <atom:link href="${SITE}/changelog.xml" rel="self" type="application/rss+xml" />
    <description>New features, improvements and fixes in noted., the calm, private notes app.</description>
    <language>en</language>
    <lastBuildDate>${when(releases[0].date).toUTCString()}</lastBuildDate>${items}
  </channel>
</rss>
`;
}

export function jsonFeed(releases = RELEASES) {
  return `${JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: 'noted. changelog',
    home_page_url: PAGE,
    feed_url: `${SITE}/changelog.json`,
    description: 'New features, improvements and fixes in noted., the calm, private notes app.',
    icon: `${SITE}/pwa-512x512.png`,
    favicon: `${SITE}/favicon.png`,
    language: 'en',
    items: releases.map((r) => ({
      id: `${PAGE}#${anchor(r.version)}`,
      url: `${PAGE}#${anchor(r.version)}`,
      title: `noted. ${r.version}: ${r.title}`,
      summary: r.summary,
      content_html: html(r),
      content_text: text(r),
      date_published: when(r.date).toISOString(),
      tags: [...new Set(r.changes.map((c) => c.type))],
    })),
  }, null, 2)}\n`;
}

// Vite plugin: adds both files to the build output (and serves them in `vite dev`).
export default function changelogFeeds() {
  return {
    name: 'noted-changelog-feeds',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'changelog.xml', source: rss() });
      this.emitFile({ type: 'asset', fileName: 'changelog.json', source: jsonFeed() });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0];
        if (path === '/changelog.xml') { res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8'); return res.end(rss()); }
        if (path === '/changelog.json') { res.setHeader('Content-Type', 'application/feed+json; charset=utf-8'); return res.end(jsonFeed()); }
        return next();
      });
    },
  };
}
