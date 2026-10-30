import assert from 'node:assert/strict';
import { zonedToUtc, toInputs, fromInputs, formatDue, dueState, presets, zonedParts, snooze } from './due.js';

const NBO = 'Africa/Nairobi';
// Nairobi is UTC+3 all year
assert.equal(zonedToUtc(2026, 11, 2, 9, 0, NBO).toISOString(), '2026-11-02T06:00:00.000Z');
assert.equal(fromInputs('2026-11-02', '09:00', NBO), '2026-11-02T06:00:00.000Z');
assert.deepEqual(toInputs('2026-11-02T06:00:00.000Z', NBO), { date: '2026-11-02', time: '09:00' });
assert.equal(fromInputs('bad', '09:00', NBO), null);
// DST zones round-trip on both sides of the change
for (const [tz, iso] of [['Europe/Lisbon', '2026-07-01T08:00:00.000Z'], ['Europe/Lisbon', '2026-12-01T09:00:00.000Z'], ['America/New_York', '2026-03-09T13:30:00.000Z']]) {
  const { date, time } = toInputs(iso, tz);
  assert.equal(fromInputs(date, time, tz), iso, `${tz} round trip`);
}
// Midnight edge: 23:30 UTC on the 1st is already the 2nd in Nairobi
assert.deepEqual(toInputs('2026-11-01T23:30:00Z', NBO), { date: '2026-11-02', time: '02:30' });

const now = Date.parse('2026-10-30T10:00:00Z'); // Fri 30 Oct, 13:00 in Nairobi
assert.equal(formatDue('2026-10-30T15:00:00Z', NBO, now), 'Today, 18:00');
assert.equal(formatDue('2026-10-31T06:00:00Z', NBO, now), 'Tomorrow, 09:00');
assert.equal(formatDue('2026-10-29T06:00:00Z', NBO, now), 'Yesterday, 09:00');
assert.equal(formatDue('2026-11-02T06:00:00Z', NBO, now), 'Mon 2 Nov, 09:00');
assert.equal(formatDue('2027-01-05T06:00:00Z', NBO, now), '5 Jan 2027, 09:00');
// 22:30 UTC on the 30th is 01:30 on the 31st in Nairobi: "Tomorrow", not "Today"
assert.equal(formatDue('2026-10-30T22:30:00Z', NBO, now), 'Tomorrow, 01:30');

assert.equal(dueState(null, now), null);
assert.equal(dueState('2026-10-30T09:59:00Z', now), 'overdue');
assert.equal(dueState('2026-10-30T10:00:00Z', now), 'overdue');
assert.equal(dueState('2026-10-31T09:00:00Z', now), 'soon');
assert.equal(dueState('2026-11-05T09:00:00Z', now), 'later');

const pr = presets(NBO, now);
assert.deepEqual(pr.map(([l]) => l), ['Later today', 'Tomorrow morning', 'Next week']);
assert.equal(pr[0][1], '2026-10-30T14:00:00.000Z'); // 17:00 Nairobi
assert.equal(pr[1][1], '2026-10-31T06:00:00.000Z'); // Sat 09:00
assert.equal(pr[2][1], '2026-11-02T06:00:00.000Z'); // Mon 09:00
assert.equal(zonedParts(pr[2][1], NBO).wd, 1);
const evening = Date.parse('2026-10-30T16:00:00Z'); // 19:00 Nairobi
assert.equal(presets(NBO, evening)[0][0], 'In 1 hour');
assert.ok(Date.parse(snooze(now)) - now >= 3600e3);
console.log('✅ due date tests passed');
