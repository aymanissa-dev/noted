import assert from 'node:assert/strict';
import { CHANGE_TYPES, RELEASES } from './changelog.js';
import { jsonFeed, rss } from '../../build/changelogFeeds.js';

// The data file drives the /changelog page and both feeds: keep it well-formed.
assert.ok(RELEASES.length > 0);
const versions = new Set();
RELEASES.forEach((r, i) => {
  const where = `release ${r.version}`;
  assert.match(r.version, /^\d+\.\d+(\.\d+)?$/, `${where}: version`);
  assert.ok(!versions.has(r.version), `${where}: duplicate version`); versions.add(r.version);
  assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, `${where}: date format`);
  assert.equal(new Date(`${r.date}T00:00:00Z`).toISOString().slice(0, 10), r.date, `${where}: real date`);
  if (i > 0) assert.ok(r.date <= RELEASES[i - 1].date, `${where}: newest first`);
  assert.ok(r.title?.trim() && r.summary?.trim(), `${where}: title and summary`);
  assert.ok(Array.isArray(r.changes) && r.changes.length, `${where}: changes`);
  r.changes.forEach((c) => {
    assert.ok(c.type in CHANGE_TYPES, `${where}: unknown type ${c.type}`);
    assert.ok(c.text?.trim(), `${where}: empty change`);
  });
  assert.equal(new Set(r.changes.map((c) => c.text)).size, r.changes.length, `${where}: duplicate change text`);
});
assert.match(RELEASES[0].title, /reminders/i, 'latest release is reminders and PDF export');
assert.ok(RELEASES.some((r) => /depth/i.test(r.title)), 'the 3D home page release is kept');
assert.ok(RELEASES.some((r) => /simpler/i.test(r.title)), 'the simpler app release is kept');
assert.ok(RELEASES.some((r) => /share/i.test(r.title)), 'share links release kept');
assert.ok(RELEASES.some((r) => /image/i.test(r.title)), 'image uploads release kept');

// Feeds: valid-looking, escaped, one item per release.
const xml = rss();
assert.ok(xml.startsWith('<?xml'));
assert.equal(xml.match(/<item>/g).length, RELEASES.length);
assert.ok(!/<description>[^<]*<(?!\/description)/.test(xml), 'item HTML is escaped');
const feed = JSON.parse(jsonFeed());
assert.equal(feed.version, 'https://jsonfeed.org/version/1.1');
assert.equal(feed.items.length, RELEASES.length);
assert.equal(feed.items[0].url, 'https://noted-lac-phi.vercel.app/changelog#v' + RELEASES[0].version.replace(/\./g, '-'));
console.log('changelog ok');
