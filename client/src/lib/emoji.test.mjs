import assert from 'node:assert/strict';
import { EMOJI, searchEmoji } from './emoji.js';
assert.ok(EMOJI.length > 300);
assert.equal(searchEmoji('rocket')[0].char, '🚀');
assert.ok(searchEmoji('heart').some((e) => e.char === '❤️'));
assert.ok(searchEmoji('pizza').length === 1);
assert.equal(searchEmoji('zzzxq').length, 0);
assert.ok(EMOJI.every((e) => e.char && e.name));
console.log('✅ emoji tests passed');
