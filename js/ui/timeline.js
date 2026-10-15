// Overview only: average daily minutes per year (mean over the countries that report that year) as a playable timeline.
// Playing (or dragging along the line) moves through time in quarters: between two reported years each country's value is
// interpolated linearly (only when both neighbouring years are reported). Only the whole year is named; the globe, legend and
// dot follow the slider smoothly.
import { curveMonotoneX, line, scaleLinear } from '../../vendor/d3-lite.js';
import { TIMELINE_STEP_MS, TIMELINE_STEPS_PER_YEAR } from '../config.js';
import { createCounter } from './counter.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 300, H = 92, M = { top: 12, right: 10, bottom: 22, left: 10 };
const ICON = {
  play: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z"/></svg>',
  pause: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2h2v8H3zM7 2h2v8H7z"/></svg>',
};

const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/**
 * @param {object} o
 * @param {HTMLElement} o.el
 * @param {{year:number, minutes:number, countries:number}[]} o.series  model.yearSeries
 * @param {object} o.store
 * @param {() => object} o.getI18n
 * @param {(year:number) => {total:number, countries:number}} o.totalFor  affected people in the countries with data in a year (respects the age filter)
 */
export function createTimeline({ el, series, store, getI18n, totalFor }) {
  const first = series[0], last = series.at(-1);
  const x = scaleLinear().domain([first.year, last.year]).range([M.left, W - M.right]);
  const ys = series.map((d) => d.minutes);
  const y = scaleLinear().domain([Math.min(...ys) - 6, Math.max(...ys) + 6]).range([H - M.bottom, M.top]);
  const d = line().x((p) => x(p.year)).y((p) => y(p.minutes)).curve(curveMonotoneX)(series);

  // ---- DOM (built once, texts refreshed on language change) ----
  el.innerHTML = `
    <div class="tl-head">
      <button class="tl-play" type="button"></button>
      <span class="tl-year num"></span>
      <span class="tl-title"></span>
    </div>
    <div class="tl-chart-wrap"></div>
    <div class="tl-total"><span class="tl-total-num num"></span><span class="tl-total-label"></span></div>
    <p class="tl-note"></p>`;
  const $ = (s) => el.querySelector(s);
  const playBtn = $('.tl-play');

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'tl-chart' });
  const clip = svgEl('clipPath', { id: 'tl-clip' });
  const clipRect = svgEl('rect', { x: 0, y: 0, height: H, width: W });
  clip.append(clipRect);
  const axis = svgEl('line', { class: 'timeline-axis', x1: M.left, x2: W - M.right, y1: H - M.bottom + 6, y2: H - M.bottom + 6 });
  const base = svgEl('path', { class: 'timeline-line timeline-base', d, pathLength: 1 });
  const played = svgEl('g', { 'clip-path': 'url(#tl-clip)' });
  played.append(svgEl('path', { class: 'timeline-line timeline-played', d, pathLength: 1 }));
  const guide = svgEl('line', { class: 'timeline-guide', y1: M.top - 4, y2: H - M.bottom + 6 });
  const dot = svgEl('circle', { class: 'timeline-dot', r: 4 });
  const labelFirst = svgEl('text', { class: 'timeline-label', x: M.left, y: H - 4, 'text-anchor': 'start' });
  const labelLast = svgEl('text', { class: 'timeline-label', x: W - M.right, y: H - 4, 'text-anchor': 'end' });
  labelFirst.textContent = String(first.year);
  labelLast.textContent = String(last.year);
  const hit = svgEl('rect', { class: 'timeline-hit', x: 0, y: 0, width: W, height: H });
  svg.append(clip, axis, base, played, guide, dot, labelFirst, labelLast, hit);
  $('.tl-chart-wrap').append(svg);

  const total = createCounter($('.tl-total-num'), (n) => getI18n().compact(n));

  // ---- state ----
  const timeOf = () => store.get().year ?? last.year; // fractional year, e.g. 2018.25
  const quarter = (t) => Math.round(t * TIMELINE_STEPS_PER_YEAR) / TIMELINE_STEPS_PER_YEAR;
  let playing = false, timer = 0;

  function setYear(year) { store.set({ year: year >= last.year ? null : year }); }
  function stop() { playing = false; clearInterval(timer); timer = 0; paint(); }
  function play() {
    if (playing) return;
    if (timeOf() >= last.year) setYear(first.year);
    playing = true;
    timer = setInterval(() => {
      const next = quarter(timeOf() + 1 / TIMELINE_STEPS_PER_YEAR);
      if (next >= last.year) { setYear(last.year); stop(); return; }
      setYear(next);
    }, TIMELINE_STEP_MS / TIMELINE_STEPS_PER_YEAR);
    paint();
  }
  playBtn.addEventListener('click', () => (playing ? stop() : play()));

  // scrubbing: click or drag along the line
  const yearAt = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    return Math.max(first.year, Math.min(last.year, quarter(x.invert(px))));
  };
  /** y of the drawn curve at screen x (the dot rides on the smoothed line, not on straight segments). */
  const curveY = (px) => {
    const len = base.getTotalLength();
    let lo = 0, hi = len;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (base.getPointAtLength(mid).x < px) lo = mid; else hi = mid; }
    return base.getPointAtLength(hi).y;
  };
  let scrubbing = false;
  hit.addEventListener('pointerdown', (e) => { scrubbing = true; hit.setPointerCapture(e.pointerId); stop(); setYear(yearAt(e.clientX)); });
  hit.addEventListener('pointermove', (e) => { if (scrubbing) setYear(yearAt(e.clientX)); });
  const endScrub = () => { scrubbing = false; };
  hit.addEventListener('pointerup', endScrub);
  hit.addEventListener('pointercancel', endScrub);

  // ---- rendering ----
  let lang = null;
  function paint() {
    const i18n = getI18n();
    const t = timeOf();
    if (lang !== i18n.lang) {
      lang = i18n.lang;
      $('.tl-title').textContent = i18n.t('timeline.title');
      $('.tl-total-label').textContent = i18n.t('timeline.worldAffected');
      labelFirst.textContent = `${first.year} · ${i18n.minutes(first.minutes)}`;
      labelLast.textContent = `${last.year} · ${i18n.minutes(last.minutes)}`;
      el.setAttribute('aria-label', i18n.t('timeline.ariaLabel'));
    }
    playBtn.innerHTML = playing ? ICON.pause : ICON.play;
    playBtn.setAttribute('aria-label', i18n.t(playing ? 'timeline.pause' : 'timeline.play'));
    $('.tl-year').textContent = String(Math.round(t));
    const px = x(t);
    clipRect.setAttribute('width', px);
    guide.setAttribute('x1', px); guide.setAttribute('x2', px);
    dot.setAttribute('cx', px); dot.setAttribute('cy', curveY(px));
    const population = store.get().population;
    if (population) {
      const { total: affected, countries } = totalFor(t);
      total.to(affected, { duration: 400, ease: (u) => u });
      $('.tl-note').textContent = i18n.t('timeline.coverage', { count: countries });
    }
  }

  store.subscribe((s, prev) => {
    if (s.country && !prev.country && playing) stop();
    if (s.year !== prev.year || s.ageGroups !== prev.ageGroups || s.population !== prev.population || s.lang !== prev.lang) paint();
  });
  paint();
  return { render: paint };
}
