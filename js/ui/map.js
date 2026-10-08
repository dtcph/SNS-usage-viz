// 3D globe (orthographic projection, SVG): heatmap choropleth, hover tooltip, drag to rotate, wheel to zoom, click-to-fly.
// Hover styling is CSS only; pointer handling is rAF-throttled; the globe is redrawn at most once per frame.
import { feature, geoArea, geoCentroid, geoGraticule10, geoOrthographic, geoPath, interpolateArray, scaleQuantize, select } from '../../vendor/d3-lite.js';
import {
  GLOBE_INITIAL_CENTER, GLOBE_ZOOM_MAX, GLOBE_ZOOM_MIN, MAP_COLOR_STEPS, MAP_HIDDEN_IDS, ZOOM_FILL, ZOOM_MAX_SCALE, ZOOM_MIN_PART_AREA_RATIO,
} from '../config.js';
import { describeCountry, yearFactor } from '../model/calc.js';
import { createCounter } from './counter.js';
import { readMotion, readPx } from './motion.js';

const PAD_X = 24;
const DRAG_THRESHOLD_PX = 4;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * @param {object} o
 * @param {SVGSVGElement} o.svg
 * @param {object} o.topology  world-atlas topology
 * @param {object} o.index     country index (byNum)
 * @param {object} o.model     calc.js model
 * @param {object} o.store
 * @param {() => object} o.getI18n
 * @param {object} o.tooltip
 * @param {(minutes:number|null)=>void} [o.onHoverTime]  weekly minutes of the hovered country (for the legend marker)
 */
