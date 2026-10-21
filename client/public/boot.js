// Runs before first paint (loaded synchronously from index.html; a file, not inline, so the
// Content-Security-Policy can forbid inline scripts): apply the saved accent and theme.
try {
  var a = localStorage.getItem('noted.accent');
  var m = { amber: '245 158 11', rose: '244 63 94', emerald: '16 185 129', sky: '14 165 233', violet: '139 92 246', stone: '120 113 108' };
  if (m[a]) document.documentElement.style.setProperty('--accent', m[a]);
} catch (e) { /* storage unavailable */ }
try {
  // 'system' follows the OS setting.
  var t = localStorage.getItem('noted.theme') || 'system';
  var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
} catch (e) { /* storage unavailable */ }
