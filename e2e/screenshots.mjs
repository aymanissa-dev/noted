// Regenerates the manifest's install screenshots (client/public/screenshots/*.webp) from the
// local stack with sample notes. Run: node e2e/screenshots.mjs (stack.sh running).
import { launch, pageAs, newUser, api, cleanup, sleep } from './h.mjs';
const OUT = new URL('../client/public/screenshots/', import.meta.url).pathname;
const { token, user } = await newUser('shots');
const folder = (await api('POST', '/folders', { name: 'Work' }, token)).data.folder;
const home = (await api('POST', '/folders', { name: 'Home' }, token)).data.folder;
const notes = [
  { title: 'Weekend plans', content: '# Weekend plans\n\n- [x] Farmers market\n- [ ] Call grandma\n- [ ] Finish the puzzle', tags: ['personal'], folderId: home._id },
  { title: 'Book list', content: 'The Overstory, Piranesi, A Psalm for the Wild-Built', tags: ['reading'], folderId: home._id },
  { title: 'Sprint retro', content: '## What went well\nShipped offline sync.\n\n## To improve\nSmaller PRs.', tags: ['team'], folderId: folder._id },
  { title: 'Project kickoff', content: 'Goals, owners, dates. Kickoff Monday 10:00.', tags: ['team', 'planning'], folderId: folder._id },
  { title: 'Pasta al limone', content: 'Lemon zest, butter, parmesan, pasta water. 12 minutes.', tags: ['recipes'] },
  { title: 'Ideas', content: 'A tiny app for houseplant watering reminders.', tags: ['ideas'], pinned: true },
];
for (const n of notes) await api('POST', '/notes', n, token);
const b = await launch();
for (const [name, opts] of [['notes-wide', { width: 1280, height: 800 }], ['notes-narrow', { width: 390, height: 844, mobile: true }]]) {
  const p = await pageAs(b, token, user, opts);
  await p.evaluate(() => localStorage.setItem('noted.tourDone', '1'));
  await p.goto(new URL('/notes', p.url()).href, { waitUntil: 'networkidle0' });
  await sleep(800);
  await p.screenshot({ path: `${OUT}${name}.webp`, type: 'webp', quality: 80 });
  await p.close();
}
await b.close(); await cleanup();
console.log('PASS screenshots written to', OUT);