export function createMap({ svg: svgEl, topology, index, model, store, getI18n, tooltip, onHoverTime = () => {} }) {
  const svg = select(svgEl);
  const features = feature(topology, topology.objects.countries).features
    .filter((f) => !MAP_HIDDEN_IDS.includes(String(f.id ?? '').padStart(3, '0')));

  // Per feature: ISO country (if any) and data-1 value.
  const entries = features.map((f) => {
    const num = f.id == null ? null : String(f.id).padStart(3, '0');
    const country = num ? index.byNum.get(num) ?? null : null;
    const a3 = country?.a3 ?? null;
    const weeklyMin = a3 ? model.weeklyByA3.get(a3) : undefined;
    return { f, num, a3, a2: country?.a2 ?? null, weeklyMin, hasData: weeklyMin != null, name: f.properties?.name ?? '', step: null };
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

  // ---- DOM ----
  const defs = svg.append('defs');
  const grad = defs.append('radialGradient').attr('id', 'globe-grad').attr('cx', 0.38).attr('cy', 0.3).attr('r', 0.9);
  grad.append('stop').attr('offset', 0).attr('class', 'globe-hi');
  grad.append('stop').attr('offset', 1).attr('class', 'globe-lo');

  const gRoot = svg.append('g').attr('class', 'world');
  const sphere = gRoot.append('path').attr('class', 'sphere');
  const graticule = gRoot.append('path').attr('class', 'graticule');
  const paths = gRoot.selectAll('path.country').data(entries).join('path')
    .attr('class', (e) => `country ${e.hasData ? 'has-data' : 'nodata'}`)
    .attr('data-a3', (e) => e.a3);

  /** Heatmap class per country for the year on the timeline (fixed colour scale, so change over time is visible). */
  function colorize() {
    const factor = yearFactor(model, store.get().year);
    paths.each(function (e) {
      if (!e.hasData) return;
      const step = colorStep(e.weeklyMin * factor);
      if (step === e.step) return;
      if (e.step != null) this.classList.remove(`rb${e.step}`);
      this.classList.add(`rb${step}`);
      e.step = step;
    });
  }
  const nodeByA3 = new Map();
  paths.each(function (e) { if (e.a3) nodeByA3.set(e.a3, this); });

  // Highlight layer: a level-fill clipped to the chosen country, driven by chart hovers in the popups.
  const hlLayer = gRoot.append('g').attr('class', 'hl-layer');
  const clipShape = hlLayer.append('clipPath').attr('id', 'hl-clip').append('path');
  const hlFill = hlLayer.append('g').attr('clip-path', 'url(#hl-clip)').append('rect').attr('class', 'hl-fill');
  const readout = document.getElementById('land-readout');
  const readoutNum = readout.querySelector('.readout-num');
  const readoutContext = readout.querySelector('.readout-context');
  const readoutLabel = readout.querySelector('.readout-label');
  const readoutCounter = createCounter(readoutNum, (n) => getI18n().percent(n / 100));

  // ---- globe state ----
  const projection = geoOrthographic().clipAngle(90);
  const pathGen = geoPath(projection);
  const graticuleLines = geoGraticule10();
  let width = 0, height = 0, cx = 0, cy = 0, radius = 1;
  let userZoom = 1;
  /** view = what is drawn: rotation (deg), scale (px) and screen position of the globe centre. */
  let view = { lam: -GLOBE_INITIAL_CENTER[0], phi: -GLOBE_INITIAL_CENTER[1], scale: 1, tx: 0, ty: 0 };

  function drawNow() {
    projection.rotate([view.lam, view.phi]).scale(view.scale).translate([view.tx, view.ty]);
    sphere.attr('d', pathGen({ type: 'Sphere' }));
    graticule.attr('d', pathGen(graticuleLines));
    paths.attr('d', (e) => pathGen(e.f));
  }
  let drawRaf = 0;
  const requestDraw = () => { if (!drawRaf) drawRaf = requestAnimationFrame(() => { drawRaf = 0; drawNow(); }); };

  function layout() {
    width = svgEl.clientWidth; height = svgEl.clientHeight;
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    const top = readPx('--map-pad-top'), bottom = readPx('--map-pad-bottom');
    cx = width / 2;
    cy = top + (height - top - bottom) / 2;
    radius = Math.max(50, Math.min((height - top - bottom) / 2, (width - 2 * PAD_X) / 2));
  }

  const worldView = () => ({ lam: view.lam, phi: view.phi, scale: radius * userZoom, tx: cx, ty: cy });

  /** The part of a country that counts for zooming: overseas pieces below ZOOM_MIN_PART_AREA_RATIO are ignored. */
  function mainGeometry(f) {
    const g = f.geometry;
    if (g.type !== 'MultiPolygon') return g;
    const areas = g.coordinates.map((coordinates) => geoArea({ type: 'Polygon', coordinates }));
    const max = Math.max(...areas);
    return { type: 'MultiPolygon', coordinates: g.coordinates.filter((_, i) => areas[i] >= max * ZOOM_MIN_PART_AREA_RATIO) };
  }

  /** View that turns the country towards the viewer and fits it into the neutral middle third. */
  function countryView(a3) {
    const geometry = mainGeometry(entries.find((e) => e.a3 === a3).f);
    const [lon, lat] = geoCentroid(geometry);
    const probe = geoOrthographic().rotate([-lon, -lat]).scale(radius).translate([0, 0]); // centroid sits at the origin
    const [[x0, y0], [x1, y1]] = geoPath(probe).bounds(geometry);
    const third = width / 3, inset = (third * (1 - ZOOM_FILL)) / 2;
    const rx0 = third + inset, rx1 = 2 * third - inset;
    const ry0 = readPx('--zoom-pad-top'), ry1 = height - readPx('--zoom-pad-bottom');
    const k = Math.min(ZOOM_MAX_SCALE, (rx1 - rx0) / Math.max(1, x1 - x0), (ry1 - ry0) / Math.max(1, y1 - y0));
    return {
      lam: -lon, phi: -lat, scale: radius * k,
      tx: (rx0 + rx1) / 2 - k * (x0 + x1) / 2, ty: (ry0 + ry1) / 2 - k * (y0 + y1) / 2,
    };
  }

  // ---- flight between views (same duration/easing variables as the CSS) ----
  let flightRaf = 0;
  function flyTo(target, animate) {
    cancelAnimationFrame(flightRaf);
    const { duration, ease } = readMotion('zoom');
    if (!animate || duration <= 20) { view = target; drawNow(); return; }
    const from = view;
    let lam = target.lam; // take the short way round
    while (lam - from.lam > 180) lam -= 360;
    while (lam - from.lam < -180) lam += 360;
    const lerp = interpolateArray([from.lam, from.phi, Math.log(from.scale), from.tx, from.ty], [lam, target.phi, Math.log(target.scale), target.tx, target.ty]);
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration), v = lerp(ease(p));
      view = { lam: v[0], phi: v[1], scale: Math.exp(v[2]), tx: v[3], ty: v[4] };
      drawNow();
      if (p < 1) flightRaf = requestAnimationFrame(step); else view = target;
    };
    flightRaf = requestAnimationFrame(step);
  }

  // ---- highlight (level fill inside the country) ----
  let hlOn = false;
  function setHighlight(hl) {
    const a3 = store.get().country;
    if (!hl || !a3) {
      if (hlOn) { hlOn = false; hlFill.style('--level', 0); readout.classList.remove('is-visible'); }
      return;
    }
    if (!hlOn) { // fresh start: count from 0 and let the fill rise
      const entry = entries.find((e) => e.a3 === a3);
      const [[x0, y0], [x1, y1]] = pathGen.bounds(mainGeometry(entry.f));
      clipShape.attr('d', pathGen(entry.f));
      hlFill.attr('x', x0).attr('y', y0).attr('width', x1 - x0).attr('height', y1 - y0).style('--level', 0);
      readoutCounter.set(0);
      readout.style.transform = `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2}px) translate(-50%, -50%)`;
    }
    hlOn = true;
    readoutContext.textContent = hl.context;
    readoutLabel.textContent = hl.label;
    readout.classList.add('is-visible');
    requestAnimationFrame(() => hlFill.style('--level', hl.share));
    readoutCounter.to(hl.share * 100);
  }

  let shown = null; // country currently flown to
  function sync(animate = true) {
    const a3 = store.get().country;
    svg.classed('has-selection', !!a3);
    paths.classed('is-selected', (e) => !!a3 && e.a3 === a3);
    if (a3) {
      const node = nodeByA3.get(a3);
      if (node && node.parentNode.lastChild !== node) node.parentNode.appendChild(node); // draw the chosen country on top
      hlLayer.node().parentNode.appendChild(hlLayer.node()); // ...and the level fill above it
      flyTo(countryView(a3), animate && shown !== a3);
    } else {
      flyTo(worldView(), animate);
    }
    shown = a3;
  }

  // ---- pointer: drag rotates, wheel zooms (world state only) ----
  const entryOf = (target) => target.closest?.('.country')?.__data__ ?? null;
  let drag = null, suppressClick = false, lastEvent = null, raf = 0;

  function flushPointer() {
    raf = 0;
    const e = lastEvent;
    if (!e) return;
    const entry = store.get().country || drag?.moved ? null : entryOf(e.target);
    if (!entry) { tooltip.hide(); onHoverTime(null); return; }
    const i18n = getI18n();
    const { population, ageGroups, year } = store.get();
    const pop = population?.byA3[entry.a3];
    const lines = [];
    const vm = entry.hasData && pop != null ? describeCountry(model, entry.a3, pop, ageGroups, year) : null;
    if (pop != null) lines.push(`${i18n.t('tooltip.population')}: ${i18n.compact(vm ? vm.population : pop)}`); // age filter only applies where data exists
    if (entry.hasData) {
      const weekly = entry.weeklyMin * yearFactor(model, year);
      const est = year != null && year !== model.latestYear ? ` · ${i18n.t('tooltip.estimate', { year })}` : '';
      lines.push(`${i18n.t('tooltip.weekly')}: ${i18n.hoursMinutes(weekly)}${est}`);
      if (vm) lines.push(`${i18n.t('tooltip.affected')}: ${i18n.compact(vm.affected)}`);
      onHoverTime(weekly);
    } else {
      lines.push(i18n.t('tooltip.noData'));
      onHoverTime(null);
    }
    tooltip.show(i18n.countryName(entry.a2, entry.name), lines, e.clientX, e.clientY);
  }

  svgEl.addEventListener('pointerdown', (e) => {
    if (store.get().country || e.button !== 0) return;
    cancelAnimationFrame(flightRaf);
    drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  });
  svgEl.addEventListener('pointermove', (e) => {
    lastEvent = e;
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      if (!drag.moved) { drag.moved = true; svgEl.setPointerCapture(e.pointerId); svg.classed('is-dragging', true); tooltip.hide(); onHoverTime(null); }
      const k = RAD_TO_DEG / view.scale; // 1 px at the globe centre = the angle it covers, so the surface follows the cursor
      view = { ...view, lam: view.lam + dx * k, phi: Math.max(-90, Math.min(90, view.phi - dy * k)) };
      drag.x = e.clientX; drag.y = e.clientY;
      requestDraw();
      return;
    }
    if (!raf) raf = requestAnimationFrame(flushPointer);
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    suppressClick = drag.moved;
    if (drag.moved && svgEl.hasPointerCapture(e.pointerId)) svgEl.releasePointerCapture(e.pointerId);
    drag = null;
    svg.classed('is-dragging', false);
  };
  svgEl.addEventListener('pointerup', endDrag);
  svgEl.addEventListener('pointercancel', endDrag);
  svgEl.addEventListener('pointerleave', () => { lastEvent = null; tooltip.hide(); onHoverTime(null); });

  svgEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (store.get().country) return;
    tooltip.hide();
    userZoom = Math.max(GLOBE_ZOOM_MIN, Math.min(GLOBE_ZOOM_MAX, userZoom * Math.exp(-e.deltaY * 0.0015)));
    cancelAnimationFrame(flightRaf);
    view = { ...view, scale: radius * userZoom };
    requestDraw();
  }, { passive: false });

  svgEl.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; return; } // the click that ends a drag
    const entry = entryOf(e.target);
    const { country } = store.get();
    if (country) { onHoverTime(null); if (!entry || entry.a3 !== country) store.set({ country: null }); return; } // click outside the chosen country: back
    if (entry?.hasData) { tooltip.hide(); onHoverTime(null); store.set({ country: entry.a3, zone: 'middle', year: null }); }
  });

  store.subscribe((s, prev) => {
    if (s.country !== prev.country) { setHighlight(null); sync(true); }
    if (s.highlight !== prev.highlight) setHighlight(s.highlight);
    if (s.year !== prev.year) colorize();
  });

  colorize();
  layout();
  view = worldView();
  drawNow();
  sync(false);

  return {
    /** Re-fit to the viewport (the current view is re-centred without animation). */
    resize() {
      layout();
      const a3 = store.get().country;
      flyTo(a3 ? countryView(a3) : worldView(), false);
    },
    /** Legend range in minutes per week. */
    extent,
    colorStep,
  };
}
