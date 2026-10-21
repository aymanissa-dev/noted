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
| v4shots.mjs | before/after screenshots at 1920/1280/375, light + dark (`WIDTHS`, `THEMES`, `LANDING_ONLY`) |
| live-extra.mjs | accent color, login activity, stats, dark mode, 375px, screenshots |

Server-side (`npm test` in `server/`): smoke, v2 features, password policy, and cross-account authorization + voice API.
Run the authz check against a deployment with `API=https://…/api node server/test-authz.js` (creates and deletes two throwaway accounts).
