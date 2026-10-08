// Detail view, below the country: name, weekly/daily time as clear figures, one calm sentence with the animated number.
import { DOOMSCROLL_THRESHOLD_MIN_PER_DAY } from '../config.js';
import { createCounter } from './counter.js';

export function createHeadline({ nameEl, lineEl, weekEl, dayEl, weekLabelEl, dayLabelEl }) {
  let counter = null, weekCounter = null, dayCounter = null, key = '', shownFor = null;

  function build(i18n) {
    const marker = '\u0001';
    const [before, after] = i18n.t('headline.line', { count: marker, duration: i18n.hoursMinutes(DOOMSCROLL_THRESHOLD_MIN_PER_DAY) }).split(marker);
    const num = document.createElement('span');
    num.className = 'num';
    lineEl.replaceChildren(before, num, after ?? '');
    counter = createCounter(num, (n) => i18n.compact(n));
    weekCounter = createCounter(weekEl, (n) => i18n.hoursMinutes(n));
    dayCounter = createCounter(dayEl, (n) => i18n.hoursMinutes(n));
    weekLabelEl.textContent = i18n.t('headline.perWeek');
    dayLabelEl.textContent = i18n.t('headline.perDay');
  }

  return {
    /** @param {object|null} vm  describeCountry() result; @param {string} id country key (animation restarts from 0 on a new country) */
    render({ i18n, vm, id, name }) {
      if (i18n.lang !== key || !counter) { key = i18n.lang; build(i18n); shownFor = null; }
      nameEl.textContent = name ?? '';
      if (!vm) { counter.set(0); weekCounter.set(0); dayCounter.set(0); return; }
      const from = shownFor === id ? undefined : 0;
      counter.to(vm.affected, { from });
      weekCounter.to(vm.weeklyMin, { from });
      dayCounter.to(vm.dailyMin, { from });
      shownFor = id;
    },
    reset() { shownFor = null; },
  };
}
