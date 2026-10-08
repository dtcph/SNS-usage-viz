// "About the numbers" card: states the assumptions behind the model, using the live config values.
import { DOOMSCROLL_THRESHOLD_MIN_PER_DAY, REFERENCE_YEAR, SOCIAL_MEDIA_USER_SHARE } from '../config.js';

export function createInfo({ store, getI18n }) {
  const btn = document.getElementById('info-btn');
  const panel = document.getElementById('info-panel');
  const list = document.getElementById('info-list');

  function render() {
    const i18n = getI18n();
    list.replaceChildren(...i18n.list('info.items').map((tpl) => {
      const li = document.createElement('li');
      li.textContent = tpl.replace(/\{(\w+)\}/g, (_, k) => ({
        threshold: i18n.hoursMinutes(DOOMSCROLL_THRESHOLD_MIN_PER_DAY),
        share: i18n.percent(SOCIAL_MEDIA_USER_SHARE),
        year: String(REFERENCE_YEAR),
      }[k] ?? `{${k}}`));
      return li;
    }));
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); store.set({ infoOpen: !store.get().infoOpen }); });
  document.addEventListener('click', (e) => { // click outside closes
    if (store.get().infoOpen && !e.target.closest('#info-panel')) store.set({ infoOpen: false });
  });
  store.subscribe((s, prev) => {
    if (s.infoOpen !== prev.infoOpen) { panel.hidden = !s.infoOpen; btn.setAttribute('aria-expanded', String(s.infoOpen)); }
    if (s.lang !== prev.lang) render();
  });
  render();
}
