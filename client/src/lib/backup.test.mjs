import assert from 'node:assert/strict';
import { encryptBackup, decryptBackup, isBackup } from './backup.js';
const data = { app: 'noted', version: 1, notes: [{ title: 'Ünïcode ✓', content: 'secret '.repeat(1000), tags: ['a'] }] };
const file = await encryptBackup(data, 'correct horse', { iterations: 100000 });
assert.ok(isBackup(file));
assert.ok(!JSON.stringify(file).includes('secret')); // ciphertext only
assert.deepEqual(await decryptBackup(file, 'correct horse'), data);
await assert.rejects(decryptBackup(file, 'wrong password'), /Wrong password/);
const tampered = { ...file, data: file.data.slice(0, -4) + (file.data.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
await assert.rejects(decryptBackup(tampered, 'correct horse'), /Wrong password|damaged/);
await assert.rejects(encryptBackup(data, 'short'), /at least 8/);
await assert.rejects(decryptBackup({ format: 'nope' }, 'x'), /isn’t a noted/);
const again = await encryptBackup(data, 'correct horse', { iterations: 100000 });
assert.notEqual(again.kdf.salt, file.kdf.salt); assert.notEqual(again.cipher.iv, file.cipher.iv);
console.log('✅ backup crypto tests passed');
