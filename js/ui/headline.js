// Zoomed state, below the country: name, one calm sentence with the animated number, averages.
import { DOOMSCROLL_THRESHOLD_MIN_PER_DAY } from '../config.js';
import { createCounter } from './counter.js';

export function createHeadline({ nameEl, lineEl, avgEl }) {
  let counter = null, key = '', shownFor = null;

  function build(i18n) {
    const marker = '\u0001';
    const [before, after] = i18n.t('headline.line', { count: marker, duration: i18n.hoursMinutes(DOOMSCROLL_THRESHOLD_MIN_PER_DAY) }).split(marker);
    const num = document.createElement('span');
    num.className = 'num';
    lineEl.replaceChildren(before, num, after ?? '');
    counter = createCounter(num, (n) => i18n.compact(n));
  }

  return {
    /** @param {object|null} vm  describeCountry() result; @param {string} id country key (animation restarts from 0 on a new country) */
    render({ i18n, vm, id, name }) {
      const newKey = i18n.lang;
      if (newKey !== key || !counter) { key = newKey; build(i18n); shownFor = null; }
      nameEl.textContent = name ?? '';
      if (!vm) { avgEl.textContent = ''; counter.set(0); return; }
      avgEl.textContent = i18n.t('headline.avg', { daily: i18n.hoursMinutes(vm.dailyMin), weekly: i18n.hoursMinutes(vm.weeklyMin) });
      counter.to(vm.affected, { from: shownFor === id ? undefined : 0 });
      shownFor = id;
    },
    reset() { shownFor = null; },
  };
}
