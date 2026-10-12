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
- **Works offline (PWA)**: installable; read saved notes offline, and new notes and edits made offline sync when you reconnect

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
| PATCH  | `/auth/password` | `{ currentPassword, newPassword }` | `200 { ok }` (`403` if current password is wrong) |
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
| DELETE       | `/notes/trash`     | Empty the trash → `{ deleted }`                               |
| GET          | `/notes/export`    | `?format=json` (default) → `{ app, version, exportedAt, notes }`; `?format=md` → zip of Markdown files with front matter. Trashed notes are excluded. |
| POST         | `/notes/import`    | Body: an export object or an array of notes (max 5000). Validated; always imported into the current user's account → `201 { imported }` |

Note shape:

```json
{ "_id": "...", "user": "...", "title": "Ideas", "content": "...", "tags": ["work"],
  "pinned": false, "archived": false, "deletedAt": null, "color": "", "emoji": "💡",
  "createdAt": "...", "updatedAt": "..." }
```

Tags are trimmed, lowercased, and de-duplicated (max 20 per note).
`color` is one of `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `gray`, or `""`. `emoji` is a single emoji or `""`.

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
