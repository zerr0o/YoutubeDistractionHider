"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const W = require("../shared/schedule.js");
const at = (day, hour = 0, minute = 0) => new Date(2026, 0, day, hour, minute);
const slot = (start, end) => ({ start, end });
const custom = (day, slots, extra = {}) => ({ schedule: [{ day, enabled: true, slots }], ...extra });

test("classic script and CommonJS share the documented API", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../shared/schedule.js"), "utf8"), context);
  assert.equal(context.WorkTime.SETTINGS_KEY, "workTimeSettings");
  assert.equal(typeof context.WorkTime.evaluateState, "function");
  assert.equal(globalThis.WorkTime, W);
});

test("defaults are weekdays, two ranges, independent clones and immutable", () => {
  const a = W.normalizeSettings();
  const b = W.normalizeSettings(null);
  assert.deepEqual(a, W.DEFAULT_SETTINGS);
  assert.deepEqual(a.schedule.filter(d => d.enabled).map(d => d.day), [1, 2, 3, 4, 5]);
  a.schedule[1].slots[0].start = "01:00";
  assert.equal(b.schedule[1].slots[0].start, "09:00");
  assert.ok(Object.isFrozen(W.DEFAULT_SETTINGS.schedule[1].slots[0]));
});

test("start inclusive, end exclusive, lunch gap, evening and weekends", () => {
  for (const [hour, minute, active, nextHour] of [
    [8, 59, false, 9], [9, 0, true, 12], [11, 59, true, 12],
    [12, 0, false, 14], [14, 0, true, 18], [17, 59, true, 18]
  ]) {
    const state = W.evaluateState(undefined, at(5, hour, minute));
    assert.equal(state.active, active);
    assert.equal(state.reason, active ? "scheduled" : "outside-schedule");
    assert.equal(state.nextChange, +at(5, nextHour));
  }
  assert.equal(W.getNextTransition(undefined, at(9, 18)), +at(12, 9));
  assert.equal(W.evaluateState(undefined, at(10, 10)).active, false);
  assert.equal(W.evaluateState(undefined, at(11, 10)).active, false);
});

test("days are independent and disabled ranges are preserved but ignored", () => {
  const settings = { schedule: [
    { day: 1, enabled: false, slots: [slot("09:00", "12:00")] },
    { day: 2, enabled: true, slots: [slot("10:00", "11:00")] }
  ] };
  assert.equal(W.normalizeSettings(settings).schedule[1].slots.length, 1);
  assert.equal(W.evaluateState(settings, at(5, 10)).active, false);
  assert.equal(W.getNextTransition(settings, at(5, 10)), +at(6, 10));
  assert.equal(W.evaluateState(settings, at(6, 10)).active, true);
});

test("overnight Friday continues into disabled Saturday, ends exclusively", () => {
  const settings = custom(5, [slot("22:00", "02:00")]);
  assert.equal(W.getNextTransition(settings, at(9, 21)), +at(9, 22));
  assert.equal(W.evaluateState(settings, at(9, 22)).active, true);
  assert.equal(W.evaluateState(settings, at(10, 1)).active, true);
  assert.equal(W.getNextTransition(settings, at(10, 1)), +at(10, 2));
  assert.equal(W.evaluateState(settings, at(10, 2)).active, false);
  assert.equal(W.getNextTransition(settings, at(10, 2)), +at(16, 22));
});

test("Sunday overnight wraps into Monday", () => {
  const settings = custom(0, [slot("23:00", "01:00")]);
  assert.equal(W.evaluateState(settings, at(5, 0, 30)).active, true);
  assert.equal(W.getNextTransition(settings, at(5, 0, 30)), +at(5, 1));
});

test("overlapping, nested and adjacent slots do not cause false transitions", () => {
  const settings = custom(1, [slot("09:00", "12:00"), slot("10:00", "11:00"), slot("12:00", "15:00")]);
  for (const hour of [9, 10, 11, 12, 14]) {
    assert.equal(W.evaluateState(settings, at(5, hour)).active, true);
    assert.equal(W.getNextTransition(settings, at(5, hour)), +at(5, 15));
  }
});

test("overnight overlap with the next day is one continuous range", () => {
  const settings = { schedule: [
    { day: 1, enabled: true, slots: [slot("22:00", "03:00")] },
    { day: 2, enabled: true, slots: [slot("02:00", "05:00")] }
  ] };
  assert.equal(W.getNextTransition(settings, at(5, 23)), +at(6, 5));
});

test("manual controls and pause precedence", () => {
  assert.deepEqual(W.evaluateState({ mode: "on" }, at(10)), { active: true, reason: "manual-on", nextChange: null });
  assert.deepEqual(W.evaluateState({ mode: "off", pauseUntil: +at(12) }, at(5)), { active: false, reason: "manual-off", nextChange: null });
  const settings = { mode: "on", pauseUntil: +at(5, 11) };
  assert.deepEqual(W.evaluateState(settings, at(5, 10)), { active: false, reason: "paused", nextChange: +at(5, 11) });
  assert.deepEqual(W.evaluateState(settings, at(5, 11)), { active: true, reason: "manual-on", nextChange: null });
});

