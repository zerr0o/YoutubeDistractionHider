'use strict';
for (const id of ['open-options', 'planning-link']) {
  document.getElementById(id).addEventListener('click', () => chrome.runtime.openOptionsPage());
}
WorkTimeUI.init();
