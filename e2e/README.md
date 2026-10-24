# Browser checks (puppeteer-core + Chrome)

Each script registers its own throwaway `…@noted.test` user and deletes it at the end.

```bash
npm i puppeteer-core          # once, in this folder
# local: API via `npm run dev:memory` (port 5055) + a built client on 4173
node editor.mjs
# live
BASE=https://noted-lac-phi.vercel.app API=https://noted-lac-phi.vercel.app/api node live-extra.mjs
```

| Script | Covers |
|---|---|
| layout.mjs | sidebar (smart, recent, folders, tags), folder filter, sticky toolbar, mobile bottom nav, 375px |
| split.mjs | split view, switching notes flushes edits, new-note id handoff |
| editor.mjs | Markdown, slash menu, checklists, highlights, outline, folding, find & replace, :emoji, undo across reloads, focus mode, print |
| lockcm.mjs | PIN-locked notes in the editor, no local undo history |
| merge.mjs | multi-select merge with order, Undo |
| backup.mjs | encrypted backup download + restore, wrong password, duplicate skipping |
| voice.mjs | voice note via fake microphone, authed playback |
| anim.mjs | FLIP, leave/slide-in, save checkmark, PIN shake/open, dot bounce, reduced motion |
| v4.mjs | QA v3 regressions: typewriter centering, palette Enter, `/Heading 1`, `:smile`, quick capture focus, live sidebar tags, tour replay, editor focus ring, password messages |
| sw.mjs | service worker offline: no `no-response` errors, shell loads offline |
| v4shots.mjs | before/after screenshots at 2560/1920/1280/375, light + dark: landing, list, editor, archive empty state, note not found, settings (`OUT`, `PRE`, `WIDTHS`, `THEMES`, `LANDING_ONLY`) |
| v5.mjs | QA v3 retest: full-width shell at 1920/2560, standalone typewriter (toolbar, palette, Alt+Shift+T), fast `/Heading 2` after an emoji line, Enter exits empty list items, note-not-found state, online status recovers without reload, landing CTA wording + axe color contrast (light/dark; needs `axe-core`) |
| v6.mjs | QA retest 3: note load failure reproduced as QA did (title-only notes seen in the list, `GET /api/notes/<id>` blocked + hard reload, and an offline open) never shows an editable editor, shows "Couldn't load this note" + Try again, recovers on its own, and never writes over the server copy; Settings login activity and actions fail calmly with Try again (no raw "Failed to fetch"); build id + service worker update flags; landing CTAs in a fresh profile. Works against production with `BASE`/`API`. |
| v7.mjs | QA retest 4, the way QA did it in Chrome: notes created on the device (full local copies), service worker controlling, DevTools-style blocking (`Network.setBlockedURLs` `<API>/notes/<id>*` and `<API>/*`) from a list click and a hard reload, offline direct-URL loads, an older build's caches: never editable, "Couldn't load" + Try again, typing queues nothing, server untouched, recovers on its own. Cross-account isolation in one profile (A logs in/out, B registers; offline too; another tab switching accounts). List/Trash/Archive unreachable: calm status + Try again; empty-state pictures have no words. QA retest 5 (R5.x): offline trash actions disabled ("Needs a connection"), "Nothing saved on this device", honest preview wording, auto-recovery after reconnect and with one Try again click, no editor undo history left in IndexedDB after logout. `BUILD=<sha>` also checks an old profile picks up the new build by itself; `PROFILE=/dir` reuses a Chrome profile. |
| update.mjs | Local stack only (rebuilds `client/dist`): window focus checks for a new version (console log + `html[data-sw-checked]`); a rebuilt worker with a mocked build id reloads the page into it; page loads are network-first, so new tabs at `/`, `/notes`, `/notes/:id` run the newest build on the first load and the shell still loads offline; or with a note open shows "A new version of noted. is ready." and reloads after leaving the note. |
| live-extra.mjs | accent color, login activity, stats, dark mode, 375px, screenshots |
| security-ui.mjs | Local stack. Security review in the UI: 5th wrong password → "Too many sign-in attempts… 15 minutes"; sign-up with an existing email → generic message; new PINs must be 6 digits; locked notes need the PIN to be trashed / deleted for good / emptied (empty without the PIN keeps them); PIN lockout asks for the account password. |
| concurrency.mjs | Re-verify races, safe against production with ONE throwaway account: 20 parallel wrong sign-ins for one email → exactly 4 × 401 then 429 (right password 429 too); 30 parallel wrong PINs → 4 × 403, the rest 429 with one 5-minute wait; two parallel 205-folder imports → 200 folders; freed slots refilled by 20 parallel creates → exactly as many 201s. Skips password-confirm and per-IP bursts (they'd block the cleanup / the network). |
| final.mjs | QA final pass (a–f): 6-digit PIN copy; the login flash clears on input; a quick note whose create answer is lost (reload mid-request) makes one server note, the list and old `/notes/local-…` links go to the real id; trash / delete forever inside the 15-min unlock window don't re-ask; manifest wide + narrow screenshots and 96×96 shortcut icons load at their declared sizes. |
| v8.mjs | QA run on 1652677: Log out revokes the token on the server (old token 401 on /auth/me, /notes, /folders, /auth/activity), offline logout is sent once back online (CDP); unknown `/notes/local-…` shows "not found" with Back to notes, a mapped one redirects; unlocking shows the title in the list and sidebar at once (memory only); sidebar folders skeleton after sign-in (slowed `/folders`), never "no folders"; New folder appears at once while the server is slowed, duplicate names refused in the dialog; deleted-account banner survives offline/online toggles (CDP) and clears on typing. Works against production with `BASE`/`API`. |
| screenshots.mjs | Regenerates the manifest screenshots (`client/public/screenshots/*.webp`) from the local stack. |
| security.mjs | Security review against a deployment (`BASE`/`API`): security headers on HTML/JS/SW (CSP, XFO, nosniff, Referrer-Policy, Permissions-Policy), CORS allowlist, no Server-Timing in production, generic sign-up response, sign-in 429 + Retry-After, PIN rules + backoff, locked-note deletes, export PIN in POST body, import folder cap, sign-up limit per IP. Run it last against production (it uses up the IP's sign-ups for the hour). Prints the live headers. |
| images.mjs | images: paste / drop / toolbar picker / `/image` / mobile menu, resize ≤ 2000 px + EXIF/GPS stripped, SVG refused (client + 415), inline render + reload from cache, lightbox, alt text, offline “Needs a connection” + retry, locked 423 + PIN, other user 404, Markdown ZIP with images/, trash keeps / delete removes, logout wipes the cache, 375px dark (fixtures in `fixtures/`) |

Every suite logs Content-Security-Policy violations (console + `securitypolicyviolation`) to `CSP_LOG` (default `/tmp/csp-violations.log`); it should stay empty. Helper `api()` calls against the local stack send `X-Rate-Limit-Bypass` (honoured only off Vercel); browser traffic never does.

Server-side (`npm test` in `server/`): smoke, v2 features, password policy, cross-account authorization + voice API, images (`test-images.js`), and the security review fixes (`test-security.js`: rate limits on, everything else in-memory).
Run the authz check against a deployment with `API=https://…/api node server/test-authz.js` (creates and deletes two throwaway accounts); likewise `API=… node server/test-images.js`.
