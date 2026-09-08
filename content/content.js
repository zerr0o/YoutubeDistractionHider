/* WORK TIME — isolated-world content script. No page scripts or network calls. */
(() => {
  "use strict";
  const engine = globalThis.WorkTime;
  if (!engine) return;

  // Only thumbnail surfaces, never whole cards: their links, metadata and sizes survive.
  const surfaces = [
    "ytd-thumbnail", "a#thumbnail",
    "yt-thumbnail-view-model",
    ".yt-thumbnail-view-model", ".ytThumbnailViewModelHost",
    ".shortsLockupViewModelHostThumbnailContainer",
    ".yt-shorts-lockup-view-model__thumbnail",
    "ytd-reel-item-renderer #thumbnail",
    "yt-shorts-lockup-view-model a[href*='/shorts/']:has(img)"
  ].join(",");
  const cards = [
    "ytd-rich-item-renderer", "ytd-video-renderer", "ytd-grid-video-renderer",
    "ytd-compact-video-renderer", "ytd-playlist-video-renderer",
    "ytd-reel-item-renderer", "yt-lockup-view-model", "yt-shorts-lockup-view-model",
    ".yt-lockup-view-model", ".yt-shorts-lockup-view-model",
    ".ytLockupViewModelHost", ".shortsLockupViewModelHost"
  ].join(",");
  const titles = [
    "#video-title", "#video-title-link", ".yt-lockup-metadata-view-model__title",
    ".ytLockupMetadataViewModelTitle",
    ".shortsLockupViewModelHostMetadataTitle", ".yt-shorts-lockup-view-model__title"
  ].join(",");
  // Metadata only: a candidate containing a thumbnail can never be blurred.
  const details = [
    "#details", ".details", ".meta", "#meta", "#metadata", ".text-wrapper",
    ".yt-lockup-view-model__metadata", ".ytLockupViewModelMetadata",
    "yt-lockup-metadata-view-model", ".yt-lockup-metadata-view-model",
    ".ytLockupMetadataViewModelHost", ".ytLockupMetadataViewModelContent",
    ".shortsLockupViewModelHostMetadata", ".yt-shorts-lockup-view-model__metadata"
  ].join(",");
  const detailFallbacks = [
    titles, "ytd-channel-name", "#channel-name", "#channel-info", "#avatar-link",
    "#avatar", "yt-avatar-shape", ".yt-avatar-shape", ".yt-spec-avatar-shape",
    "#metadata-line", "#byline-container", "#badges", "#owner-badges",
    "ytd-badge-supported-renderer", ".yt-content-metadata-view-model",
    ".ytContentMetadataViewModelHost", ".shortsLockupViewModelHostMetadataSubhead"
  ].join(",");
  const watchedMetadata = "ytd-watch-metadata, #watch-header, #above-the-fold";
  const player = "ytd-player, #movie_player, #player-container, #player-container-outer, .player-container-background";
  const marked = new Set();
  const pending = new Set();
  let settings = engine.normalizeSettings(engine.DEFAULT_SETTINGS);
  let active = false;
  let settingsReady = false;
  let frame = 0;
  let deadline = 0;
  let storageRevision = 0;

  function mark(element, attribute) {
    if (element.closest(player)) return;
    if (!element.hasAttribute(attribute)) element.setAttribute(attribute, "");
    marked.add(element);
  }

  function pausePreview(video) {
    if (!active || !(video instanceof HTMLVideoElement) || video.closest(player)) return;
    if (video.closest(surfaces) || video.closest("ytd-video-preview, #video-preview")) {
      video.pause();
    }
  }

  function scan(root) {
    if (!(root instanceof Element) && root !== document) return;
    const thumbnails = [...root.querySelectorAll(surfaces)];
    if (root instanceof Element && root.matches(surfaces)) thumbnails.unshift(root);
    for (const thumbnail of thumbnails) {
      // Prefer the outer surface so nested modern view models get one label.
      if (thumbnail.parentElement?.closest(surfaces)) continue;
      mark(thumbnail, "data-work-time-thumbnail");
    }
    const containers = new Set(root.querySelectorAll(cards));
    if (root instanceof Element) {
      const container = root.closest(cards);
      if (container) containers.add(container);
    }
    for (const container of containers) {
      if (container.closest(watchedMetadata) || container.closest(player)) continue;
      for (const title of container.querySelectorAll(titles)) {
        // Retained as a diagnostic/test marker; only the details container gets a filter.
        if (!title.parentElement?.closest(titles)) mark(title, "data-work-time-title");
      }
      const candidates = [...container.querySelectorAll(`${details},${detailFallbacks}`)]
        .filter(element => !element.closest(player) && !element.closest(watchedMetadata)
          && !element.closest(surfaces) && !element.querySelector(surfaces));
      const outermost = new Set(candidates.filter(element =>
        !candidates.some(other => other !== element && other.contains(element))));
      for (const previous of container.querySelectorAll("[data-work-time-details]")) {
        if (!outermost.has(previous)) previous.removeAttribute("data-work-time-details");
      }
      for (const element of outermost) mark(element, "data-work-time-details");
    }
    if (root instanceof HTMLVideoElement) pausePreview(root);
    root.querySelectorAll("video").forEach(pausePreview);
  }

  function flush() {
    frame = 0;
    if (!active) { pending.clear(); return; }
    const roots = [...pending];
    pending.clear();
    // Drop descendant roots when the same mutation batch already includes their parent.
    for (const root of roots) {
      if (!root.isConnected) continue;
      if (!roots.some(other => other !== root && other.contains(root))) scan(root);
    }
    for (const element of marked) if (!element.isConnected) marked.delete(element);
  }

  function queue(root) {
    if (!active || !(root instanceof Element)) return;
    pending.add(root);
    if (!frame) frame = requestAnimationFrame(flush);
  }

  function refresh() {
    // Do not briefly apply defaults before the user's saved preferences arrive.
    const state = settingsReady
      ? engine.evaluateState(settings, new Date())
      : { active: false, nextChange: null };
    const wasActive = active;
    active = state.active;
    const html = document.documentElement;
    if (html) {
      html.setAttribute("data-work-time-active", String(active));
      html.setAttribute("data-work-time-blur", String(active && settings.blurTitles));
    }
    if (active && !wasActive) scan(document);
    if (!active && wasActive) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pending.clear();
      for (const element of marked) {
        element.removeAttribute("data-work-time-thumbnail");
        element.removeAttribute("data-work-time-title");
        element.removeAttribute("data-work-time-details");
      }
      marked.clear();
    }
    clearTimeout(deadline);
    if (state.nextChange != null) {
      deadline = setTimeout(refresh, Math.min(2147483647, Math.max(25, state.nextChange - Date.now() + 20)));
    }
  }

  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.addedNodes) queue(node);
      } else queue(record.target);
    }
    // document_start can precede creation of the root element.
    if (document.documentElement && !document.documentElement.hasAttribute("data-work-time-active")) refresh();
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "href"] });

  document.addEventListener("play", event => pausePreview(event.target), true);
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("pageshow", refresh);
  for (const event of ["yt-navigate-finish", "yt-page-data-updated"]) {
    document.addEventListener(event, () => {
      refresh();
      // SPA navigation can recycle a renderer without adding a node.
      if (active) queue(document.documentElement);
    });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[engine.SETTINGS_KEY]) return;
    storageRevision++;
    settings = engine.normalizeSettings(changes[engine.SETTINGS_KEY].newValue);
    settingsReady = true;
    refresh();
  });
  const initialRevision = storageRevision;
  chrome.storage.local.get(engine.SETTINGS_KEY, result => {
    if (chrome.runtime.lastError || initialRevision !== storageRevision) return;
    settings = engine.normalizeSettings(result[engine.SETTINGS_KEY]);
    settingsReady = true;
    refresh();
  });
  // CSS is already installed by the manifest; activation does not wait for a DOM scan.
  refresh();
  setInterval(refresh, 60000);
})();
