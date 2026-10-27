import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Per-route head tags for crawlers and link previews: a self-referencing canonical, a title and
// description for the public pages, and noindex for everything behind sign-in.
const PUBLIC = {
  '/': ['noted. — Write it down. Find it later.', 'noted. is a calm, private notes app. No AI, no tracking. Autosave, instant search and tags, keyboard shortcuts, offline support, and export any time.'],
  '/changelog': ['Changelog · noted.', 'What’s new in noted.: release notes for every new feature, improvement and fix, from the first release to share links and the new logo.'],
  '/login': ['Log in · noted.', 'Log in to noted., the calm, private notes app. Your notes, search, and tags on every device.'],
  '/register': ['Start writing · noted.', 'Create a free noted. account: a calm, private notebook with autosave, instant search, tags, and offline support. No AI, no tracking.'],
};
const meta = (sel, make) => document.head.querySelector(sel) || document.head.appendChild(make());
const el = (tag, attrs) => Object.assign(document.createElement(tag), attrs);

export function useHead() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = PUBLIC[pathname];
    const canonical = meta('link[rel=canonical]', () => el('link', { rel: 'canonical' }));
    if (pathname.startsWith('/s/')) canonical.remove(); // a share link is never canonical
    else { canonical.href = location.origin + pathname; if (!canonical.isConnected) document.head.appendChild(canonical); }
    const robots = meta('meta[name=robots]', () => el('meta', { name: 'robots' }));
    robots.content = page ? 'index, follow' : pathname.startsWith('/s/') ? 'noindex, nofollow, noarchive' : 'noindex';
    if (page) {
      document.title = page[0];
      meta('meta[name=description]', () => el('meta', { name: 'description' })).content = page[1];
    } else if (document.title === PUBLIC['/'][0]) document.title = 'noted.';
  }, [pathname]);
}
