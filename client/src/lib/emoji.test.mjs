import assert from 'node:assert/strict';
import { EMOJI, searchEmoji } from './emoji.js';
assert.ok(EMOJI.length > 300);
assert.equal(searchEmoji('rocket')[0].char, '🚀');
assert.ok(searchEmoji('heart').some((e) => e.char === '❤️'));
assert.ok(searchEmoji('pizza').length === 1);
assert.equal(searchEmoji('zzzxq').length, 0);
assert.ok(EMOJI.every((e) => e.char && e.name));
// Exact name beats earlier entries whose keywords merely contain the word (QA v3 #4).
assert.equal(searchEmoji('smile')[0].char, '😄');
assert.equal(searchEmoji('SMILE ')[0].char, '😄');
assert.equal(searchEmoji('tada')[0].char, '🎉');
assert.equal(searchEmoji('fire')[0].char, '🔥');
console.log('✅ emoji tests passed');
