export const TITLE_MAX = 200;

// Turns quick-capture text into a note: the first line is the title, the rest is the content.
// A first line longer than TITLE_MAX is split at a word boundary and the overflow moves to the content.
export function parseQuickCapture(text) {
  const trimmed = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!trimmed) return null;
  const [first, ...rest] = trimmed.split('\n');
  let title = first.trim();
  let overflow = '';
  if (title.length > TITLE_MAX) {
    const cut = title.lastIndexOf(' ', TITLE_MAX);
    const at = cut > TITLE_MAX * 0.6 ? cut : TITLE_MAX;
    overflow = title.slice(at).trim();
    title = title.slice(0, at).trim();
  }
  const content = [overflow, rest.join('\n').trim()].filter(Boolean).join('\n');
  // Inline #tags in the title become tags (e.g. "Buy milk #errands").
  const tags = [...new Set((title.match(/(^|\s)#([\p{L}\p{N}_-]+)/gu) || []).map((t) => t.trim().slice(1).toLowerCase()))];
  if (tags.length) title = title.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, '').replace(/\s+/g, ' ').trim() || title;
  return { title, content, tags };
}
