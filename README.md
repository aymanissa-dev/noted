# noted.

**Write it down. Find it later.**

A simple, private space to capture thoughts, ideas, and notes. No AI, no collaboration, no unnecessary features. Just notes.

## Features

- **Authentication**: register, log in, log out (JWT + bcrypt)
- **Notes**: create, read, edit, delete
- **Search**: find notes by title or content
- **Pinning**: keep important notes at the top
- **Tags**: organize notes with simple labels, filter by tag
- **Dashboard**: all notes, pinned first, then sorted by last updated
- **Autosave**: saves while you type, with a saved / saving indicator (⌘/Ctrl+S still works)
- **Archive & Trash**: archive notes out of the way; deleted notes go to Trash, can be restored, and are purged after 30 days
- **Dark mode**: follows your system by default, with a manual toggle
- **Keyboard shortcuts**: `N` new note, `/` search, `Esc` back, `?` help
- **Export / import**: download everything as JSON or a zip of Markdown files; import a JSON export
- **Account settings**: change password, delete your account and all notes
- **Colors & emoji**: optional color and emoji per note
- **Note history**: versions are saved as you edit (at most one per 5 minutes, or on large changes; 50 per note); preview and restore
- **Quick capture**: type a line on the dashboard and press Enter (first line = title, `#tags` become tags); works offline
- **Sign out everywhere**: revoke every session from Settings; changing your password also signs out other devices
- **PIN-locked notes**: lock individual notes behind a 6-digit PIN (PINs set before Oct 2026 may be 4–5 digits and keep working); the server never returns their contents without it
- **Works offline (PWA)**: installable; read saved notes offline, and new notes and edits made offline sync when you reconnect
- **Markdown editor** (CodeMirror 6, lazy-loaded): plain-text notes render as-is; `/` slash commands (H1–H3, checklist, divider, date, code block, quote), clickable checklists, highlights in four colors (`==text==`, `=={green}text==`), foldable heading sections, outline, find & replace (⌘/Ctrl+F), `:emoji` completion, undo history that survives reloads (IndexedDB; never for locked notes, cleared on logout), focus mode with typewriter scrolling, print / save as PDF
- **Folders**: create, rename, delete (notes are moved out, never deleted), move notes; folders round-trip through export/import
- **Sidebar & smart lists**: recently viewed, pinned, edited today, this week, untagged, locked; split view (list + note) on wide screens; bottom navigation on mobile
- **Merge notes**: select 2+ notes, choose the order, merge (tags combined; originals go to the trash, Undo restores them)
- **Accent color**: pick one in Settings (synced to your account); drives the logo dot, highlights, and focus rings
- **Storage stats**: notes, words, biggest notes, folders, tags, versions, voice notes
- **Login activity**: last 20 sign-ins with browser/OS, masked IP and approximate location; shows which sessions are still active
- **Encrypted backups**: `.noted-backup` files encrypted in the browser (AES-256-GCM, PBKDF2-SHA-256 with 310k iterations); restore with the same duplicate skipping
- **Voice notes**: record up to 5 minutes (≤ 4 MB) per clip; stored privately in MongoDB, streamed only to the owner, hidden for locked notes until unlocked, deleted with the note or account
- **Motion**: subtle 150–250ms animations, all disabled under `prefers-reduced-motion`

## Keyboard shortcuts & help

Press `?` anywhere for the full, searchable list, `Ctrl/⌘+K` for the command palette (search notes, jump to views, run actions), or open **How to use noted.** (`/help`) from the account menu, the sidebar or the palette. Labels adapt to the platform (⌘ on Mac, Ctrl elsewhere); the Help page also has a touch version for phones. New web sign-ups get a short, skippable tour (re-run it from Help).

| Group | Shortcuts |
|---|---|
| Navigation | `G` `N` all notes · `G` `A` archive · `G` `T` trash · `G` `S` settings · `G` `H` help · `Esc` back / close |
| Notes | `N` new note · `Q` quick capture · `Mod+S` save now · `Enter` / `Shift+Enter` in quick capture |
| Editor | `/` commands · `:` emoji · `Mod+Z` undo · `Mod+Shift+Z` (Mac) / `Ctrl+Y` redo · `Alt+↑/↓` move line · `Shift+Alt+↑/↓` duplicate line · `Mod+Shift+K` delete line · `Mod+]` / `Mod+[` indent · fold/unfold `⌘⌥[` `⌘⌥]` (Mac) / `Ctrl+Shift+[` `Ctrl+Shift+]` · `Mod+A` select all |
| Formatting | `Mod+B` bold · `Mod+I` italic · `Mod+E` inline code · `Mod+Shift+X` strikethrough · `Mod+Shift+H` highlight · `Mod+Enter` toggle checklist item |
| Search | `/` search notes · `Mod+F` find & replace · `Mod+G` / `Shift+Mod+G` next / previous match · `Mod+D` select next occurrence · `Esc` clear |
| App | `Mod+K` command palette · `?` shortcuts · `↑` `↓` in menus and the palette |

