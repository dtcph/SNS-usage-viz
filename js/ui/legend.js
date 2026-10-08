// Colour legend of the overview: weekly time on social media (data 1) + "no data" swatch.
// A marker on the bar follows the hovered country, so its value can be read against the scale.
export function createLegend(el, { extent }) {
  let marker = null, markerLabel = null, i18nNow = null;
  return {
    render(i18n, year = null, latestYear = null) {
      i18nNow = i18n;
      const wrap = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
      const bar = wrap('div', 'legend-bar');
      for (let i = 0; i < 7; i++) bar.append(document.createElement('i'));
      marker = wrap('div', 'legend-marker');
      markerLabel = wrap('span', 'legend-marker-label');
      marker.append(markerLabel);
      bar.append(marker);
      const ends = wrap('div', 'legend-ends');
      ends.append(wrap('span', '', i18n.hoursMinutes(extent[0])), wrap('span', '', i18n.hoursMinutes(extent[1])));
      const nodata = wrap('div', 'legend-nodata');
      nodata.append(document.createElement('i'), wrap('span', '', i18n.t('tooltip.noData')));
      const title = year != null && year !== latestYear ? i18n.t('legend.titleYear', { year }) : i18n.t('legend.title');
      el.replaceChildren(wrap('div', '', title), bar, ends, nodata);
    },
    /** @param {number|null} minutes weekly minutes of the hovered country (null hides the marker) */
    mark(minutes) {
      if (!marker) return;
      if (minutes == null) { marker.classList.remove('is-visible'); return; }
      const pct = Math.max(0, Math.min(1, (minutes - extent[0]) / (extent[1] - extent[0])));
      marker.style.left = `${pct * 100}%`;
      markerLabel.textContent = i18nNow.hoursMinutes(minutes);
      marker.classList.add('is-visible');
    },
  };
}
