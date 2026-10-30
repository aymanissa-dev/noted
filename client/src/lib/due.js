// Reminders / due dates. Stored in UTC on the server; shown and entered in the user's time zone
// (a synced preference, Africa/Nairobi by default), whatever zone the device itself is in.
// Plain JS, no imports, so it can be unit tested in Node.

export const DEFAULT_TIME_ZONE = 'Africa/Nairobi';
export const zoneOf = (user) => user?.preferences?.timeZone || DEFAULT_TIME_ZONE;
const MIN = 60e3; const HOUR = 60 * MIN; const DAY = 24 * HOUR;
export const SOON_MS = DAY; // "due soon" window

const partsCache = new Map();
function fmt(tz) {
  if (!partsCache.has(tz)) partsCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }));
  return partsCache.get(tz);
}
// Wall-clock parts of an instant in a zone: { y, m (1-12), d, h, min, wd (0 = Sunday) }.
export function zonedParts(date, tz) {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(date)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, s: +p.second, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
const offsetAt = (ms, tz) => { const p = zonedParts(ms, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000; };
// The instant when the wall clock in `tz` reads y-m-d h:min (DST gaps resolve forward).
export function zonedToUtc(y, m, d, h, min, tz) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - offsetAt(guess, tz);
  t = guess - offsetAt(t, tz);
  return new Date(t);
}
const pad = (n) => String(n).padStart(2, '0');
// For <input type=date> / <input type=time>.
export function toInputs(iso, tz) {
  const p = zonedParts(iso, tz);
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.min)}` };
}
export function fromInputs(date, time, tz) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ''); const tm = /^(\d{2}):(\d{2})/.exec(time || '09:00');
  if (!dm || !tm) return null;
  return zonedToUtc(+dm[1], +dm[2], +dm[3], +tm[1], +tm[2], tz).toISOString();
}
// Calendar-day difference between two instants, in the zone.
function dayDiff(a, b, tz) {
  const pa = zonedParts(a, tz); const pb = zonedParts(b, tz);
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / DAY);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// "Today, 09:00" · "Tomorrow, 18:30" · "Yesterday, 09:00" · "Mon 2 Nov, 09:00" · "2 Nov 2027, 09:00"
export function formatDue(iso, tz, now = Date.now()) {
  const p = zonedParts(iso, tz); const n = zonedParts(now, tz);
  const time = `${pad(p.h)}:${pad(p.min)}`;
  const dd = dayDiff(iso, now, tz);
  if (dd === 0) return `Today, ${time}`;
  if (dd === 1) return `Tomorrow, ${time}`;
  if (dd === -1) return `Yesterday, ${time}`;
  if (p.y !== n.y) return `${p.d} ${MONTHS[p.m - 1]} ${p.y}, ${time}`;
  return `${DAYS[p.wd]} ${p.d} ${MONTHS[p.m - 1]}, ${time}`;
}
// 'overdue' | 'soon' (within a day) | 'later' | null
export function dueState(iso, now = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (t <= now) return 'overdue';
  return t - now <= SOON_MS ? 'soon' : 'later';
}
// Quick picks in the reminder dialog, as ISO instants.
export function presets(tz, now = Date.now()) {
  const p = zonedParts(now, tz);
  const at = (addDays, h) => { const base = new Date(Date.UTC(p.y, p.m - 1, p.d + addDays)); return zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, 0, tz).toISOString(); };
  const out = [];
  if (p.h < 18) out.push(['Later today', at(0, Math.max(p.h + 3, 17) > 20 ? 20 : Math.max(p.h + 3, 17))]);
  else out.push(['In 1 hour', new Date(Math.ceil((now + HOUR) / (5 * MIN)) * 5 * MIN).toISOString()]);
  out.push(['Tomorrow morning', at(1, 9)]);
  const toMonday = ((8 - p.wd) % 7) || 7;
  out.push(['Next week', at(toMonday, 9)]);
  return out;
}
export const snooze = (now = Date.now(), ms = HOUR) => new Date(Math.ceil((now + ms) / MIN) * MIN).toISOString();
// Zones for the Settings picker (the browser's list when it has one).
export function timeZones() {
  try { const z = Intl.supportedValuesOf('timeZone'); if (z.length) return z.includes('UTC') ? z : ['UTC', ...z]; } catch { /* older browsers */ }
  return [DEFAULT_TIME_ZONE, 'UTC', 'Europe/London', 'Europe/Lisbon', 'America/New_York', 'Asia/Dubai'];
}