`Mod` is ⌘ on Mac and Ctrl elsewhere. The list lives in `client/src/lib/shortcutList.js` and is checked against the real bindings by `client/src/lib/keys.test.mjs`.

## Tech stack

| Layer          | Technology               |
| -------------- | ------------------------ |
| Frontend       | React + React Router (Vite) |
| Styling        | Tailwind CSS             |
| Backend        | Node.js + Express        |
| API            | REST                     |
| Authentication | JWT + bcrypt             |
| Database       | MongoDB (Mongoose)       |

## Project structure

```
noted/
├── api/          # Vercel serverless entry (wraps the Express app)
├── client/       # Vite + React + Tailwind frontend
├── server/       # Express + Mongoose REST API
└── vercel.json   # Vercel build + rewrites
```

## Getting started

**Prerequisites:** Node.js 18+ and a MongoDB instance (local or MongoDB Atlas).

```bash
# 1. API
cd server
cp .env.example .env      # then edit values
npm install
npm run dev               # http://localhost:5000

# 2. Client (in a second terminal)
cd client
cp .env.example .env
npm install
npm run dev               # http://localhost:5173
```

Production build of the client: `cd client && npm run build` (output in `client/dist`).

Tests: `cd server && npm test` (API smoke test against an in-memory MongoDB, no setup needed) and `cd client && npm test` (offline queue).

## Environment variables

### server/.env

| Variable         | Description                                  | Example                              |
| ---------------- | -------------------------------------------- | ------------------------------------ |
| `PORT`           | Port the API listens on                      | `5000`                               |
| `MONGODB_URI`    | MongoDB connection string                    | `mongodb://127.0.0.1:27017/noted`    |
| `JWT_SECRET`     | Secret used to sign tokens (keep it long and random) | `change-me`                  |
| `JWT_EXPIRES_IN` | Token lifetime                               | `7d`                                 |
| `CLIENT_URL`     | Allowed CORS origin(s), comma-separated      | `http://localhost:5173`              |

### client/.env

| Variable       | Description          | Example                     |
| -------------- | -------------------- | --------------------------- |
| `VITE_API_URL` | Base URL of the API (defaults to `/api`) | `http://localhost:5000/api` |

## API reference

All endpoints are prefixed with `/api`. Note endpoints require `Authorization: Bearer <token>`.
Errors are returned as `{ "error": "message" }`.

### Auth

| Method | Endpoint         | Body                          | Response                 |
| ------ | ---------------- | ----------------------------- | ------------------------ |
| POST   | `/auth/register` | `{ name, email, password }`   | `201 { token, user }`    |
| POST   | `/auth/login`    | `{ email, password }`         | `200 { token, user }`    |
| GET    | `/auth/me`       | –                             | `200 { user }`           |
| PATCH  | `/auth/password` | `{ currentPassword, newPassword }` | `200 { ok, token }` (`403` if current password is wrong). Revokes other sessions; use the returned token |
| POST   | `/auth/logout-all` | – | `200 { ok, token }`. Revokes every token; the returned token keeps this session |
| PUT    | `/auth/lock-pin` | `{ password, pin }` (6 digits) | `200 { user }`. Set or change the lock PIN |
| DELETE | `/auth/lock-pin` | `{ password }` | `200 { user, unlockedNotes }`. Removes the PIN and unlocks all notes |
| DELETE | `/auth/me`       | `{ password }`                | `200 { ok, deletedNotes }`. Deletes the account and all its notes |

Passwords must be at least 8 characters. Logout is handled client-side by discarding the token.

### Notes

