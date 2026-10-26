// Prepares a picked/pasted/dropped image for upload, in the browser:
//  - only real images (checked by their first bytes); SVG is refused (it can carry scripts);
//  - resized so the long side is at most MAX_SIDE and re-encoded (WebP 0.82, or JPEG/PNG where the
//    browser can't encode WebP; transparency kept). Re-encoding drops all metadata (EXIF, GPS, …);
//  - GIFs are kept as they are (so animations survive) when they fit, since they carry no EXIF;
//  - the result must be at most MAX_BYTES, well under the server's request limit.
export const MAX_SIDE = 2000;
export const MAX_BYTES = 3 * 1024 * 1024;
export const QUALITY = 0.82;
export const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,image/avif';

const fail = (message) => Object.assign(new Error(message), { userFacing: true });
export const SVG_MESSAGE = 'SVG images can’t be added (they can contain scripts). Use PNG, JPEG, WebP or GIF.';
export const TYPE_MESSAGE = 'Only images can be added: PNG, JPEG, WebP or GIF.';

export function sniff(b) {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  const a = (i, j) => String.fromCharCode(...b.slice(i, j));
  if (a(0, 6) === 'GIF87a' || a(0, 6) === 'GIF89a') return 'image/gif';
  if (a(0, 4) === 'RIFF' && a(8, 12) === 'WEBP') return 'image/webp';
  if (a(4, 8) === 'ftyp') return 'image/heif'; // HEIC/AVIF: decoded by the browser if it can
  if (/^\s*</.test(a(0, 12))) return 'text/markup'; // SVG/HTML/XML
  return null;
}

// Quick check before anything is read: is this worth trying at all?
export function checkFile(file) {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/svg+xml' || /\.svgz?$/i.test(file.name || '')) return SVG_MESSAGE;
  if (type && !type.startsWith('image/')) return TYPE_MESSAGE;
  return null;
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async'; img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

function hasAlpha(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

export async function prepareImage(file) {
  const early = checkFile(file);
  if (early) throw fail(early);
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const real = sniff(head);
  if (real === 'text/markup') throw fail(SVG_MESSAGE);
  if (real === 'image/gif') {
    if (file.size > MAX_BYTES) throw fail('GIFs over 3 MB can’t be added (compressing would lose the animation). Try a shorter or smaller GIF.');
    const dv = new DataView(await file.slice(6, 10).arrayBuffer());
    return { blob: file.type === 'image/gif' ? file : new Blob([file], { type: 'image/gif' }), width: dv.getUint16(0, true), height: dv.getUint16(2, true) };
  }
  let src;
  try { src = await decode(file); } catch { throw fail('That image couldn’t be read. Use PNG, JPEG, WebP or GIF.'); }
  const sw = src.width || src.naturalWidth; const sh = src.height || src.naturalHeight;
  if (!sw || !sh) throw fail('That image couldn’t be read. Use PNG, JPEG, WebP or GIF.');
  let scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const mayHaveAlpha = real !== 'image/jpeg';
  for (let attempt = 0; attempt < 5; attempt++) {
    const w = Math.max(1, Math.round(sw * scale)); const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: mayHaveAlpha });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    const alpha = mayHaveAlpha && hasAlpha(ctx, w, h);
    for (const q of [QUALITY, 0.7, 0.55]) {
      let blob = await toBlob(canvas, 'image/webp', q);
      if (!blob || blob.type !== 'image/webp') blob = alpha ? await toBlob(canvas, 'image/png') : await toBlob(canvas, 'image/jpeg', q); // no WebP encoder (older Safari)
      if (blob && UPLOAD_TYPES.includes(blob.type) && blob.size <= MAX_BYTES) { src.close?.(); return { blob, width: w, height: h }; }
      if (blob?.type === 'image/png') break; // lossless: quality doesn't help, shrink instead
    }
    scale *= 0.7;
  }
  src.close?.();
  throw fail('That image is too large to add, even after compressing it (max 3 MB).');
}

// A readable default alt text from the file name ("" for generic names like image.png).
// Alt text for a new image: its file name when that says something, else a plain description of
// where it came from ("Pasted image", "Image"), never empty. It can be edited any time (Alt button).
export function altFromName(name = '', fallback = 'Image') {
  const stem = String(name).replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
  if (/^screen ?shot\b/i.test(stem)) return 'Screenshot';
  return /^(image|img|blob|photo|picture|screenshot|pasted|untitled|dsc|dcim|pxl)?\s*[\d\s]*$/i.test(stem) ? fallback : stem.slice(0, 120);
}
