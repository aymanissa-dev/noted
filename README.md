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

Smoke test of the API (uses an in-memory MongoDB, no setup needed): `cd server && npm test`.

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

Passwords must be at least 8 characters. Logout is handled client-side by discarding the token.

### Notes

| Method       | Endpoint           | Description                                                   |
| ------------ | ------------------ | ------------------------------------------------------------- |
| GET          | `/notes`           | List notes. Query: `search` (title/content), `tag`. Sorted pinned first, then `updatedAt` desc. |
| GET          | `/notes/tags`      | List the user's distinct tags                                 |
| POST         | `/notes`           | Create `{ title, content, tags: string[], pinned }`           |
| GET          | `/notes/:id`       | Get one note                                                  |
| PUT / PATCH  | `/notes/:id`       | Update any of `title`, `content`, `tags`, `pinned`            |
| PATCH        | `/notes/:id/pin`   | Toggle pinned                                                 |
| DELETE       | `/notes/:id`       | Delete (`204`)                                                |

Note shape:

```json
{ "_id": "...", "user": "...", "title": "Ideas", "content": "...", "tags": ["work"],
  "pinned": false, "createdAt": "...", "updatedAt": "..." }
```

Tags are trimmed, lowercased, and de-duplicated (max 20 per note).

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
