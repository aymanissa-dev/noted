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
| live-extra.mjs | accent color, login activity, stats, dark mode, 375px, screenshots |

Server-side (`npm test` in `server/`): smoke, v2 features, password policy, and cross-account authorization + voice API.
Run the authz check against a deployment with `API=https://…/api node server/test-authz.js` (creates and deletes two throwaway accounts).
