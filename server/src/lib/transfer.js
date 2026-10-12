import JSZip from 'jszip';
import { NOTE_COLORS } from '../models/Note.js';

export const EXPORT_VERSION = 1;
export const MAX_IMPORT = 5000;

export const toExportNote = (n) => ({
  title: n.title,
  content: n.content,
  tags: n.tags,
  pinned: n.pinned,
  archived: n.archived,
  color: n.color || '',
  emoji: n.emoji || '',
  createdAt: n.createdAt,
  updatedAt: n.updatedAt,
});

const slugify = (s) =>
  (s || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'untitled';

const yamlString = (s) => JSON.stringify(String(s)); // JSON strings are valid YAML

export function toMarkdown(n) {
  const front = [
    '---',
    `title: ${yamlString(n.title || 'Untitled')}`,
    `tags: [${n.tags.map(yamlString).join(', ')}]`,
    `pinned: ${n.pinned}`,
    `archived: ${n.archived}`,
    ...(n.color ? [`color: ${n.color}`] : []),
    ...(n.emoji ? [`emoji: ${yamlString(n.emoji)}`] : []),
    `created: ${new Date(n.createdAt).toISOString()}`,
    `updated: ${new Date(n.updatedAt).toISOString()}`,
    '---',
    '',
  ].join('\n');
  return `${front}# ${n.title || 'Untitled'}\n\n${n.content}\n`;
}

export async function toMarkdownZip(notes) {
  const zip = new JSZip();
  const used = new Set();
  for (const n of notes) {
    let name = slugify(n.title);
    for (let i = 2; used.has(name); i++) name = `${slugify(n.title)}-${i}`;
    used.add(name);
    zip.file(`${name}.md`, toMarkdown(n), { date: new Date(n.updatedAt) });
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const validDate = (d) => {
  if (d === undefined || d === null) return null;
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Validates an import payload. Returns { notes } ready to insert or throws a message string.
export function parseImport(body) {
  const list = Array.isArray(body) ? body : body?.notes;
  if (!Array.isArray(list)) throw 'Expected a JSON array of notes or { "notes": [...] }';
  if (list.length === 0) throw 'No notes to import';
  if (list.length > MAX_IMPORT) throw `Too many notes (max ${MAX_IMPORT})`;

  return list.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw `Note ${i + 1} is not an object`;
    const { title = '', content = '', tags = [], pinned = false, archived = false } = raw;
    if (typeof title !== 'string' || typeof content !== 'string') throw `Note ${i + 1}: title and content must be strings`;
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) throw `Note ${i + 1}: tags must be an array of strings`;
    if (!title.trim() && !content.trim()) throw `Note ${i + 1} has no title or content`;
    if (title.length > 200) throw `Note ${i + 1}: title is longer than 200 characters`;
    if (content.length > 100000) throw `Note ${i + 1}: content is too long`;
    const color = NOTE_COLORS.includes(raw.color) ? raw.color : '';
    const emoji = typeof raw.emoji === 'string' && raw.emoji.length <= 16 ? raw.emoji.trim() : '';
    const now = new Date();
    const createdAt = validDate(raw.createdAt) || now;
    return {
      title: title.trim(),
      content,
      tags: [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
      pinned: Boolean(pinned),
      archived: Boolean(archived),
      color,
      emoji,
      createdAt,
      updatedAt: validDate(raw.updatedAt) || createdAt,
    };
  });
}