| Method       | Endpoint           | Description                                                   |
| ------------ | ------------------ | ------------------------------------------------------------- |
| GET          | `/notes`           | List notes. Query: `search` (title/content), `tag`, `view` = `active` (default) \| `archive` \| `trash`. Sorted pinned first, then `updatedAt` desc (trash: by `deletedAt`). Trash older than 30 days is purged on request. |
| GET          | `/notes/tags`      | List the user's distinct tags                                 |
| POST         | `/notes`           | Create `{ title, content, tags: string[], pinned, color, emoji }` |
| GET          | `/notes/:id`       | Get one note                                                  |
| PUT / PATCH  | `/notes/:id`       | Update any of `title`, `content`, `tags`, `pinned`, `color`, `emoji` |
| PATCH        | `/notes/:id/pin`   | Toggle pinned                                                 |
| PATCH        | `/notes/:id/archive` | Toggle archived (archiving unpins)                          |
| DELETE       | `/notes/:id`       | Move to trash (sets `deletedAt`). `?permanent=true` deletes for good (`204`) |
| POST         | `/notes/:id/restore` | Restore from trash                                          |
| GET          | `/notes/:id/versions` | Version list `{ versions: [{ _id, createdAt, reason, title, preview, length }] }` |
| GET          | `/notes/:id/versions/:vid` | Full version |
| POST         | `/notes/:id/versions/:vid/restore` | Restore a version (the current state is saved as a new version first) |
| PATCH        | `/notes/:id/lock`  | `{ locked: true }` (needs a PIN set) or `{ locked: false, pin }` |
| POST         | `/notes/:id/unlock` | `{ pin }` → `{ note, unlockToken }`. Send `X-Unlock-Token` to read/edit the note or its history (valid 15 min). 5 wrong PINs block PIN checks for 5 minutes (`429`) |
| DELETE       | `/notes/trash`     | Empty the trash → `{ deleted }`                               |
| GET          | `/notes/export`    | Locked notes are redacted and flagged unless the `X-Lock-Pin` header has the correct PIN. `?format=json` (default) → `{ app, version, exportedAt, notes }`; `?format=md` → zip of Markdown files with front matter. Trashed notes are excluded. |
| POST         | `/notes/import`    | Body: an export object or an array of notes (max 5000). Validated; always imported into the current user's account → `201 { imported }` |
| POST         | `/notes/merge`     | `{ ids: [...] (ordered, 2–50), title? }` → `201 { note, trashed }`. Locked notes: `423` |
| GET          | `/notes/recent`    | Last 10 opened notes, newest first |
| PATCH        | `/notes/:id/folder` | `{ folderId }` (or `null`) |
| GET / POST   | `/folders`         | List (with active note counts) / create `{ name }` |
| PATCH / DELETE | `/folders/:id`   | Rename `{ name }` / delete (its notes move out of it) |
| GET / POST   | `/notes/:id/audio` | List voice notes / upload raw audio (`Content-Type: audio/*`, `X-Audio-Duration`) |
| GET / DELETE | `/audio/:clipId`   | Stream (owner only, `Range` supported) / delete |
| GET          | `/stats`           | Storage stats |
| GET          | `/auth/activity`   | Recent sign-ins `{ events: [{ at, browser, os, device, ip (masked), location, active, current }] }` |
| PATCH        | `/auth/preferences` | `{ accent }` |

`GET /notes` also accepts `folder` (id or `none`) and `smart` (`pinned`, `today`, `week`, `untagged`, `locked`); search matches the Markdown-stripped text too.

Note shape:

```json
{ "_id": "...", "user": "...", "title": "Ideas", "content": "...", "tags": ["work"],
  "pinned": false, "archived": false, "deletedAt": null, "color": "", "emoji": "💡",
  "createdAt": "...", "updatedAt": "..." }
```

Tags are trimmed, lowercased, and de-duplicated (max 20 per note).
`color` is one of `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `gray`, or `""`. `emoji` is a single emoji or `""`.

## Locked notes

Locked notes are redacted on the server (empty `title`, `content`, `tags`, plus `redacted: true`) in every list,
get, and export response unless the request carries a valid unlock token. They never match search or tag filters,
their history needs an unlock token, and the client never stores their contents offline or queues offline edits for them.

## Sessions

Tokens carry a `tokenVersion`; the auth middleware rejects tokens whose version doesn't match the user's.
"Sign out of all devices" and password changes bump it.

## Offline

The client is a PWA (via `vite-plugin-pwa`). The service worker precaches the app shell only; API responses are
never cached by the service worker. The app keeps its own copy of notes you've viewed in `localStorage` for
offline reading, and queues creates/edits made offline, syncing them in order when the connection returns.
All local data is cleared on logout. Pin/archive/delete need a connection.

## Deploying to Vercel

The repo deploys as a single Vercel project:

- `client/` is built with Vite and served as static files from `client/dist`.
- `api/index.js` wraps the Express app as a serverless function, reusing a cached Mongoose connection across warm invocations.
- `vercel.json` rewrites `/api/*` to the function and everything else to `index.html` (SPA fallback).

Steps:

1. Import the GitHub repo in Vercel (framework preset: **Other**; build settings come from `vercel.json`).
2. Set environment variables (Production):
   - `MONGODB_URI`: your Atlas connection string
   - `JWT_SECRET`: a long random string (`openssl rand -hex 48`)
   - `JWT_EXPIRES_IN` (optional, default `7d`)
   - leave `VITE_API_URL` unset so the client calls same-origin `/api`
3. In MongoDB Atlas → Network Access, allow Vercel to connect (Vercel uses dynamic IPs, so `0.0.0.0/0` is typical; rely on strong DB credentials).
4. Deploy. Check `https://<your-app>.vercel.app/api/health` → `{ "ok": true }`.

## License

MIT
