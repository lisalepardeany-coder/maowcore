const test = require('node:test');
const assert = require('node:assert/strict');
const { dayState, uptimePct, addGapMinutes, dayKey } = require('../lib/status-monitor');

test('status: dayState picks the right bar colour', () => {
  assert.equal(dayState(null), 'none');
  assert.equal(dayState({ up: 1440 }), 'up');
  assert.equal(dayState({ up: 1430, down: 10 }), 'degraded');
  assert.equal(dayState({ up: 1400, down: 40 }), 'down');
  assert.equal(dayState({ up: 1400, degraded: 2 }), 'up');
  assert.equal(dayState({ up: 1400, degraded: 6 }), 'degraded');
  assert.equal(dayState({ up: 1400, maint: 40 }), 'maintenance');
});

test('status: uptime ignores maintenance and days with no data', () => {
  assert.equal(uptimePct([null, null]), null);
  assert.equal(uptimePct([{ up: 90, down: 10 }, null]), 90);
  assert.equal(uptimePct([{ up: 100, maint: 500 }]), 100);
});

test('status: minute view shows each minute, ending at the last recorded one', () => {
  const { minuteSeries, minuteUptime } = require('../lib/status-monitor');
  const now = new Date(2026, 10, 10, 12, 0, 30).getTime();
  const m = Math.floor(now / 60000);
  const log = { [m - 1]: 'u', [m - 2]: 'd', [m - 3]: 'g' };   // current minute not sampled yet
  const s = minuteSeries(log, now, 5);
  assert.equal(s.length, 5);
  assert.deepEqual(s.map((x) => x.state), ['none', 'none', 'degraded', 'down', 'up']);
  assert.equal(s[4].t, (m - 1) * 60000);
  assert.equal(minuteUptime(log, now, 5), 66.67);
  assert.equal(minuteUptime({}, now, 90), null);
});

test('status: hour view sums each hour of minutes', () => {
  const { hourSeries, hourState } = require('../lib/status-monitor');
  const now = new Date(2026, 10, 10, 12, 30).getTime();
  const h = Math.floor(now / 3600000);
  const log = {};
  for (let i = 0; i < 60; i++) log[(h - 1) * 60 + i] = i < 12 ? 'd' : 'u';   // last hour: 12 min down
  for (let i = 0; i < 30; i++) log[h * 60 + i] = 'u';
  const s = hourSeries(log, now, 3);
  assert.deepEqual(s.map((x) => x.state), ['none', 'down', 'up']);
  assert.equal(s[1].downMin, 12);
  assert.equal(hourState({ up: 58, down: 2 }), 'degraded');
  assert.equal(hourState({ up: 60 }), 'up');
});

test('status: an offline gap is marked down in the minute log too', () => {
  const { addGapToMinutes } = require('../lib/status-monitor');
  const minutes = {};
  const now = Date.now();
  addGapToMinutes(minutes, ['bot'], now - 10 * 60000, now);
  assert.equal(Object.keys(minutes.bot).length, 10);
  assert.ok(Object.values(minutes.bot).every((c) => c === 'd'));
  const huge = {};
  addGapToMinutes(huge, ['bot'], now - 5 * 86400000, now);
  assert.ok(Object.keys(huge.bot).length <= 24 * 60, 'only the last 24 h is kept');
});

test('status: an offline gap is counted minute by minute across days', () => {
  const days = {};
  const end = new Date(2026, 10, 10, 0, 30).getTime();
  addGapMinutes(days, ['bot'], end - 60 * 60000, end);
  assert.equal(days[dayKey(end - 3600000)].bot.down, 30);
  assert.equal(days[dayKey(end)].bot.down, 30);
});
