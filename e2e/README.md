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
| live-extra.mjs | accent color, login activity, stats, dark mode, 375px, screenshots |
