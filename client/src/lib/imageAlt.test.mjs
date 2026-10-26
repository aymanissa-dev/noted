// Alt text for inserted images: never empty (pasted images get "Pasted image").
import assert from 'node:assert/strict';
import { altFromName } from './imageProcess.js';

assert.equal(altFromName('image.png', 'Pasted image'), 'Pasted image');
assert.equal(altFromName('', 'Pasted image'), 'Pasted image');
assert.equal(altFromName('blob'), 'Image');
assert.equal(altFromName('IMG_2041.JPG'), 'Image');
assert.equal(altFromName('PXL_20260101_123456.jpg'), 'Image');
assert.equal(altFromName('Screenshot 2026-10-26 at 10.12.03.png'), 'Screenshot');
assert.equal(altFromName('kitchen-plan_v2.webp'), 'kitchen plan v2');
assert.ok(altFromName('x'.repeat(300) + '.png').length <= 120);
for (const n of ['', 'image.png', '123.jpg', 'pasted.png']) assert.ok(altFromName(n, 'Pasted image').length > 0);
console.log('✅ image alt tests passed');
