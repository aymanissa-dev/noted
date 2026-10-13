// Encrypted backups (.noted-backup): the export JSON is encrypted in the browser with AES-256-GCM,
// using a key derived from your password with PBKDF2-SHA-256. The password never leaves the device.
export const BACKUP_FORMAT = 'noted-backup';
export const PBKDF2_ITERATIONS = 310000;

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const base = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBackup(data, password, { iterations = PBKDF2_ITERATIONS } = {}) {
  if (!password || password.length < 8) throw new Error('Use a backup password of at least 8 characters.');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
  return {
    format: BACKUP_FORMAT, version: 1, createdAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: toB64(ct),
  };
}

export const isBackup = (obj) => obj && typeof obj === 'object' && obj.format === BACKUP_FORMAT;

export async function decryptBackup(file, password) {
  if (!isBackup(file) || file.version !== 1 || file.kdf?.name !== 'PBKDF2' || file.cipher?.name !== 'AES-GCM') throw new Error('This isn’t a noted. backup file.');
  const iterations = Number(file.kdf.iterations);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 5_000_000) throw new Error('Unsupported backup settings.');
  const key = await deriveKey(password, fromB64(file.kdf.salt), iterations);
  let plain;
  try { plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(file.cipher.iv) }, key, fromB64(file.data)); }
  catch { throw new Error('Wrong password, or the backup file is damaged.'); }
  return JSON.parse(dec.decode(plain));
}
