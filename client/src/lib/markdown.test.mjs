import assert from 'node:assert/strict';
import { plainText, previewText, headings, toHtml } from './markdown.js';
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
