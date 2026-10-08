// Popup "Reasons for scrolling" (right zone): survey percentages x affected people, as a column chart.
import { USAGE_REASONS_VISIBLE } from '../../config.js';
import { createChart } from './chart.js';

export const zone = 'right';

export function create(card, { store }) {
  card.innerHTML = '<h2 class="panel-title"></h2><p class="panel-note"></p><div class="chart-host"></div>';
  const $ = (s) => card.querySelector(s);
  let lang = null, items = [], i18nNow = null;

  const chart = createChart($('.chart-host'), {
    onHover(i) {
      const item = i == null ? null : items[i];
      store.set({ highlight: item ? { share: item.pct / 100, count: item.count, context: i18nNow.t('usage.ofAffected', { pct: i18nNow.percent(item.pct / 100) }), label: item.label } : null });
    },
  });

  return {
    render({ i18n, vm, fromZero }) {
      i18nNow = i18n;
      if (lang !== i18n.lang) { lang = i18n.lang; chart.sync([], null); }
      $('.panel-title').textContent = i18n.t('usage.title');
      $('.panel-note').textContent = i18n.t('usage.note');
      if (!vm) return;
      items = vm.reasons.slice(0, USAGE_REASONS_VISIBLE).map((r) => ({ ...r, label: i18n.t(`usage.reason.${r.id}`), short: i18n.t(`usage.short.${r.id}`) }));
      const cols = chart.sync(items, (n) => i18n.compact(n));
      const max = Math.max(...items.map((r) => r.count));
      items.forEach((item, k) => { cols[k].counter.to(item.count, { from: fromZero ? 0 : undefined }); chart.setHeight(cols[k], item.count / max, { fromZero }); });
    },
  };
}
