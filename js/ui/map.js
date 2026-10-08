// SVG world map: choropleth, hover tooltip, click-to-zoom. Hover styling is CSS only; the pointer handler is rAF-throttled.
import { geoArea, geoEqualEarth, geoPath, interpolateArray, scaleQuantize, select, zoom, zoomIdentity, zoomTransform, feature } from '../../vendor/d3-lite.js';
import { MAP_COLOR_STEPS, MAP_HIDDEN_IDS, ZOOM_FILL, ZOOM_MAX_SCALE, ZOOM_MIN_PART_AREA_RATIO } from '../config.js';
import { filteredPopulation } from '../model/calc.js';
import { readMotion, readPx } from './motion.js';
import { createCounter } from './counter.js';

const PAD_X = 24;

/**
 * @param {object} o
 * @param {SVGSVGElement} o.svg
 * @param {object} o.topology  world-atlas topology
 * @param {object} o.index     country index (byNum)
 * @param {object} o.model     calc.js model
 * @param {object} o.store
 * @param {() => object} o.getI18n
 * @param {object} o.tooltip
 */
export function createMap({ svg: svgEl, topology, index, model, store, getI18n, tooltip }) {
  const svg = select(svgEl);
  const features = feature(topology, topology.objects.countries).features
    .filter((f) => !MAP_HIDDEN_IDS.includes(String(f.id ?? '').padStart(3, '0')));

  // Per feature: ISO country (if any) and data-1 value.
  const entries = features.map((f) => {
    const num = f.id == null ? null : String(f.id).padStart(3, '0');
    const country = num ? index.byNum.get(num) ?? null : null;
    const a3 = country?.a3 ?? null;
    const weeklyMin = a3 ? model.weeklyByA3.get(a3) : undefined;
    return { f, num, a3, a2: country?.a2 ?? null, weeklyMin, hasData: weeklyMin != null, name: f.properties?.name ?? '' };
  });
  // Startup diagnostics: anything that cannot be linked is listed once in the console.
  const onMap = new Set(entries.map((e) => e.a3));
  const noGeometry = [...model.weeklyByA3.keys()].filter((a3) => !onMap.has(a3));
  if (noGeometry.length) console.warn('[country-map] data-1 countries without geometry in the topology (not drawn):', noGeometry.map((a3) => index.byA3.get(a3)?.name ?? a3));
  const noId = entries.filter((e) => !e.a3).map((e) => e.name);
  if (noId.length) console.info('[country-map] topology features without ISO match (shown as "no data"):', noId);

  const values = entries.filter((e) => e.hasData).map((e) => e.weeklyMin);
  const extent = [Math.min(...values), Math.max(...values)];
  const colorStep = scaleQuantize().domain(extent).range(Array.from({ length: MAP_COLOR_STEPS }, (_, i) => i));

  // DOM
  const gRoot = svg.append('g').attr('class', 'world');
  const sphere = gRoot.append('path').attr('class', 'sphere');
  const paths = gRoot.selectAll('path.country').data(entries).join('path')
    .attr('class', (e) => `country ${e.hasData ? `has-data rb${colorStep(e.weeklyMin)}` : 'nodata'}`)
    .attr('data-a3', (e) => e.a3);
  // Highlight layer: a level-fill clipped to the chosen country, driven by chart hovers in the popups.
    const hlLayer = gRoot.append('g').attr('class', 'hl-layer');
  const clipPath = hlLayer.append('clipPath').attr('id', 'hl-clip');
  const clipShape = clipPath.append('path');
  const hlFill = hlLayer.append('g').attr('clip-path', 'url(#hl-clip)').append('rect').attr('class', 'hl-fill');
  const readout = document.getElementById('land-readout');
  const readoutNum = readout.querySelector('.readout-num');
  const readoutContext = readout.querySelector('.readout-context');
  const readoutLabel = readout.querySelector('.readout-label');
  const readoutCounter = createCounter(readoutNum, (n) => getI18n().percent(n / 100));
  const nodeByA3 = new Map();
  paths.each(function (e) { if (e.a3) nodeByA3.set(e.a3, this); });

  let width = 0, height = 0, projection = null, pathGen = null;

  // ---- zoom (programmatic only: wheel/drag are disabled) ----
  const zoomBehavior = zoom().scaleExtent([1, 400]).filter(() => false)
    .interpolate(interpolateArray) // straight "crash" path instead of d3's curved fly-over
    .on('zoom', (e) => gRoot.attr('transform', e.transform));
  svg.call(zoomBehavior);

  function layout() {
    width = svgEl.clientWidth; height = svgEl.clientHeight;
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    projection = geoEqualEarth().fitExtent([[PAD_X, readPx('--map-pad-top')], [width - PAD_X, height - readPx('--map-pad-bottom')]], { type: 'Sphere' });
    pathGen = geoPath(projection);
    sphere.attr('d', pathGen({ type: 'Sphere' }));
    paths.attr('d', (e) => pathGen(e.f));
  }

  /** Bounds (screen px at identity zoom) of the main landmass: overseas parts below ZOOM_MIN_PART_AREA_RATIO are ignored. */
  function mainBounds(f) {
    const g = f.geometry;
    if (g.type !== 'MultiPolygon') return pathGen.bounds(f);
    const parts = g.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
    const areas = parts.map((p) => geoArea(p));
    const max = Math.max(...areas);
    const kept = parts.filter((_, i) => areas[i] >= max * ZOOM_MIN_PART_AREA_RATIO);
    const bs = kept.map((p) => pathGen.bounds(p));
    return [[Math.min(...bs.map((b) => b[0][0])), Math.min(...bs.map((b) => b[0][1]))], [Math.max(...bs.map((b) => b[1][0])), Math.max(...bs.map((b) => b[1][1]))]];
  }

  /** Transform that centres the country in the neutral middle third of the screen. */
  function targetTransform(a3) {
    const entry = entries.find((e) => e.a3 === a3);
    const [[x0, y0], [x1, y1]] = mainBounds(entry.f);
    const third = width / 3, inset = (third * (1 - ZOOM_FILL)) / 2;
    const rx0 = third + inset, rx1 = 2 * third - inset;
    const ry0 = readPx('--zoom-pad-top'), ry1 = height - readPx('--zoom-pad-bottom');
    const k = Math.min(ZOOM_MAX_SCALE, (rx1 - rx0) / Math.max(1, x1 - x0), (ry1 - ry0) / Math.max(1, y1 - y0));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return zoomIdentity.translate((rx0 + rx1) / 2 - k * cx, (ry0 + ry1) / 2 - k * cy).scale(k);
  }

  function goTo(transform, animate) {
    const { duration, ease } = readMotion('zoom');
    if (!animate || duration <= 20) svg.call(zoomBehavior.transform, transform);
    else svg.interrupt().transition().duration(duration).ease(ease).call(zoomBehavior.transform, transform);
  }

  let hlBounds = null; // main landmass of the chosen country, projected px
  let hlOn = false;
  function prepareHighlight(a3) {
    const entry = entries.find((e) => e.a3 === a3);
    hlBounds = mainBounds(entry.f);
    const [[x0, y0], [x1, y1]] = hlBounds;
    clipShape.attr('d', pathGen(entry.f));
    hlFill.attr('x', x0).attr('y', y0).attr('width', x1 - x0).attr('height', y1 - y0);
  }
  function setHighlight(hl) {
    const a3 = store.get().country;
    if (!hl || !a3) {
      if (hlOn) { hlOn = false; hlFill.style('--level', 0); readout.classList.remove('is-visible'); }
      return;
    }
    if (!hlOn) { // fresh start: count from 0 and let the fill rise
      prepareHighlight(a3);
      hlFill.style('--level', 0);
      readoutCounter.set(0);
      const [[x0, y0], [x1, y1]] = hlBounds, t = zoomTransform(svgEl);
      readout.style.transform = `translate(${t.applyX((x0 + x1) / 2)}px, ${t.applyY((y0 + y1) / 2)}px) translate(-50%, -50%)`;
    }
    hlOn = true;
    readoutContext.textContent = hl.context;
    readoutLabel.textContent = hl.label;
    readout.classList.add('is-visible');
    requestAnimationFrame(() => hlFill.style('--level', hl.share));
    readoutCounter.to(hl.share * 100);
  }

  let shown = null; // country currently zoomed on
  function sync(animate = true) {
    const a3 = store.get().country;
    svg.classed('has-selection', !!a3);
    paths.classed('is-selected', (e) => !!a3 && e.a3 === a3);
    if (a3) {
      const node = nodeByA3.get(a3);
      if (node && node.parentNode.lastChild !== node) node.parentNode.appendChild(node); // draw the chosen country on top
      hlLayer.node().parentNode.appendChild(hlLayer.node()); // ...and the level fill above it
      goTo(targetTransform(a3), animate && shown !== a3);
    } else {
      goTo(zoomIdentity, animate);
    }
    shown = a3;
  }

  // ---- pointer ----
  let lastEvent = null, raf = 0;
  const entryOf = (target) => target.closest?.('.country')?.__data__ ?? null;

  function flushPointer() {
    raf = 0;
    const e = lastEvent;
    if (!e) return;
    const entry = store.get().country ? null : entryOf(e.target);
    if (!entry) { tooltip.hide(); return; }
    const i18n = getI18n();
    const pop = store.get().population?.byA3[entry.a3];
    const lines = [];
    if (pop != null) {
      const value = entry.hasData ? filteredPopulation(model, entry.a3, pop, store.get().ageGroups) : pop; // filter only applies where data exists
      lines.push(`${i18n.t('tooltip.population')}: ${i18n.compact(value)}`);
    }
    if (!entry.hasData) lines.push(i18n.t('tooltip.noData'));
    tooltip.show(i18n.countryName(entry.a2, entry.name), lines, e.clientX, e.clientY);
  }
  svgEl.addEventListener('pointermove', (e) => { lastEvent = e; if (!raf) raf = requestAnimationFrame(flushPointer); });
  svgEl.addEventListener('pointerleave', () => { lastEvent = null; tooltip.hide(); });

  svgEl.addEventListener('click', (e) => {
    const entry = entryOf(e.target);
    const { country } = store.get();
    if (country) { if (!entry || entry.a3 !== country) store.set({ country: null }); return; } // click outside the chosen country: back
    if (entry?.hasData) { tooltip.hide(); store.set({ country: entry.a3, zone: 'middle' }); }
  });

  store.subscribe((s, prev) => {
    if (s.country !== prev.country) { setHighlight(null); sync(true); }
    if (s.highlight !== prev.highlight) setHighlight(s.highlight);
  });
  layout();
  sync(false);

  return {
    /** Re-fit to the viewport (zoomed state is re-centred without animation). */
    resize() { layout(); if (store.get().country) goTo(targetTransform(store.get().country), false); },
    /** Legend range in minutes per week. */
    extent,
    colorStep,
  };
}
