/* MV3 service worker. State is always derived from local storage and local time. */
importScripts("shared/schedule.js");

const { SETTINGS_KEY, DEFAULT_SETTINGS, evaluateState } = globalThis.WorkTime;
const TRANSITION_ALARM = "work-time-transition";
const WATCHDOG_ALARM = "work-time-watchdog";
const REASON_LABELS = {
  paused: "Protection en pause",
  "manual-on": "Protection activée manuellement",
  "manual-off": "Protection désactivée manuellement",
  scheduled: "Protection active pendant vos horaires de travail",
  "outside-schedule": "Protection inactive hors des horaires de travail"
};

async function refresh() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const state = evaluateState(stored[SETTINGS_KEY]);
  await chrome.action.setBadgeBackgroundColor({ color: "#0D9488" });
  await chrome.action.setBadgeText({ text: state.active ? "ON" : "" });
  await chrome.action.setTitle({ title: `WorkTime — ${REASON_LABELS[state.reason]}` });
  await chrome.alarms.clear(TRANSITION_ALARM);
  if (state.nextChange !== null) {
    await chrome.alarms.create(TRANSITION_ALARM, { when: Math.max(Date.now() + 100, state.nextChange) });
  }
  await chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 1 });
}

// Serialize refreshes so a slow old read cannot overwrite a newer badge/alarm.
let pending = Promise.resolve();
function requestRefresh() {
  pending = pending.then(refresh).catch(error => console.warn("WorkTime refresh failed:", error));
  return pending;
}

chrome.runtime.onInstalled.addListener(() => {
  pending = pending.then(async () => {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    if (!Object.prototype.hasOwnProperty.call(stored, SETTINGS_KEY)) {
      await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
    }
  }).catch(error => console.warn("WorkTime initialization failed:", error));
  void requestRefresh();
});
chrome.runtime.onStartup.addListener(requestRefresh);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.prototype.hasOwnProperty.call(changes, SETTINGS_KEY)) {
    void requestRefresh();
  }
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === TRANSITION_ALARM || alarm.name === WATCHDOG_ALARM) void requestRefresh();
});

// Also refresh whenever Chrome wakes this service worker.
void requestRefresh();
