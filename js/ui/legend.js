// Colour legend of the overview: average daily minutes on social media + "no data" swatch.
// Its ends follow the year shown on the timeline (min and max of that year) and count over smoothly; a marker on the bar
// follows the hovered country, so its value can be read against the scale.
import { createCounter } from './counter.js';

const LEGEND_COUNT_MS = 650;

/** @param {{extentFor:(year:number|null)=>number[]}} o  [min, max] of the shown year */
export function createLegend(el, { extentFor }) {
  let built = false, lang = null, extent = null, i18nNow = null;
  let titleEl, noDataEl, minEl, maxEl, marker, markerLabel, minCounter, maxCounter;

  const wrap = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function build() {
    titleEl = wrap('div');
    const bar = wrap('div', 'legend-bar');
    for (let i = 0; i < 7; i++) bar.append(document.createElement('i'));
    marker = wrap('div', 'legend-marker');
    markerLabel = wrap('span', 'legend-marker-label');
    marker.append(markerLabel);
    bar.append(marker);
    const ends = wrap('div', 'legend-ends');
    minEl = wrap('span'); maxEl = wrap('span');
    ends.append(minEl, maxEl);
    const nodata = wrap('div', 'legend-nodata');
    noDataEl = wrap('span');
    nodata.append(document.createElement('i'), noDataEl);
    el.replaceChildren(titleEl, bar, ends, nodata);
    built = true;
  }

  return {
    render(i18n, year = null, latestYear = null) {
      if (!built) build();
      i18nNow = i18n;
      const target = extentFor(year);
      const shown = year == null ? null : Math.round(year); // only whole years are named, the ends follow the slider smoothly
      titleEl.textContent = shown != null && shown !== latestYear ? i18n.t('legend.titleYear', { year: shown }) : i18n.t('legend.title');
      noDataEl.textContent = i18n.t('tooltip.noData');
      if (lang !== i18n.lang) { // new formatter: set directly, no count-over
        lang = i18n.lang;
        minCounter = createCounter(minEl, (n) => i18n.minutes(n));
        maxCounter = createCounter(maxEl, (n) => i18n.minutes(n));
        minCounter.set(target[0]); maxCounter.set(target[1]);
      } else {
        minCounter.to(target[0], { duration: LEGEND_COUNT_MS, ease: (t) => t }); // linear: the slider already eases
        maxCounter.to(target[1], { duration: LEGEND_COUNT_MS, ease: (t) => t });
      }
      extent = target;
    },
    /** @param {number|null} minutes daily minutes of the hovered country (null hides the marker) */
    mark(minutes) {
      if (!marker) return;
      if (minutes == null) { marker.classList.remove('is-visible'); return; }
      const pct = Math.max(0, Math.min(1, (minutes - extent[0]) / (extent[1] - extent[0])));
      marker.style.left = `${pct * 100}%`;
      markerLabel.textContent = i18nNow.minutes(minutes);
      marker.classList.add('is-visible');
    },
  };
}
