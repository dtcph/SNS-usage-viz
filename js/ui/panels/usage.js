// Popup "Reasons for scrolling" (right zone): survey percentages x affected people.
import { USAGE_REASONS_VISIBLE } from '../../config.js';
import { createRows } from './rows.js';

export const zone = 'right';

export function create(card) {
  card.innerHTML = '<h2 class="panel-title"></h2><p class="panel-note"></p><ul class="rows"></ul>';
  const rowsView = createRows(card.querySelector('.rows'));
  let lang = null;

  return {
    render({ i18n, vm, fromZero }) {
      if (lang !== i18n.lang) { lang = i18n.lang; rowsView.invalidate(); }
      card.querySelector('.panel-title').textContent = i18n.t('usage.title');
      card.querySelector('.panel-note').textContent = i18n.t('usage.note');
      if (!vm) return;
      const top = vm.reasons.slice(0, USAGE_REASONS_VISIBLE);
      const rows = rowsView.sync(top.map((r) => ({ id: r.id, label: i18n.t(`usage.reason.${r.id}`) })), (n) => i18n.compact(n));
      const max = Math.max(...top.map((r) => r.pct));
      top.forEach((r, k) => {
        rows[k].counter.to(r.count, { from: fromZero ? 0 : undefined });
        rows[k].sub.textContent = i18n.percent(r.pct / 100);
        rows[k].fill.style.setProperty('--w', fromZero ? 0 : r.pct / max);
        requestAnimationFrame(() => requestAnimationFrame(() => rows[k].fill.style.setProperty('--w', r.pct / max)));
      });
    },
  };
}
