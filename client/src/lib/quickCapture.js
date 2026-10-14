export const TITLE_MAX = 200;
const TAG_RE = /(^|[\s(,;])#(?!\d+\b)([\p{L}\p{N}_-]*[\p{L}_][\p{L}\p{N}_-]*)/gu;
const stripCode = (s) => s.replace(/```[\s\S]*?(```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ');
export const findTags = (s) => [...String(s).matchAll(TAG_RE)].map((m) => m[2].toLowerCase().slice(0, 40));


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
  // Inline #tags anywhere become tags ("Buy milk #errands", or "#idea" on a later line).
  // Markdown headings ("# Title"), numbers ("#12"), and anchors in URLs ("/page#top") are not tags.
  const tags = [...new Set([...findTags(title), ...findTags(stripCode(content))])];
  if (findTags(title).length) title = title.replace(TAG_RE, '$1').replace(/\s+/g, ' ').trim() || title;
  return { title, content, tags };
}
