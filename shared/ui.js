/* Shared UI state. No network, account or analytics. */
(() => {
  'use strict';
  const engine = globalThis.WorkTime;
  let settings = engine.normalizeSettings(engine.DEFAULT_SETTINGS);
  let pending = Promise.resolve();
  let timer;
  const subscribers = new Set();
  const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const timeFormat = new Intl.DateTimeFormat('fr-FR', {hour: '2-digit', minute: '2-digit'});
  function notify() {
    for (const fn of subscribers) fn(settings);
    renderState();
  }
  function saveMessage(message, error = false) {
    const node = document.getElementById('save-state');
    if (node) { node.textContent = message; node.dataset.error = String(error); }
  }
  function update(mutator) {
    saveMessage('Enregistrement…');
    const operation = pending.then(async () => {
      const stored = await chrome.storage.local.get(engine.SETTINGS_KEY);
      const draft = engine.normalizeSettings(stored[engine.SETTINGS_KEY]);
      mutator(draft);
      const normalized = engine.normalizeSettings(draft);
      await chrome.storage.local.set({[engine.SETTINGS_KEY]: normalized});
      settings = normalized;
      notify();
      saveMessage('✓ Modifications enregistrées');
      return settings;
    });
    pending = operation.catch(error => {
      console.error('WORK TIME : enregistrement impossible', error);
      saveMessage('Échec de l’enregistrement. Réessayez.', true);
    });
    return pending;
  }
  function nextLabel(timestamp, active) {
    if (!timestamp) return active ? 'Actif jusqu’à votre prochaine décision' : 'Aucun créneau actif à venir';
    const next = new Date(timestamp);
    const now = new Date();
    const today = next.toDateString() === now.toDateString();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const day = today ? '' : next.toDateString() === tomorrow.toDateString() ? 'demain ' : `${dayNames[next.getDay()]} `;
    return `${active ? 'Actif jusqu’à' : 'Prochaine activation :'} ${day}${timeFormat.format(next)}`;
  }
  function renderState() {
    const state = engine.evaluateState(settings, new Date());
    const paused = state.reason === 'paused';
    const card = document.getElementById('status-card');
    if (card) card.dataset.state = paused ? 'paused' : state.active ? 'active' : 'inactive';
    const text = (id, value) => { const el = document.getElementById(id); if (el && el.textContent !== value) el.textContent = value; };
    text('status-label-text', paused ? 'Pause en cours' : state.active ? 'Filtre actif sur YouTube' : 'Filtre inactif');
    text('status-title', paused ? 'Une petite pause.' : state.active ? 'Place à l’essentiel.' : 'À votre rythme.');
    text('status-description', paused ? 'Les miniatures et les informations sont visibles. Prenez votre temps.' : state.active ? 'Les miniatures s’effacent. Vos vidéos restent accessibles.' : settings.mode === 'off' ? 'YouTube garde son apparence habituelle. Réactivez le filtre quand vous le souhaitez.' : 'YouTube garde son apparence habituelle jusqu’à votre prochain créneau.');
    text('status-time', paused ? `Pause jusqu’à ${timeFormat.format(new Date(settings.pauseUntil))}` : settings.mode === 'off' ? 'Réactivation manuelle ou via le planning' : nextLabel(state.nextChange, state.active));
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === settings.mode)));
    const blur = document.getElementById('blur-titles');
    if (blur) blur.checked = settings.blurTitles;
    const preview = document.getElementById('preview-details');
    if (preview) preview.classList.toggle('is-blurred', settings.blurTitles);
    const pauseButton = document.getElementById('pause-toggle');
    if (pauseButton) {
      pauseButton.disabled = !state.active && !paused;
      pauseButton.querySelector('span').textContent = paused ? 'Reprendre maintenant' : 'Faire une pause de 15 min';
      pauseButton.title = paused ? 'Annuler la pause et revenir au mode choisi' : state.active ? 'Afficher YouTube normalement pendant 15 minutes' : 'Disponible lorsque le filtre est actif';
    }
    text('mode-help', settings.mode === 'auto' ? 'Le filtre s’active uniquement pendant vos créneaux.' : settings.mode === 'on' ? 'Le filtre reste actif, même en dehors du planning. Vos créneaux sont conservés.' : 'Le filtre est désactivé. Vos créneaux sont conservés pour plus tard.');
    clearTimeout(timer);
    const next = Math.min(state.nextChange || Infinity, paused ? settings.pauseUntil : Infinity);
    timer = setTimeout(renderState, Math.max(100, Math.min(30000, next - Date.now() + 50)));
  }
  async function init() {
    try {
      const stored = await chrome.storage.local.get(engine.SETTINGS_KEY);
      settings = engine.normalizeSettings(stored[engine.SETTINGS_KEY]);
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[engine.SETTINGS_KEY]) {
          settings = engine.normalizeSettings(changes[engine.SETTINGS_KEY].newValue);
          notify();
        }
      });
      document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => update(draft => { draft.mode = button.dataset.mode; draft.pauseUntil = 0; })));
      // Keep the V1 storage key for existing installs; it now controls the full details block.
      document.getElementById('blur-titles')?.addEventListener('change', event => {
        const checked = event.target.checked;
        update(draft => { draft.blurTitles = checked; });
      });
      document.getElementById('pause-toggle')?.addEventListener('click', () => update(draft => {
        draft.pauseUntil = engine.evaluateState(draft).reason === 'paused' ? 0 : Date.now() + 15 * 60 * 1000;
      }));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) renderState(); });
      window.addEventListener('focus', renderState);
      notify();
      document.documentElement.dataset.ready = 'true';
      return settings;
    } catch (error) {
      console.error('WORK TIME : lecture impossible', error);
      saveMessage('Impossible de lire vos réglages. Rouvrez l’extension.', true);
      document.querySelectorAll('button,input').forEach(el => { el.disabled = true; });
      const label = document.getElementById('status-label-text');
      if (label) label.textContent = 'Réglages indisponibles';
      return null;
    }
  }
  globalThis.WorkTimeUI = {init, update, renderState, saveMessage, get settings() { return engine.normalizeSettings(settings); }, subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }};
})();
