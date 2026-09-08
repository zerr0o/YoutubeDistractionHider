(() => {
  'use strict';
  const ui = globalThis.WorkTimeUI;
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const order = [1, 2, 3, 4, 5, 6, 0];
  const table = document.getElementById('schedule-days');
  const snapshots = new Map();
  const icon = (path) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const plus = icon('<path d="M12 5v14M5 12h14"/>');
  const close = icon('<path d="m6 6 12 12M6 18 18 6"/>');
  const sun = icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>');
  function slotHTML(slot, index, day, removable) {
    return `<div class="time-slot" data-slot="${index}">
      <input class="time-start" type="time" value="${slot.start}" required aria-label="${days[day]} : début du créneau ${index + 1}" aria-describedby="day-error-${day}">
      <span class="time-separator" aria-hidden="true">–</span>
      <input class="time-end" type="time" value="${slot.end}" required aria-label="${days[day]} : fin du créneau ${index + 1}" aria-describedby="day-error-${day}">
      ${removable ? `<button class="remove-slot" type="button" aria-label="${days[day]} : supprimer le créneau ${index + 1}" title="Supprimer ce créneau">${close}</button>` : ''}
      ${slot.end < slot.start ? '<span class="overnight-label">+1 jour</span>' : ''}
    </div>`;
  }
  function drawDay(day) {
    let row = table.querySelector(`[data-day="${day.day}"]`);
    if (!row) { row = document.createElement('div'); row.className = 'day-row'; row.dataset.day = day.day; table.append(row); }
    const serialized = JSON.stringify(day);
    if (snapshots.get(day.day) === serialized) return;
    if (row.contains(document.activeElement) && document.activeElement.matches('input[type="time"]')) return;
    // Keep an invalid draft visible until corrected, even if another setting changes.
    if (row.querySelector('[aria-invalid="true"]')) return;
    row.dataset.enabled = String(day.enabled);
    row.innerHTML = `<label class="day-label"><span class="switch"><input class="day-enabled" type="checkbox" ${day.enabled ? 'checked' : ''} aria-label="Activer ${days[day.day].toLowerCase()}"><span class="switch-track"></span></span><strong>${days[day.day]}</strong></label>
      ${day.enabled ? `<div class="day-slots">${day.slots.map((slot, i) => slotHTML(slot, i, day.day, day.slots.length > 1)).join('')}</div>` : `<span class="day-rest">${sun}Sans filtre</span>`}
      <button class="add-slot" type="button" title="Ajouter un créneau" aria-label="${days[day.day]} : ajouter un créneau" ${!day.enabled || day.slots.length >= 3 ? 'disabled' : ''}>${plus}</button>
      <p class="day-error" id="day-error-${day.day}" role="alert"></p>`;
    snapshots.set(day.day, serialized);
  }
  function drawSchedule(settings) { for (const day of order) drawDay(settings.schedule.find(item => item.day === day)); }
  function saveSlots(row) {
    const inputs = [...row.querySelectorAll('.time-slot')];
    const slots = inputs.map(slot => ({start:slot.querySelector('.time-start').value, end:slot.querySelector('.time-end').value}));
    let invalid = false;
    inputs.forEach((slot, index) => {
      const value = slots[index];
      const bad = !value.start || !value.end || value.start === value.end;
      slot.querySelectorAll('input').forEach(input => input.setAttribute('aria-invalid', String(bad)));
      invalid ||= bad;
    });
    row.querySelector('.day-error').textContent = invalid ? 'Indiquez deux heures différentes. Ce créneau n’est pas encore enregistré.' : '';
    if (invalid) { ui.saveMessage('Un créneau est à corriger avant son enregistrement.', true); return; }
    ui.update(draft => { draft.schedule.find(day => day.day === Number(row.dataset.day)).slots = slots; });
  }
  table.addEventListener('change', event => {
    const row = event.target.closest('.day-row');
    if (!row) return;
    if (event.target.matches('.day-enabled')) {
      const enabled = event.target.checked;
      row.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
      ui.update(draft => {
        const day = draft.schedule.find(day => day.day === Number(row.dataset.day));
        day.enabled = enabled;
        if (enabled && !day.slots.length) day.slots = [{start:'09:00', end:'12:00'}, {start:'14:00', end:'18:00'}];
      });
    } else if (event.target.matches('input[type="time"]')) saveSlots(row);
  });
  table.addEventListener('focusout', () => requestAnimationFrame(() => drawSchedule(ui.settings)));
  table.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const row = button.closest('.day-row');
    if (!row) return;
    if (row.querySelector('[aria-invalid="true"]')) { ui.saveMessage('Corrigez les heures de ce jour avant de modifier ses créneaux.', true); return; }
    const slotIndex = Number(button.closest('.time-slot')?.dataset.slot);
    ui.update(draft => {
      const day = draft.schedule.find(day => day.day === Number(row.dataset.day));
      if (button.matches('.remove-slot') && day.slots.length > 1) day.slots.splice(slotIndex, 1);
      if (button.matches('.add-slot') && day.enabled && day.slots.length < 3) day.slots.push({start:'18:00',end:'19:00'});
    });
  });
  document.getElementById('copy-week').addEventListener('click', () => {
    if (table.querySelector('[aria-invalid="true"]')) { ui.saveMessage('Corrigez d’abord le créneau non enregistré.', true); return; }
    ui.update(draft => {
      const monday = draft.schedule.find(day => day.day === 1);
      for (const day of draft.schedule) if (day.day >= 2 && day.day <= 5) day.slots = monday.slots.map(slot => ({...slot}));
    });
  });
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    document.getElementById('timezone-label').textContent = `Heure locale · ${zone.split('/').pop().replaceAll('_', ' ')}`;
    document.getElementById('timezone-label').title = zone;
  } catch (_) { /* The browser still uses local time without a displayable zone. */ }
  ui.subscribe(drawSchedule);
  ui.init();
})();
