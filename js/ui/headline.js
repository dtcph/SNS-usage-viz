// Detail view, below the country: the name and a row of stat modules. Every module has the same shape,
// NUMBER (big, counts up) | label (small). Add or reorder modules in STATS; nothing else needs to change.
import { DOOMSCROLL_THRESHOLD_MIN_PER_DAY } from '../config.js';
import { createCounter } from './counter.js';

/**
 * id: element class suffix. value: number from describeCountry(). format: (i18n) => (n) => text.
 * label: i18n key, params: (i18n) => values for the label. accent: highlight colour for the number.
 */
const STATS = [
  { id: 'users', value: (vm) => vm.users, format: (i18n) => (n) => i18n.compact(n), label: 'headline.users' },
  { id: 'average', value: (vm) => vm.dailyMin, format: (i18n) => (n) => i18n.minutes(n), label: 'headline.average' },
  {
    id: 'affected', value: (vm) => vm.affected, format: (i18n) => (n) => i18n.compact(n), label: 'headline.affected',
    params: (i18n) => ({ duration: i18n.minutes(DOOMSCROLL_THRESHOLD_MIN_PER_DAY) }), accent: true,
  },
];

/** One module: <div class="stat"><span class="stat-num num"/><span class="stat-label"/></div> */
function createStat(def) {
  const el = document.createElement('div');
  el.className = `stat stat-${def.id}${def.accent ? ' is-accent' : ''}`;
  const num = document.createElement('span');
  num.className = 'stat-num num';
  const label = document.createElement('span');
  label.className = 'stat-label';
  el.append(num, label);
  return { def, el, num, label, counter: null };
}

export function createHeadline({ nameEl, statsEl }) {
  const stats = STATS.map(createStat);
  statsEl.replaceChildren(...stats.map((s) => s.el));
  let key = '', shownFor = null;

  function build(i18n) {
    for (const s of stats) {
      s.counter = createCounter(s.num, s.def.format(i18n));
      s.label.textContent = i18n.t(s.def.label, s.def.params?.(i18n));
    }
  }

  return {
    /** @param {object|null} vm  describeCountry() result; @param {string} id country key (animation restarts from 0 on a new country) */
    render({ i18n, vm, id, name }) {
      if (i18n.lang !== key || !stats[0].counter) { key = i18n.lang; build(i18n); shownFor = null; }
      nameEl.textContent = name ?? '';
      if (!vm) { for (const s of stats) s.counter.set(0); return; }
      const from = shownFor === id ? undefined : 0;
      for (const s of stats) s.counter.to(s.def.value(vm), { from });
      shownFor = id;
    },
    reset() { shownFor = null; },
  };
}
