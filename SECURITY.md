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

Reconsider if noted. ever renders third-party scripts or user-supplied HTML.

## Rate limits (H1, M1)

Stored in MongoDB (`ratelimits`, TTL-indexed), so they hold across serverless instances.

| What | Limit | After |
| --- | --- | --- |
| Failed sign-ins per email | 5 / 15 min, growing delay from the 2nd | 429 + `Retry-After` until the window ends (also for the right password) |
| Failed sign-ins per IP | 20 / 15 min | 429 |
| Sign-up attempts per IP | 20 / hour | 429 |
| Wrong account password (signed in) | 5 / 15 min per account | 429 |
| Wrong note PIN | 4 free, then waits of 5, 10, 20… min (max 2 h); the count only resets on a correct PIN | after 10 in total, PIN entry needs the account password |

Nothing locks an account permanently. Trade-off: someone who knows an email can keep that account's
sign-ins paused for 15 minutes at a time. Client IPs come from Vercel's own headers
(`x-vercel-forwarded-for` / `x-real-ip`), never a client-supplied `X-Forwarded-For`.

Tests: in-process server tests set `RATE_LIMITS=off`; the local QA stack accepts an
`X-Rate-Limit-Bypass` header matching `RATE_LIMIT_BYPASS_TOKEN`. Neither is honoured when running on
Vercel (`VERCEL` is set), so production can't be configured into a bypass by accident.
