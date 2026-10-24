import assert from 'node:assert/strict';
import { plainText, previewText, headings, toHtml, splitImages, imageMarkdown } from './markdown.js';
// plain text is unchanged
assert.equal(plainText('just a note\nsecond line'), 'just a note\nsecond line');
assert.equal(plainText('# Title\n**bold** and _it_ and ==hi== and =={green}go==\n- [ ] task\n- item\n---\n`x`'), 'Title\nbold and it and hi and go\ntask\nitem\n\nx');
assert.equal(plainText('a [link](http://x.y) here'), 'a link here');
assert.deepEqual(headings('# A\ntext\n```\n# not\n```\n## B ##\n###C'), [{ level: 1, text: 'A', line: 1 }, { level: 2, text: 'B', line: 6 }]);
const h = toHtml('# Hi <b>\n\n- [x] done\n- [ ] todo\n\n==mark== **b**\n\n```\n<x>\n```\n---');
assert.ok(h.includes('<h1>Hi &lt;b&gt;</h1>'));
assert.ok(h.includes('<input type="checkbox" disabled checked> done'));
assert.ok(h.includes('<mark class="hl-yellow">mark</mark> <strong>b</strong>'));
assert.ok(h.includes('<pre><code>&lt;x&gt;</code></pre>') && h.includes('<hr>'));
assert.ok(!toHtml('[x](javascript:alert(1))').includes('href'));
// previews: no dividers, lone markers, slash leftovers, blank lines, or a repeated title (QA v3 design #3)
assert.equal(previewText('# Launch plan\n\n## Goals\n- [x] Ship v2\n\n---\n\n-\n–\n/Heading 1\nTuesday', 'Launch plan'), 'Goals\nShip v2\nTuesday');
assert.equal(previewText('---\n\nReview PR #12', 'Standup'), 'Review PR #12');
assert.equal(previewText('plain', ''), 'plain');
console.log('✅ markdown tests passed');

// Images: rendered only for noted-image ids, alt escaped, other rules can't reach inside the tag.
{
  const id = 'a'.repeat(24);
  const h2 = toHtml(`Look ![my_cat_pic "x" <b>](noted-image:${id}) and _em_\n![x](javascript:alert(1))\n![y](https://evil.test/a.png)`);
  assert.ok(h2.includes(`<img class="print-img" data-noted-image="${id}" alt="my_cat_pic &quot;x&quot; &lt;b&gt;">`), h2);
  assert.ok(h2.includes('<em>em</em>'));
  assert.ok(!h2.includes('javascript:') || !/<img[^>]+javascript/.test(h2));
  assert.ok(!/<img[^>]+evil/.test(h2), 'remote images are never rendered');
  assert.equal(plainText(`![a cat](noted-image:${id}) hi`), 'a cat hi');
  assert.deepEqual(splitImages(`a ![b](noted-image:${id}) c`), [{ text: 'a ' }, { image: id, alt: 'b' }, { text: ' c' }]);
  assert.equal(imageMarkdown(id, 'x]y\n[z'), `![x y z](noted-image:${id})`);
  assert.equal(previewText('/image\nhello'), 'hello');
  console.log('✅ markdown image tests passed');
}
