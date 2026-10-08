// Colour legend of the world state: weekly time on social media (data 1) + "no data" swatch.
export function createLegend(el, { extent }) {
  return {
    render(i18n) {
      const wrap = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
      const bar = wrap('div', 'legend-bar');
      for (let i = 0; i < 7; i++) bar.append(document.createElement('i'));
      const ends = wrap('div', 'legend-ends');
      ends.append(wrap('span', '', i18n.hoursMinutes(extent[0])), wrap('span', '', i18n.hoursMinutes(extent[1])));
      const nodata = wrap('div', 'legend-nodata');
      nodata.append(document.createElement('i'), wrap('span', '', i18n.t('tooltip.noData')));
      el.replaceChildren(wrap('div', '', i18n.t('legend.title')), bar, ends, nodata);
    },
  };
}