test("auto pause expiry during and outside schedule; long pauses", () => {
  assert.equal(W.getNextTransition({ pauseUntil: +at(5, 11) }, at(5, 10)), +at(5, 11));
  assert.equal(W.getNextTransition({ pauseUntil: +at(5, 13) }, at(5, 10)), +at(5, 14));
  assert.equal(W.getNextTransition({ pauseUntil: +at(5, 12) }, at(5, 10)), +at(5, 14));
  assert.equal(W.getNextTransition({ pauseUntil: +at(26, 10) }, at(5)), +at(26, 10));
  assert.equal(W.evaluateState({ pauseUntil: +at(5, 11) }, at(5, 11)).reason, "scheduled");
});

test("empty and continuously covered weeks have no next active change", () => {
  assert.equal(W.getNextTransition({ schedule: [] }, at(5)), null);
  const schedule = Array.from({ length: 7 }, (_, day) => ({ day, enabled: true,
    slots: [slot("00:00", "13:00"), slot("12:00", "01:00")] }));
  assert.deepEqual(W.evaluateState({ schedule }, at(5)), { active: true, reason: "scheduled", nextChange: null });
});

test("malformed storage is sanitized without mutating input", () => {
  for (const value of [null, false, [], "bad", 99]) assert.deepEqual(W.normalizeSettings(value), W.DEFAULT_SETTINGS);
  const raw = { version: 99, mode: "invalid", blurTitles: "true", pauseUntil: Infinity, schedule: [
    null, { day: "1", enabled: true, slots: [slot("09:00", "10:00")] },
    { day: 1, enabled: "true", slots: [slot("24:00", "12:00"), slot("9:00", "12:00"),
      slot("09:00", "09:00"), null, slot("09:60", "12:00"),
      slot("01:00", "02:00"), slot("03:00", "04:00"), slot("05:00", "06:00"), slot("07:00", "08:00")] }
  ] };
  const clean = W.normalizeSettings(raw);
  assert.equal(clean.version, 1);
  assert.equal(clean.mode, "auto");
  assert.equal(clean.blurTitles, false);
  assert.equal(clean.pauseUntil, 0);
  assert.equal(clean.schedule[1].enabled, false);
  assert.equal(clean.schedule[1].slots.length, 3);
  assert.equal(raw.schedule[2].slots.length, 9);
  for (const pauseUntil of [-1, "123", NaN, Infinity, 9e15]) assert.equal(W.normalizeSettings({ pauseUntil }).pauseUntil, 0);
  assert.equal(W.evaluateState({ schedule: "bad" }, at(5, 10)).active, false);
  assert.equal(W.getNextTransition(custom(1, [slot("09:00", "09:00")]), at(5)), null);
});

test("epoch input works and invalid Date fails explicitly", () => {
  assert.deepEqual(W.evaluateState({}, +at(5, 10)), W.evaluateState({}, at(5, 10)));
  assert.throws(() => W.evaluateState({}, new Date(NaN)), TypeError);
});

// Node applies TZ to local Date construction. Restore it so other tests keep the host zone.
function inNewYork(run) {
  const previous = process.env.TZ;
  process.env.TZ = "America/New_York";
  try { run(); } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test("spring-forward uses local constructor normalization for nonexistent times", () => inNewYork(() => {
  const date = (hour, minute = 0) => new Date(2026, 2, 8, hour, minute);
  assert.equal(date(1).getTimezoneOffset(), 300);
  assert.equal(date(3).getTimezoneOffset(), 240);
  assert.equal(date(2, 30).getHours(), 3);
  const settings = custom(0, [slot("02:30", "04:00")]);
  assert.equal(W.evaluateState(settings, date(3, 15)).active, false);
  assert.equal(W.getNextTransition(settings, date(1)), +date(3, 30));
  assert.equal(W.evaluateState(settings, date(3, 30)).active, true);
  assert.equal(W.getNextTransition(settings, date(3, 30)), +date(4));
  assert.equal(W.evaluateState(settings, date(4)).active, false);
  const overnight = custom(6, [slot("22:00", "04:00")]);
  const start = new Date(2026, 2, 7, 22);
  assert.equal(W.getNextTransition(overnight, start), +date(4));
  assert.equal((+date(4) - start) / 3600000, 5);
}));

test("fall-back picks the first ambiguous constructor time and does not restart", () => inNewYork(() => {
  const date = (hour, minute = 0) => new Date(2026, 10, 1, hour, minute);
  const first = date(1, 30);
  const second = new Date(+first + 3600000);
  assert.equal(first.getTimezoneOffset(), 240);
  assert.equal(second.getTimezoneOffset(), 300);
  assert.equal(second.getHours(), 1);
  const settings = custom(0, [slot("01:15", "01:45")]);
  assert.equal(W.evaluateState(settings, first).active, true);
  assert.equal(W.getNextTransition(settings, first), +date(1, 45));
  assert.equal(W.evaluateState(settings, second).active, false);
  assert.equal(W.getNextTransition(settings, second), +new Date(2026, 10, 8, 1, 15));
  const overnight = custom(6, [slot("22:00", "02:00")]);
  const start = new Date(2026, 9, 31, 22);
  assert.equal(W.evaluateState(overnight, second).active, true);
  assert.equal(W.getNextTransition(overnight, start), +date(2));
  assert.equal((+date(2) - start) / 3600000, 5);
}));
