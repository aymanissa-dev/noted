// noted. release notes. The /changelog page and the RSS/JSON feeds (built by vite.config.js) are
// generated from this list, so adding a release means adding one object at the top. Keep it plain
// JavaScript (no imports): the build reads it in Node.
//
// Each release:
//   version  'X.Y' (also the anchor: /changelog#v1-6)
//   date     'YYYY-MM-DD' (the day it shipped)
//   title    short headline
//   summary  one or two sentences for people who only read the top
//   changes  [{ type: 'new' | 'improved' | 'fixed' | 'security', text }] (user-facing, no internals)
//   build    optional: commit or deploy id it shipped in (shown small, for support)

export const CHANGE_TYPES = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
  security: 'Security & privacy',
};

export const RELEASES = [
  {
    version: '1.7',
    date: '2026-10-27',
    title: 'Share a note with a link, and a new look',
    summary: 'Send anyone a read-only link to a note: no account needed to read it, and you can turn it off at any time. Noted also has a new logo.',
    changes: [
      { type: 'new', text: 'Share a note from its “…” menu → Share…: create a link, copy it, make a new one, or stop sharing. People with the link see the note’s title, text and images, read-only.' },
      { type: 'new', text: 'Settings → Shared links lists every note you’ve shared, with Copy link and Stop sharing.' },
      { type: 'new', text: 'A new logo: the folded-corner N and the Noted wordmark, across the site, the app, the browser tab and your home screen. It switches to light-on-dark in dark mode.' },
      { type: 'improved', text: 'Mistyped addresses now show a proper “Page not found” page instead of jumping to the home page.' },
      { type: 'security', text: 'Shared pages are hidden from search engines, never send your link on to other sites, and can only load images from the note you shared.' },
      { type: 'security', text: 'Locked notes can’t be shared. Locking a shared note, or moving it to the trash, turns its link off straight away.' },
      { type: 'security', text: 'Making a new link or stopping sharing breaks the old link immediately. Links are long random codes that can’t be guessed.' },
    ],
  },
  {
    version: '1.6',
    date: '2026-10-24',
    title: 'Images in your notes',
    summary: 'Paste a screenshot, drop in a photo, or snap one with your phone. Images sit right in the note, stay private to you, and come along when you export.',
    build: '401f92e',
    changes: [
      { type: 'new', text: 'Add images by pasting, dragging them onto a note, the Image button in the toolbar, or typing /image. On phones, “…” → Add image opens the camera or your photo library.' },
      { type: 'new', text: 'Images show inline while you write, with an upload progress bar, Retry if something goes wrong, and alt text you can edit.' },
      { type: 'new', text: 'Click an image to see it full size.' },
      { type: 'new', text: 'Markdown export includes your images in an images/ folder, linked from each note.' },
      { type: 'improved', text: 'Big photos are resized and compressed on your device before upload, so they’re quick to add and quick to load.' },
      { type: 'improved', text: 'Images you’ve already seen keep showing when you’re offline.' },
      { type: 'security', text: 'Location and camera details (EXIF/GPS) are removed from photos before they leave your device.' },
      { type: 'security', text: 'Images are only ever shown to you, and images in a locked note only while it’s unlocked. They’re deleted with the note or your account.' },
    ],
  },
  {
    version: '1.5',
    date: '2026-10-23',
    title: 'Safer sign-outs',
    summary: 'Logging out now really ends that session, and a handful of small things feel instant.',
    changes: [
      { type: 'security', text: 'Log out ends the session on our side too, so a copied sign-in stops working right away. If you log out offline, it’s finished the moment you’re back online.' },
      { type: 'security', text: 'Stricter security headers on every response.' },
      { type: 'improved', text: 'Unlocking a note shows its title in your lists straight away.' },
      { type: 'improved', text: 'New folders appear instantly, and the sidebar shows a placeholder instead of “no folders” while it loads.' },
      { type: 'improved', text: 'Setting a PIN shows progress while your password is checked.' },
      { type: 'improved', text: 'Faster first load after the app has been idle.' },
      { type: 'fixed', text: 'Old links to notes created offline show “not found” instead of loading forever.' },
    ],
  },
  {
    version: '1.4',
    date: '2026-10-21',
    title: 'Polish, wide screens and stronger security',
    summary: 'A big round of refinement: better use of large screens, a calmer dark mode, typewriter mode, and a security review.',
    changes: [
      { type: 'new', text: 'Typewriter mode keeps the line you’re typing centered (toolbar, ··· menu, or Alt+Shift+T).' },
      { type: 'improved', text: 'Wide screens: the app uses the full window, with a wider list and a comfortable reading width in the editor.' },
      { type: 'improved', text: 'Dark mode has clearer layers, and note colors look right on dark backgrounds.' },
      { type: 'improved', text: 'A clearer type scale for titles, headings and body text.' },
      { type: 'improved', text: 'Empty screens now show what to do next, with the relevant shortcuts.' },
      { type: 'improved', text: 'Phones: one tidy editor toolbar, with Outline, Find and Focus in the ··· menu.' },
      { type: 'improved', text: 'Offline and connection problems get honest messages and recover on their own, everywhere.' },
      { type: 'improved', text: 'Updates take over open tabs, so you’re never stuck on an old version.' },
      { type: 'improved', text: 'The app can be installed with proper screenshots and shortcut icons.' },
      { type: 'security', text: 'Common, guessable and known-breached passwords are refused (checked privately, your password never leaves in full).' },
      { type: 'security', text: 'Note PINs are 6 digits, with a wait after too many wrong tries; sign-ins and sign-ups are rate-limited.' },
      { type: 'security', text: 'A strict Content Security Policy on every page.' },
      { type: 'fixed', text: 'Emoji completion, slash commands, the command palette ranking and quick capture all behave as expected.' },
      { type: 'fixed', text: 'Pressing Enter on an empty list item ends the list.' },
      { type: 'fixed', text: 'A missing note shows a proper “This note isn’t here” page.' },
    ],
  },
  {
    version: '1.3',
    date: '2026-10-16',
    title: 'Find your way around',
    summary: 'Everything is a keystroke away, and noted. got a fresh coat of paint.',
    changes: [
      { type: 'new', text: 'Command palette (Ctrl/⌘+K): open any note or run any action.' },
      { type: 'new', text: 'G-key jumps (G then N for notes, and more), formatting shortcuts, and a full shortcut list on ?.' },
      { type: 'new', text: 'A Help page and a short first-run tour.' },
      { type: 'improved', text: 'New look: Geist type, refined colors and surfaces, restyled sign-in, settings, cards and toasts.' },
      { type: 'improved', text: 'A redesigned home page with a live preview of the app.' },
      { type: 'improved', text: 'Better contrast and screen-reader labels.' },
    ],
  },
  {
    version: '1.2',
    date: '2026-10-14',
    title: 'Smoother every day',
    summary: 'Faster starts, friendlier menus and messages, and a batch of fixes.',
    changes: [
      { type: 'improved', text: 'The app opens instantly from what’s on your device, then refreshes in the background.' },
      { type: 'improved', text: 'One icon set, in-app dialogs, an account menu, a “More actions” menu in notes, and tooltips that show shortcuts.' },
      { type: 'improved', text: 'Helpful empty, error and offline states, plus a welcome note for new accounts.' },
      { type: 'improved', text: 'Sign-in and sign-up check as you type, can show your password, and warn about Caps Lock.' },
      { type: 'fixed', text: 'Version history keeps a snapshot at the start of each editing session.' },
      { type: 'fixed', text: 'Quick capture turns #tags anywhere in the text into tags.' },
      { type: 'fixed', text: 'Undo after delete or archive brings the note back instantly.' },
    ],
  },
  {
    version: '1.1',
    date: '2026-10-13',
    title: 'Organize and write better',
    summary: 'Folders, a real Markdown editor, voice notes and much more.',
    changes: [
      { type: 'new', text: 'Folders, plus a sidebar with Recently viewed, Pinned, Edited today, This week, Untagged and Locked.' },
      { type: 'new', text: 'Split view on wide screens: your list beside the open note.' },
      { type: 'new', text: 'A Markdown editor with slash commands, checklists, highlights, an outline, folding, find & replace and focus mode.' },
      { type: 'new', text: 'Merge notes: pick two or more, choose the order, and combine them.' },
      { type: 'new', text: 'Voice notes: record up to 5 minutes right in a note.' },
      { type: 'new', text: 'Encrypted backups, protected by a password only you know.' },
      { type: 'new', text: 'Storage stats and recent sign-in activity in Settings.' },
      { type: 'new', text: 'Pick an accent color.' },
      { type: 'new', text: 'A public home page.' },
      { type: 'improved', text: 'Loading skeletons, gentle animations (off if you prefer reduced motion), and consistent focus rings.' },
    ],
  },
  {
    version: '1.0',
    date: '2026-10-12',
    title: 'Hello, noted.',
    summary: 'The first release: a calm, private place to write things down and find them later.',
    changes: [
      { type: 'new', text: 'Notes that save as you type, with instant search, tags and pinning.' },
      { type: 'new', text: 'Archive and Trash (kept for 30 days), with Undo.' },
      { type: 'new', text: 'Quick capture from the notes list.' },
      { type: 'new', text: 'Version history: preview and restore earlier drafts.' },
      { type: 'new', text: 'Note colors and emoji.' },
      { type: 'new', text: 'Light and dark mode, following your system by default.' },
      { type: 'new', text: 'Keyboard shortcuts (N, /, Esc, ?).' },
      { type: 'new', text: 'Export as JSON or a Markdown ZIP, and import JSON.' },
      { type: 'new', text: 'Install it as an app; read offline, and edits made offline sync when you’re back.' },
      { type: 'security', text: 'PIN-locked notes, and “Sign out of all devices”.' },
    ],
  },
];
