// Instant, client-side hints for new passwords. The server has the full check (15k common
// passwords + Have I Been Pwned breach lookup); this only catches the obvious ones early.
const TOP = new Set('password passw0rd 12345678 123456789 1234567890 qwertyuiop qwerty123 iloveyou 11111111 00000000 abcd1234 1q2w3e4r letmein1 welcome1 sunshine princess football baseball superman starwars trustno1 whatever dragon123 monkey123 asdfghjkl zxcvbnm1 computer michael1 jennifer shadow12 master12 password1 password123 qwertyui 87654321 iloveyou1 noted123'.split(' '));
const base = (pw) => pw.toLowerCase().replace(/[\d!@#$%^&*()_+=.,?-]+$/, '').replace(/^[\d!@#$%^&*()_+=.,?-]+/, '');

export const PASSWORD_HINT = 'At least 8 characters. Avoid common passwords: a few unrelated words work well.';

export function passwordProblem(pw, { email = '', name = '' } = {}) {
  if (pw.length < 8) return `Use at least 8 characters${pw ? ` (${8 - pw.length} more)` : ''}.`;
  const lower = pw.toLowerCase(); const b = base(pw);
  const strip = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const mine = [strip(email.split('@')[0]), ...name.toLowerCase().split(/\s+/).map(strip)].filter((p) => p.length >= 4);
  if (mine.some((p) => strip(pw).includes(p) && strip(pw).length - p.length <= 4)) return 'Don’t base your password on your name or email.';
  if (TOP.has(lower) || TOP.has(b) || ['password', 'qwerty', 'letmein', 'welcome', 'iloveyou', 'admin'].includes(b) || /^(.)\1+$/.test(pw) || '01234567890123456789'.includes(pw)) {
    return 'That password is too common and easy to guess. Try a few unrelated words.';
  }
  return '';
}
