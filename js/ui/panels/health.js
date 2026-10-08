// Popup "Health issues" (left zone). Numbers are for adolescents 10-19 inside the current age selection.
import { createCounter } from '../counter.js';
import { createRows } from './rows.js';

export const zone = 'left';

export function create(card) {
  card.innerHTML = `
    <h2 class="panel-title"></h2><p class="panel-note"></p>
    <div class="panel-content">
      <div class="panel-big"><span class="num"></span><span class="teens-label"></span></div>
      <ul class="rows"></ul>
    </div>
    <div class="panel-empty" hidden><strong></strong><span></span></div>`;
  const $ = (s) => card.querySelector(s);
  const rowsView = createRows($('.rows'));
  let teens = null, lang = null;

  return {
    render({ i18n, vm, fromZero }) {
      if (lang !== i18n.lang) { lang = i18n.lang; teens = createCounter($('.panel-big .num'), (n) => i18n.compact(n)); rowsView.invalidate(); }
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
      const from = fromZero ? 0 : undefined;
      teens.to(h.teens, { from });
      const rows = rowsView.sync(h.issues.map((i) => ({ id: i.id, label: i18n.t(`health.issue.${i.id}`) })), (n) => i18n.compact(n));
      const maxShare = Math.max(...h.issues.map((i) => i.share));
      h.issues.forEach((issue, k) => {
        const row = rows[k];
        row.counter.to(issue.count, { from });
        row.sub.textContent = i18n.t('health.shareOfTeens', { pct: i18n.percent(issue.share) });
        row.fill.style.setProperty('--w', fromZero ? 0 : issue.share / maxShare);
        requestAnimationFrame(() => requestAnimationFrame(() => row.fill.style.setProperty('--w', issue.share / maxShare)));
      });
    },
  };
}
