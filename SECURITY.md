# Security notes

## Session token: localStorage + strict CSP (not an httpOnly cookie)

The JWT stays in `localStorage` (`noted.token`). Moving it to an `httpOnly` cookie was evaluated
(security review M2, 2026-10-21) and not done, because it would break or weaken things noted. relies on:

- **Offline / PWA flows.** The offline queue replays edits when the connection returns, from any open
  tab, and `saveOnUnload` sends the last edit with `fetch(..., { keepalive: true })` while the page is
  closing. Both send `Authorization: Bearer`; with cookies every state-changing route would also need
  CSRF protection (SameSite alone doesn't cover the preview domains), and replays would need tokens.
- **Account isolation on a shared device.** Every cached note, the offline queue and editor undo history
  are keyed to the signed-in user (`noted.owner`); tabs react to the token changing (storage event) by
  reloading. An httpOnly cookie is invisible to the page, so a tab can't tell that another tab signed in
  as someone else until a request fails.
- **Token rotation after a password change** happens in the client today (`rotate()`), across tabs.

What protects the token instead:

- A strict **Content-Security-Policy** on every page (`vercel.json`): `script-src 'self'` with no
  `unsafe-inline`/`unsafe-eval` (the theme/accent bootstrap moved from inline scripts to `/boot.js`),
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`,
  `connect-src 'self'`. `style-src` allows `'unsafe-inline'` because CodeMirror and React set inline
  styles; styles can't run script.
- React escapes all rendered text. The one `dangerouslySetInnerHTML` (print view) renders
  `toHtml()` from `lib/markdown.js`, which HTML-escapes the note before adding its own tags.
- Tokens expire after 7 days, and changing the password or "Sign out other sessions" revokes old ones server-side.
- **Log out ends the session on the server (B1).** Every token carries a session id (`sid`). `POST /api/auth/logout`
  stores it in `revokedsessions` (TTL index: the row expires with the token), and `requireAuth` rejects a
  revoked session with 401 on every route, so a copied token stops working at once; other devices stay
  signed in. Tokens without a `sid` (from before) are revoked by their SHA-256 hash. The client sends the
  logout before clearing local data; if it's offline or the request fails it keeps the token in
  `noted.pendingLogout` (only until revoked, rejected or expired) and sends it when back online.
- **API headers** match the pages: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`,
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` (the API only returns JSON, audio and images),
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`. Set by helmet in Express and again in
  `vercel.json` for `/api/*` (covers responses sent before Express, like the 503 when the DB is down).

Reconsider if noted. ever renders third-party scripts or user-supplied HTML.

## Rate limits (H1, M1)

Stored in MongoDB (`ratelimits`, TTL-indexed), so they hold across serverless instances.

| What | Limit | After |
| --- | --- | --- |
| Failed sign-ins per email | 5 / 15 min, growing delay from the 2nd | 429 + `Retry-After` until the window ends (also for the right password) |
| Failed sign-ins per IP / per network (IPv4 /24, IPv6 /64) | 20 / 60 per 15 min | 429 |
| Sign-up attempts per IP / per network | 20 / 60 per hour | 429 |
| Wrong account password (signed in) | 5 / 15 min per account | 429 |
| Wrong note PIN | 4 free, then waits of 5, 10, 20… min (max 2 h); the count only resets on a correct PIN | after 10 in total, PIN entry needs the account password |

Nothing locks an account permanently. Trade-off: someone who knows an email can keep that account's
sign-ins paused for 15 minutes at a time. Client IPs come from Vercel's own headers
(`x-vercel-forwarded-for` / `x-real-ip`), never a client-supplied `X-Forwarded-For`. The network
limits exist because clients can rotate through many addresses of one pool (our own QA box egresses
from a different 140.248.50.x address on every connection, which slipped past the per-IP limit).

**Concurrency (re-verify NEW-1).** Every limiter reserves its slot atomically *before* the expensive
check: one `findOneAndUpdate` with `$inc` (a filtered upsert opens a new window) counts the attempt,
and only attempts inside the limit go on to bcrypt. So a burst of parallel wrong passwords for one
email gets exactly 4 × 401 and then 429s, however many arrive at once. A successful sign-in clears
the email counter and hands its IP/network reservation back; attempts refused by one limiter hand
back what they reserved on the others, so a blocked email doesn't eat the network's budget. The
same reservation is used for sign-ups and for the signed-in password check.

**Note PIN (NEW-3).** A PIN attempt is one atomic conditional write on the user: the filter only
matches when the PIN isn't waiting or locked out, and the update (an aggregation pipeline) counts the
attempt and sets the wait in the same write, before the PIN is compared. Parallel wrong PINs therefore
can't all slip in before the wait is set. A correct PIN clears the count and the wait. Trade-off: the
wait is set pessimistically, so a correct PIN racing a burst of wrong ones may itself be told to wait.

**Folder cap (NEW-2).** `users.folderCount` is reserved with a conditional `$inc` (`folderCount <=
MAX_FOLDERS - 1`) before each folder is created (folder create, imports), and released if the create
fails or a folder is deleted (only when the delete actually removed it). Accounts from before the
counter get it backfilled from `countDocuments` the first time, only while the field is missing.
If a process dies between reserving and creating, the counter can sit one high (it never lets the
cap be exceeded).

**Idempotent creates.** A new note carries its local id (`clientId`); a create that is sent twice
(reloaded mid-request, offline queue retry) returns, and updates, the note it already made (unique
partial index `{ user, clientId }`) instead of making a duplicate.

Tests: in-process server tests set `RATE_LIMITS=off`; the local QA stack accepts an
`X-Rate-Limit-Bypass` header matching `RATE_LIMIT_BYPASS_TOKEN`. Neither is honoured when running on
Vercel (`VERCEL` is set), so production can't be configured into a bypass by accident.

## Unlocked notes: the 15-minute window

Entering a note's PIN gives an unlock token for that note, valid for 15 minutes, held only by the
open editor (in memory; not stored). While it is valid, that editor can edit, move to the trash and
delete the note for good without asking again (QA final e: intended). Once it has expired, each of
those asks for the PIN again (the server answers 423 without a valid token). Anywhere else (the
trash list, bulk actions) a locked note always asks for the PIN.

In the note lists, a note unlocked in this tab shows its title (never its body) with the lock icon
until the unlock ends; that title is kept in memory only and is dropped on reload, logout, relock or
a PIN change.

## PIN hashing cost

Lock PINs are hashed with bcrypt cost 10 (~70 ms), the same as passwords. A lower cost would only
save tens of milliseconds per "Set PIN" (server time for the whole request is ~200 ms, mostly the
password check plus this hash); what protects a 6-digit PIN online is the attempt limit and backoff
above, and offline the cost only slows a leaked-hash search, so it stays at 10.

## Images

- **Types**: PNG, JPEG, WebP and GIF only. SVG (scriptable) and everything else is refused in the browser and,
  independently, by the server, which checks the magic bytes and that the header parses (415), not just the
  declared `Content-Type`. The stored type comes from the bytes, and responses send `nosniff`,
  `Content-Disposition: inline` and the API CSP `default-src 'none'`, so even a direct visit to an image URL can't
  run anything.
- **Privacy**: images are only served to their owner (others get 404, like notes) and, for a locked note, only
  with a valid unlock token (423 otherwise, `Cache-Control: no-store`). The browser re-encodes every image
  before upload, which drops EXIF/GPS metadata (GIFs are uploaded as-is; they carry no EXIF).
- **Limits**: 3 MB per image (413), 200 images / 100 MB per account (409), reserved atomically before storing.
- **Local copies**: viewed images are cached in Cache Storage for offline reading and cleared on logout or
  account switch; locked notes' images are never written there. API image requests use `cache: 'no-store'`, so
  the browser's HTTP cache (which the app can't clear) never holds them.
