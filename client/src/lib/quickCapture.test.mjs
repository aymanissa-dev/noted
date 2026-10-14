import assert from 'node:assert/strict';
import { parseQuickCapture, TITLE_MAX } from './quickCapture.js';

assert.equal(parseQuickCapture('   '), null);
assert.deepEqual(parseQuickCapture('Buy milk'), { title: 'Buy milk', content: '', tags: [] });
assert.deepEqual(parseQuickCapture('Idea\nline two\nline three'), { title: 'Idea', content: 'line two\nline three', tags: [] });
assert.deepEqual(parseQuickCapture('Call mom #family #Todo'), { title: 'Call mom', content: '', tags: ['family', 'todo'] });
const long = 'word '.repeat(80).trim();
const p = parseQuickCapture(long);
assert.ok(p.title.length <= TITLE_MAX); assert.equal(`${p.title} ${p.content}`, long);
assert.deepEqual(parseQuickCapture('\r\nTitle\r\nBody\r\n'), { title: 'Title', content: 'Body', tags: [] });
// QA retest: a tag on a later line, in the body
assert.deepEqual(parseQuickCapture('QC line one\nline two #qatag'), { title: 'QC line one', content: 'line two #qatag', tags: ['qatag'] });
assert.deepEqual(parseQuickCapture('Mixed #Work\nsee #work and #home, (#idea)'), { title: 'Mixed', content: 'see #work and #home, (#idea)', tags: ['work', 'home', 'idea'] });
// not tags: headings, numbers, URL anchors, code
assert.deepEqual(parseQuickCapture('# Heading\nReview PR #12 at https://x.dev/a#top `#nope`\n```\n#also-not\n```').tags, []);
assert.deepEqual(parseQuickCapture('#solo').title, '#solo'); // a title that is only a tag stays readable
assert.deepEqual(parseQuickCapture('#solo').tags, ['solo']);
console.log('✅ quick capture tests passed');
