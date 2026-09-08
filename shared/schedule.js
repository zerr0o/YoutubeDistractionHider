/* Shared local-time scheduling engine. No browser APIs or dependencies. */
(function (root) {
  "use strict";

  const SETTINGS_KEY = "workTimeSettings";
  const DEFAULT_SETTINGS = {
    version: 1,
    mode: "auto",
    blurTitles: false,
    pauseUntil: 0,
    schedule: Array.from({ length: 7 }, (_, day) => ({
      day,
      enabled: day >= 1 && day <= 5,
      slots: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }]
    }))
  };
  DEFAULT_SETTINGS.schedule.forEach(day => {
    day.slots.forEach(Object.freeze);
    Object.freeze(day.slots);
    Object.freeze(day);
  });
  Object.freeze(DEFAULT_SETTINGS.schedule);
  Object.freeze(DEFAULT_SETTINGS);

  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const validTime = value => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

  function normalizeSettings(raw) {
    const input = isObject(raw) ? raw : {};
    // An absent schedule uses defaults. A supplied schedule never invents active days.
    const source = Array.isArray(input.schedule) ? input.schedule :
      (input.schedule === undefined ? DEFAULT_SETTINGS.schedule : []);
    const schedule = Array.from({ length: 7 }, (_, day) => {
      const entry = source.find(item => isObject(item) && item.day === day);
      const slots = entry && Array.isArray(entry.slots) ? entry.slots
        .filter(slot => isObject(slot) && validTime(slot.start) && validTime(slot.end) && slot.start !== slot.end)
        .slice(0, 3).map(slot => ({ start: slot.start, end: slot.end })) : [];
      return { day, enabled: !!entry && entry.enabled === true, slots };
    });
    return {
      version: 1,
      mode: ["auto", "on", "off"].includes(input.mode) ? input.mode : "auto",
      blurTitles: input.blurTitles === true,
      pauseUntil: typeof input.pauseUntil === "number" && Number.isFinite(input.pauseUntil) &&
        input.pauseUntil > 0 && input.pauseUntil <= 8640000000000000 ? input.pauseUntil : 0,
      schedule
    };
  }

  function timestamp(now) {
    const value = now instanceof Date ? now.getTime() : Number(now);
    if (!Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) {
      throw new TypeError("now must be a valid Date or epoch timestamp");
    }
    return value;
  }

  function localDate(base, offset, time) {
    // Calendar arithmetic, not 24-hour millisecond arithmetic: respects local DST.
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset,
      Math.floor(time / 60), time % 60, 0, 0).getTime();
  }

  function intervals(settings, time, days) {
    const base = new Date(time);
    const result = [];
    for (let offset = -1; offset <= days; offset += 1) {
      const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset).getDay();
      const entry = settings.schedule[day];
      if (!entry.enabled) continue;
      for (const slot of entry.slots) {
        const startMinutes = minutes(slot.start);
        const endMinutes = minutes(slot.end);
        const start = localDate(base, offset, startMinutes);
        const end = localDate(base, offset + (endMinutes < startMinutes ? 1 : 0), endMinutes);
        if (end > start) result.push([start, end]);
      }
    }
    return result;
  }

  function activeAt(settings, time) {
    if (settings.mode === "off" || settings.pauseUntil > time) return false;
    if (settings.mode === "on") return true;
    return intervals(settings, time, 0).some(([start, end]) => time >= start && time < end);
  }

  function nextTransition(settings, time) {
    if (settings.mode === "off") return null;
    if (settings.mode === "on") return settings.pauseUntil > time ? settings.pauseUntil : null;
    const initial = activeAt(settings, time);
    // Skip any long pause directly. Two local weeks cover the weekly pattern and DST.
    const horizon = Math.max(time, settings.pauseUntil);
    const candidates = intervals(settings, horizon, 15).flat();
    if (settings.pauseUntil > time) candidates.push(settings.pauseUntil);
    candidates.sort((a, b) => a - b);
    for (const candidate of new Set(candidates)) {
      if (candidate > time && candidate >= settings.pauseUntil && activeAt(settings, candidate) !== initial) {
        return candidate;
      }
    }
    return null;
  }

  function evaluateState(raw, now = new Date()) {
    const settings = normalizeSettings(raw);
    const time = timestamp(now);
    const active = activeAt(settings, time);
    const reason = settings.mode === "off" ? "manual-off" : settings.pauseUntil > time ? "paused" :
      settings.mode === "on" ? "manual-on" : active ? "scheduled" : "outside-schedule";
    return { active, reason, nextChange: nextTransition(settings, time) };
  }

  function getNextTransition(settings, now = new Date()) {
    return nextTransition(normalizeSettings(settings), timestamp(now));
  }

  const api = Object.freeze({ SETTINGS_KEY, DEFAULT_SETTINGS, normalizeSettings, evaluateState, getNextTransition });
  root.WorkTime = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
