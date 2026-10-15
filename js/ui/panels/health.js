// Popup "Health issues" (left zone): column chart for adolescents 10-19 inside the current age selection.
import { createPushNumber } from '../push-number.js';
import { createChart } from './chart.js';

export const zone = 'left';

export function create(card, { store }) {
  card.innerHTML = `
    <h2 class="panel-title"></h2><p class="panel-note"></p>
    <div class="panel-content">
      <div class="panel-big"><span class="num"></span><span class="teens-label"></span></div>
      <div class="chart-host"></div>
    </div>
    <div class="panel-empty" hidden><strong></strong><span></span></div>`;
  const $ = (s) => card.querySelector(s);
  let teens = null, lang = null, items = [], i18nNow = null;

  const chart = createChart($('.chart-host'), {
    onHover(i) {
      const item = i == null ? null : items[i];
      store.set({ highlight: item ? { share: item.share, count: item.count, context: i18nNow.t('health.ofTeens', { pct: i18nNow.percent(item.share) }), label: item.label } : null });
    },
  });

  return {
    render({ i18n, vm, fromZero }) {
      i18nNow = i18n;
      if (lang !== i18n.lang) { lang = i18n.lang; teens = createPushNumber($('.panel-big .num'), (n) => i18n.compact(n)); chart.sync([], null); }
      $('.panel-title').textContent = i18n.t('health.title');
      $('.panel-note').textContent = i18n.t('health.basis');
      const h = vm?.health;
      $('.panel-content').hidden = !h;
      $('.panel-empty').hidden = !!h;
      if (!h) {
        $('.panel-empty strong').textContent = i18n.t('health.empty');
        $('.panel-empty span').textContent = i18n.t('health.emptyHint');
        return;
      }
      $('.teens-label').textContent = i18n.t('health.teens');
      const put = (counter, v) => (fromZero ? counter.set(v) : counter.to(v)); // a freshly opened panel shows its values at once
      put(teens, h.teens);
      items = h.issues.map((i) => ({ ...i, label: i18n.t(`health.issue.${i.id}`), short: i18n.t(`health.short.${i.id}`) }));
      const cols = chart.sync(items, (n) => i18n.compact(n));
      const max = Math.max(...items.map((i) => i.count));
      items.forEach((item, k) => { put(cols[k].counter, item.count); chart.setHeight(cols[k], item.count / max, { fromZero }); });
    },
  };
}
