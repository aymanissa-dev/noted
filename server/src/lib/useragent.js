// Minimal user-agent parsing (browser + OS + device type). Good enough for an activity list.
export function parseUserAgent(ua = '') {
  const s = String(ua);
  const browser =
    /Edg(?:A|iOS)?\/(\d+)/.test(s) ? `Edge ${RegExp.$1}` :
    /OPR\/(\d+)/.test(s) ? `Opera ${RegExp.$1}` :
    /SamsungBrowser\/(\d+)/.test(s) ? `Samsung Internet ${RegExp.$1}` :
    /Firefox\/(\d+)/.test(s) || /FxiOS\/(\d+)/.test(s) ? `Firefox ${RegExp.$1}` :
    /CriOS\/(\d+)/.test(s) ? `Chrome ${RegExp.$1}` :
    /HeadlessChrome\/(\d+)/.test(s) ? `Headless Chrome ${RegExp.$1}` :
    /Chrome\/(\d+)/.test(s) ? `Chrome ${RegExp.$1}` :
    /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//.test(s) ? `Safari ${RegExp.$1}` :
    /^node|undici|curl|python|axios/i.test(s) ? 'Script / API client' : 'Unknown browser';
  const os =
    /Windows NT 10/.test(s) ? 'Windows' : /Windows/.test(s) ? 'Windows' :
    /iPhone|iPad|iPod/.test(s) ? (/iPad/.test(s) ? 'iPadOS' : 'iOS') :
    /Android (\d+)/.test(s) ? `Android ${RegExp.$1}` : /Android/.test(s) ? 'Android' :
    /CrOS/.test(s) ? 'ChromeOS' : /Mac OS X/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : 'Unknown OS';
  const device = /iPad|Tablet/.test(s) ? 'tablet' : /Mobi|iPhone|Android/.test(s) ? 'mobile' : 'desktop';
  return { browser, os, device };
}

// Masks an IP for display: IPv4 keeps the first two octets, IPv6 the first three groups.
export function maskIp(ip = '') {
  const v = String(ip).replace(/^::ffff:/, '').trim();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) { const [a, b] = v.split('.'); return `${a}.${b}.x.x`; }
  if (v.includes(':')) return `${v.split(':').slice(0, 3).join(':')}:…`;
  return '';
}
