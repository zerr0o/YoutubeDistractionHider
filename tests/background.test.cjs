"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const KEY = "workTimeSettings";
const TRANSITION = "work-time-transition";
const WATCHDOG = "work-time-watchdog";
const source = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

function event() {
  const listeners = [];
  return { addListener: fn => listeners.push(fn), emit: (...args) => listeners.forEach(fn => fn(...args)) };
}
function worker(initial = {}, now = new Date(2026, 0, 5, 10).getTime()) {
  let clock = now;
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const data = structuredClone(initial);
  const log = { reads: 0, writes: 0, badges: [], titles: [], colors: [], warnings: [] };
  const alarms = new Map();
  const chrome = {
    runtime: { onInstalled: event(), onStartup: event() },
    storage: {
      onChanged: event(),
      local: {
        async get(key) { log.reads++; return Object.hasOwn(data, key) ? { [key]: structuredClone(data[key]) } : {}; },
        async set(values) {
          log.writes++;
          const changes = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { oldValue: data[key], newValue: structuredClone(value) };
            data[key] = structuredClone(value);
          }
          chrome.storage.onChanged.emit(changes, "local");
        }
      }
    },
    action: {
      async setBadgeBackgroundColor(value) { log.colors.push(value.color); },
      async setBadgeText(value) { log.badges.push(value.text); },
      async setTitle(value) { log.titles.push(value.title); }
    },
    alarms: {
      onAlarm: event(),
      async clear(name) { return alarms.delete(name); },
      async create(name, options) { alarms.set(name, { ...options }); }
    }
  };
  const context = vm.createContext({ chrome, Date: ClockDate,
    console: { warn: (...args) => log.warnings.push(args) },
    importScripts: name => vm.runInContext(source(name), context)
  });
  vm.runInContext(source("background.js"), context);
  async function settle() {
    // Await the worker's real queue, including refreshes added by storage writes.
    for (let i = 0; i < 20; i++) {
      const queue = vm.runInContext("pending", context);
      await queue;
      if (queue === vm.runInContext("pending", context)) return;
    }
    throw new Error("Worker queue did not settle");
  }
  return { chrome, data, log, alarms, settle, setTime: value => { clock = +value; } };
}

test("install initializes a missing key, preserves unrelated data, and sets active badge", async () => {
  const w = worker({ unrelated: "keep" });
  await w.settle();
  assert.equal(w.log.writes, 0, "a worker wake must not initialize storage");
  w.chrome.runtime.onInstalled.emit({ reason: "install" });
  await w.settle();
  assert.equal(w.log.writes, 1);
  assert.equal(w.data.unrelated, "keep");
  assert.equal(w.data[KEY].mode, "auto");
  assert.equal(w.data[KEY].schedule.length, 7);
  assert.equal(w.log.badges.at(-1), "ON");
  assert.equal(w.log.colors.at(-1), "#0D9488");
  assert.match(w.log.titles.at(-1), /Protection active pendant/);
  assert.equal(w.alarms.get(TRANSITION).when, +new Date(2026, 0, 5, 12));
  assert.equal(w.alarms.get(WATCHDOG).periodInMinutes, 1);
  assert.equal(w.log.warnings.length, 0);
});

test("install and updates never overwrite any existing value, including malformed storage", async () => {
  for (const value of [{ mode: "off", custom: "preserve" }, null, false, "bad"]) {
    const w = worker({ [KEY]: value });
    w.chrome.runtime.onInstalled.emit({ reason: "update" });
    await w.settle();
    assert.equal(w.log.writes, 0);
    assert.deepEqual(w.data[KEY], value);
    assert.equal(w.log.warnings.length, 0);
  }
});

test("local settings changes refresh badge and clear stale transition alarms", async () => {
  const w = worker();
  await w.settle();
  assert.ok(w.alarms.has(TRANSITION));
  await w.chrome.storage.local.set({ [KEY]: { mode: "off" } });
  await w.settle();
  assert.equal(w.log.badges.at(-1), "");
  assert.match(w.log.titles.at(-1), /désactivée manuellement/);
  assert.equal(w.alarms.has(TRANSITION), false);
  await w.chrome.storage.local.set({ [KEY]: { mode: "on" } });
  await w.settle();
  assert.equal(w.log.badges.at(-1), "ON");
  assert.match(w.log.titles.at(-1), /activée manuellement/);
  assert.equal(w.alarms.has(TRANSITION), false);
  const reads = w.log.reads;
  w.chrome.storage.onChanged.emit({ [KEY]: {} }, "sync");
  w.chrome.storage.onChanged.emit({ other: {} }, "local");
  w.chrome.alarms.onAlarm.emit({ name: "unrelated" });
  await w.settle();
  assert.equal(w.log.reads, reads);
});

test("pause expiry alarm resumes manual protection; off overrides pause", async () => {
  const expiry = +new Date(2026, 0, 5, 11);
  const w = worker({ [KEY]: { mode: "on", pauseUntil: expiry } });
  await w.settle();
  assert.equal(w.log.badges.at(-1), "");
  assert.match(w.log.titles.at(-1), /en pause/);
  assert.equal(w.alarms.get(TRANSITION).when, expiry);
  w.setTime(expiry);
  w.chrome.alarms.onAlarm.emit({ name: TRANSITION });
  await w.settle();
  assert.equal(w.log.badges.at(-1), "ON");
  assert.equal(w.alarms.has(TRANSITION), false);
  await w.chrome.storage.local.set({ [KEY]: { mode: "off", pauseUntil: expiry + 3600000 } });
  await w.settle();
  assert.equal(w.log.badges.at(-1), "");
  assert.match(w.log.titles.at(-1), /désactivée/);
  assert.equal(w.alarms.has(TRANSITION), false);
});

test("startup and watchdog reevaluate current local time", async () => {
  const w = worker();
  await w.settle();
  w.setTime(new Date(2026, 0, 5, 12));
  w.chrome.alarms.onAlarm.emit({ name: WATCHDOG });
  await w.settle();
  assert.equal(w.log.badges.at(-1), "");
  assert.match(w.log.titles.at(-1), /hors des horaires/);
  assert.equal(w.alarms.get(TRANSITION).when, +new Date(2026, 0, 5, 14));
  w.setTime(new Date(2026, 0, 5, 14));
  w.chrome.runtime.onStartup.emit();
  await w.settle();
  assert.equal(w.log.badges.at(-1), "ON");
  assert.equal(w.alarms.get(TRANSITION).when, +new Date(2026, 0, 5, 18));
});

test("queued rapid changes finish with the newest state", async () => {
  const w = worker();
  await w.settle();
  await w.chrome.storage.local.set({ [KEY]: { mode: "on" } });
  await w.chrome.storage.local.set({ [KEY]: { mode: "off" } });
  await w.settle();
  assert.equal(w.log.badges.at(-1), "");
  assert.equal(w.alarms.has(TRANSITION), false);
  assert.equal(w.log.warnings.length, 0);
});
