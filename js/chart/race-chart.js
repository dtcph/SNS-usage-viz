// Second screen: animated timeline line chart ("race"), one line per country, SVG.
// The time axis scrolls: the playhead (line tips) stays at a fixed x, the axis and the drawn lines move left. Lines grow at the tip.
// Everything shown (background year, label order, values at the tips) belongs to the time at the playhead (`t`).
// Scrubbing back (drag, horizontal wheel, Shift+wheel) pauses and moves `t` within what has already been driven (`tMax`).
// Data and interpolation: series.js. This file: layout, input, drawing. Colours are CSS only (css/race.css), so theme switches need no JS.
import { scaleLinear } from "../../vendor/d3-lite.js";
import { createPushNumber } from "../ui/push-number.js";
import { buildSeries, segment, valueAt } from "./series.js";

const NS = "http://www.w3.org/2000/svg";
const MS_PER_YEAR = 3200; // playback speed (continuous time, not year jumps)
const YEARS_LEFT = 2; // years visible left of the playhead (the playhead sits in the horizontal centre)
const PAD = { top: 34, bottom: 40, left: 8, right: 8 }; // symmetric left / right, so the playhead is centred in the stage
const CORNER = { share: 0.12, max: 48 }; // line corners are rounded a little: radius = share of a year, capped in px
const GAP_MIN = 10,
  GAP_MAX = 18; // label spacing in px; shrinks with the number of visible countries
const HOVER_DIM = 0.18;
const DEFAULT_TOP_N = 10;
const YEAR_ANIM_MIN_MS = 90; // year changes closer together than this are shown without the rolling animation

const svgEl = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.append(n);
  return n;
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

const ICON = {
  play: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z"/></svg>',
  pause:
    '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2h2v8H3zM7 2h2v8H7z"/></svg>',
  replay:
    '<svg viewBox="0 0 12 12" aria-hidden="true"><path class="stroke" d="M2.2 6a3.8 3.8 0 1 0 1.2-2.8"/><path d="M1.2 1.4v3.2h3.2z"/></svg>',
};

/** Nice tick values between lo and hi (about `count` of them). */
function ticksOf(lo, hi, count) {
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step)
    out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/**
 * Vertical label layout without overlap. `items` are sorted by target y (`ty`); each gets `ly`, at least `gap` apart.
 * Neighbours that would collide form a cluster that is centred on its members' targets (pool-adjacent-violators style),
 * clamped to [lo, hi].
 */
export function spreadLabels(items, gap, lo, hi) {
  const clusters = [];
  const place = (c) => {
    const n = c.items.length;
    const mean = c.items.reduce((s, it, k) => s + it.ty - k * gap, 0) / n;
    c.pos = Math.max(lo, Math.min(mean, hi - (n - 1) * gap));
  };
  for (const it of items) {
    clusters.push({ items: [it], pos: 0 });
    place(clusters.at(-1));
    while (clusters.length > 1) {
      const b = clusters.at(-1),
        a = clusters.at(-2);
      if (a.pos + a.items.length * gap <= b.pos + 1e-6) break;
      a.items.push(...b.items);
      clusters.pop();
      place(a);
    }
  }
  for (const c of clusters)
    c.items.forEach((it, k) => {
      it.ly = c.pos + k * gap;
    });
}

/**
 * @param {object} o
 * @param {HTMLElement} o.root     the chart screen (holds #race-stage, #race-play and the filter)
 * @param {object} o.usage         social_media_time.json
 * @param {() => object} o.getI18n
 */
export function createRaceChart({ root, usage, getI18n }) {
  const data = buildSeries(usage);
  const stage = root.querySelector("#race-stage");
  const playBtn = root.querySelector("#race-play");
  const slider = root.querySelector("#race-n"),
    sliderLabel = root.querySelector("#race-n-label"),
    sliderFill = root.querySelector("#race-fill");
  root.querySelector("#race-n-hi").textContent = String(data.countries.length);
  const legMin = root.querySelector("#race-leg-min"),
    legMax = root.querySelector("#race-leg-max");

  // ---- state ----
  let t = data.t0,
    tMax = data.t0,
    playing = false;
  let active = false,
    raf = 0,
    lastNow = 0,
    dirty = true;
  let W = 0,
    H = 0,
    hover = null;
  let topN = Math.min(DEFAULT_TOP_N, data.countries.length);
  // colour scale: the page's heat stops (--rb-0 ... --rb-6) interpolated continuously over a smoothed [min, max] of the shown values
  let stops = [];
  const cDom = { lo: 0, hi: 1, ready: false };
  let legTxt = "";
  const yDom = { lo: 0, hi: 1, ready: false };
  let gapS = GAP_MAX,
    gapReady = false;
  const yScale = scaleLinear();
  let yearShown = null,
    yearChangedAt = 0;

  // ---- DOM ----
  const svg = svgEl("svg", { class: "race-svg", role: "img" });
  const defs = svgEl("defs", {}, svg);
  const clip = svgEl("clipPath", { id: "race-clip" }, defs);
  const clipRect = svgEl("rect", {}, clip);
  const clipL = svgEl("clipPath", { id: "race-clip-lines" }, defs); // lines stay inside the plot (above the x axis), also the ghost of the future
  const clipLRect = svgEl("rect", {}, clipL);
  const yearG = svgEl("g", { class: "race-year" }, svg); // rolling digits: the push-number of the main screen
  const yearNum = createPushNumber(yearG, (n) => String(n));
  const gridG = svgEl("g", { class: "race-grid" }, svg);
  const xG = svgEl(
    "g",
    { class: "race-xaxis", "clip-path": "url(#race-clip)" },
    svg,
  );
  const unitText = svgEl(
    "text",
    { class: "race-tick", x: PAD.left + 6, y: 14 },
    svg,
  );
  const guide = svgEl("line", { class: "race-guide" }, svg);
  const linesG = svgEl("g", { "clip-path": "url(#race-clip-lines)" }, svg);
  const tipsG = svgEl("g", {}, svg);
  const labelsG = svgEl("g", {}, svg);
  stage.append(svg);

  const yTicks = Array.from({ length: 14 }, () => ({
    line: svgEl("line", { class: "race-gridline" }, gridG),
    text: svgEl("text", { class: "race-tick" }, gridG),
  }));
  const xTicks = Array.from({ length: 12 }, () => ({
    line: svgEl("line", { class: "race-xtick" }, xG),
    text: svgEl("text", { class: "race-tick", "text-anchor": "middle" }, xG),
  }));
  const axisLine = svgEl("line", { class: "race-axisline" }, xG);

  const cs = data.countries.map((src) => {
    const c = {
      src,
      v: null,
      pass: false,
      vis: 0,
      y: 0,
      ry: 0,
      ly: 0,
      ty: 0,
      inited: false,
      hidden: true,
      rgb: null,
      css: "",
      vTxt: "",
    };
    c.ghost = svgEl("path", { class: "rc-ghost rc" }, linesG);
    c.line = svgEl("path", { class: "rc-line rc" }, linesG);
    c.dot = svgEl("circle", { class: "rc-dot rc", r: 4 }, tipsG);
    c.g = svgEl("g", { class: "rl rc" }, labelsG);
    c.gName = svgEl("g", {}, c.g);
    c.lead = svgEl("line", { class: "rl-lead" }, c.g); // short link from the dot to its label when the label had to move away
    c.name = svgEl(
      "text",
      { class: "rl-name", "dominant-baseline": "central" },
      c.gName,
    );
    c.nm = svgEl("tspan", {}, c.name);
    c.min = svgEl("tspan", { class: "rl-min", dx: 4 }, c.name); // "(214 min)", smaller and fainter
    c.g.style.display =
      c.line.style.display =
      c.ghost.style.display =
      c.dot.style.display =
        "none";
    c.g.addEventListener("pointerenter", () => {
      hover = src.id;
      kick();
    });
    c.g.addEventListener("pointerleave", () => {
      hover = null;
      kick();
    });
    return c;
  });

  // ---- geometry ----
  const plotW = () => Math.max(120, W - PAD.left - PAD.right);
  const playX = () => W / 2;
  const ppy = () => (playX() - PAD.left) / YEARS_LEFT; // pixels per year
  const xOf = (time) => playX() + (time - t) * ppy();

  function resize() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    if (!W || !H) return;
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    clipRect.setAttribute("x", PAD.left);
    clipRect.setAttribute("y", 0);
    clipRect.setAttribute("width", plotW() + PAD.right);
    clipRect.setAttribute("height", H);
    clipLRect.setAttribute("x", PAD.left);
    clipLRect.setAttribute("y", PAD.top - 14);
    clipLRect.setAttribute("width", plotW() + PAD.right);
    clipLRect.setAttribute("height", H - PAD.bottom + 10 - (PAD.top - 14));
    yScale.range([H - PAD.bottom, PAD.top]);
    const size = clamp((H - PAD.top - PAD.bottom) * 0.8, 110, 400);
    yearG.style.fontSize = `${size}px`;
    yearG.setAttribute(
      "transform",
      `translate(${W - 12} ${H - PAD.bottom - 4})`,
    );
    if (yearShown != null) yearNum.set(yearShown); // digit cells depend on the font size
    guide.setAttribute("y1", PAD.top - 12);
    guide.setAttribute("y2", H - PAD.bottom + 10);
    kick();
  }
  new ResizeObserver(resize).observe(stage);

  // ---- per-frame update ----
  function update(dt) {
    const k = (tau) => 1 - Math.exp(-dt / tau);
    const i18n = getI18n();
    const left = t - (playX() - PAD.left) / ppy();
    const right = t + (W - playX()) / ppy();
    let moving = false;

    // values, filter, target y-range of what is visible
    // Top N: the N highest current values at this time. Countries without a data point yet (v == null) do not take part.
    let lo = Infinity,
      hi = -Infinity,
      shown = 0,
      vMin = Infinity,
      vMax = -Infinity;
    const started = [];
    for (const c of cs) {
      c.v = valueAt(c.src, t);
      c.pass = false;
      if (c.v != null) started.push(c);
    }
    started.sort((a, b) => b.v - a.v);
    for (let i = 0; i < Math.min(topN, started.length); i++) {
      const c = started[i];
      c.pass = true;
      shown++;
      if (c.v < vMin) vMin = c.v;
      if (c.v > vMax) vMax = c.v;
      for (const p of segment(c.src, left, t)) {
        if (p.v < lo) lo = p.v;
        if (p.v > hi) hi = p.v;
      }
    }
    // colour domain follows min / max of the shown values, smoothed so colours do not jump
    if (shown) {
      let a = vMin,
        b = vMax;
      if (b - a < 12) {
        const m = (a + b) / 2;
        a = m - 6;
        b = m + 6;
      }
      if (!cDom.ready) {
        cDom.lo = a;
        cDom.hi = b;
        cDom.ready = true;
      }
      const kc = k(600);
      cDom.lo += (a - cDom.lo) * kc;
      cDom.hi += (b - cDom.hi) * kc;
      if (Math.abs(a - cDom.lo) + Math.abs(b - cDom.hi) > 0.2) moving = true;
      drawLegend(i18n);
    }
    if (shown) {
      const pad = Math.max(6, (hi - lo) * 0.08);
      let a = Math.floor((lo - pad) / 10) * 10,
        b = Math.ceil((hi + pad) / 10) * 10;
      if (b - a < 40) {
        const m = (a + b) / 2;
        a = m - 20;
        b = m + 20;
      }
      if (!yDom.ready) {
        yDom.lo = a;
        yDom.hi = b;
        yDom.ready = true;
      }
      const ky = k(280);
      yDom.lo += (a - yDom.lo) * ky;
      yDom.hi += (b - yDom.hi) * ky;
      if (Math.abs(a - yDom.lo) + Math.abs(b - yDom.hi) > 0.1) moving = true;
    }
    if (!yDom.ready) {
      yDom.lo = data.min - 10;
      yDom.hi = data.max + 10;
    }
    yScale.domain([yDom.lo, yDom.hi]);

    // label spacing and layout (shared by names on the left and values at the tips)
    const avail = H - PAD.top - PAD.bottom;
    const gapT = clamp(avail / Math.max(shown, 1), GAP_MIN, GAP_MAX);
    if (!gapReady) {
      gapS = gapT;
      gapReady = true;
    }
    gapS += (gapT - gapS) * k(260);
    if (Math.abs(gapT - gapS) > 0.05) moving = true;
    // countries that are fading out keep their slot until they are gone
    const items = cs.filter((c) => c.v != null && (c.pass || c.vis > 0.02));
    for (const c of items) c.ty = yScale(c.v);
    items.sort((a, b) => a.ty - b.ty);
    spreadLabels(items, gapS, PAD.top - 6, H - PAD.bottom + 6);

    const fontPx = Math.round(clamp(gapS * 0.82, 8, 13.5) * 10) / 10;
    const px = playX();
    const kl = k(150),
      kv = k(200);

    // labels glide to their target slot (new ones start in place)
    for (const c of items) {
      if (!c.inited) {
        c.y = c.ly;
        c.inited = true;
        continue;
      }
      const dy = c.ly - c.y;
      c.y += dy * kl;
      if (Math.abs(dy) > 0.2) moving = true;
      else c.y = c.ly;
    }
    // Shown positions never overlap: labels that came closer than the gap while gliding past each other (rank swap) are pushed apart.
    for (const c of items) c.ty = c.y;
    const placed = [...items].sort((a, b) => a.ty - b.ty);
    spreadLabels(placed, gapS, PAD.top - 6, H - PAD.bottom + 6);
    for (const c of placed) c.ry = c.ly; // display only: the gliding state (c.y) keeps its own course, so labels can still pass each other

    for (const c of cs) {
      const target = c.pass
        ? hover == null || hover === c.src.id
          ? 1
          : HOVER_DIM
        : 0;
      const d = target - c.vis;
      c.vis += d * kv;
      if (Math.abs(d) > 0.004) moving = true;
      else c.vis = target;
      if (c.vis < 0.004 && !c.pass) {
        if (!c.hidden) {
          c.g.style.display =
            c.line.style.display =
            c.ghost.style.display =
            c.dot.style.display =
              "none";
          c.hidden = true;
          c.inited = false;
        }
        continue;
      }
      if (c.hidden) {
        c.g.style.display =
          c.line.style.display =
          c.ghost.style.display =
          c.dot.style.display =
            "";
        c.hidden = false;
      }
      const op = String(c.vis);
      c.g.style.opacity = c.line.style.opacity = c.dot.style.opacity = op;
      if (c.v != null && shown) moving = paintColor(c, k(260)) || moving;
      // line grown up to the playhead; the part already driven but ahead of it (after scrubbing back) is a faint ghost
      c.line.setAttribute("d", path(segment(c.src, left - 0.05, t)));
      c.ghost.setAttribute(
        "d",
        tMax - t > 1e-4
          ? path(segment(c.src, t, Math.min(tMax, right + 0.05)))
          : "",
      );
      c.ghost.style.opacity = String(c.vis * 0.4);
      const ty = c.v != null ? yScale(c.v) : c.ry;
      c.dot.setAttribute("cx", px);
      c.dot.setAttribute("cy", ty);
      c.gName.setAttribute("transform", `translate(${px + 16} ${c.ry})`); // right of the dot
      const off = Math.abs(ty - c.ry) > 1.5;
      c.lead.style.display = off ? "" : "none";
      if (off) {
        c.lead.setAttribute("x1", px + 4);
        c.lead.setAttribute("y1", ty);
        c.lead.setAttribute("x2", px + 11);
        c.lead.setAttribute("y2", c.ry);
      }
      c.name.style.fontSize = `${fontPx}px`;
      if (c.v != null) {
        // "(214 min)" only rewritten when the rounded number changes
        const txt = `(${i18n.minutes(c.v)})`;
        if (txt !== c.vTxt) {
          c.vTxt = txt;
          c.min.textContent = txt;
        }
      }
    }

    drawAxes(left, right);
    guide.setAttribute("x1", px);
    guide.setAttribute("x2", px);
    setYear(Math.floor(t + 1e-6));
    return moving;
  }

  // ---- colour: heat stops from CSS, continuous in between ----
  const parseColor = (str) => {
    const v = str.trim();
    const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const h =
        hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join("") : hex[1];
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    return (v.match(/[\d.]+/g) ?? [128, 128, 128]).slice(0, 3).map(Number);
  };
  function readStops() {
    const cs2 = getComputedStyle(document.documentElement);
    stops = Array.from({ length: 7 }, (_, i) =>
      parseColor(cs2.getPropertyValue(`--rb-${i}`)),
    );
  }
  function heat(u) {
    const x = clamp(u, 0, 1) * (stops.length - 1),
      i = Math.min(stops.length - 2, Math.floor(x)),
      f = x - i;
    return stops[i].map((c, j) => c + (stops[i + 1][j] - c) * f);
  }
  /** Moves the country's colour towards the heat colour of its current value; returns true while it is still changing. */
  function paintColor(c, kk) {
    const target = heat((c.v - cDom.lo) / (cDom.hi - cDom.lo));
    let moving = false;
    if (!c.rgb) c.rgb = target.slice();
    else
      c.rgb = c.rgb.map((x, j) => {
        const d = target[j] - x;
        if (Math.abs(d) > 0.6) moving = true;
        return x + d * kk;
      });
    const css = `rgb(${c.rgb.map(Math.round).join(",")})`;
    if (css !== c.css) {
      c.css = css;
      for (const n of [c.line, c.ghost, c.dot, c.g])
        n.style.setProperty("--c", css);
    }
    return moving;
  }
  function drawLegend(i18n) {
    const a = i18n.minutes(cDom.lo),
      b = i18n.minutes(cDom.hi);
    if (a + b === legTxt) return;
    legTxt = a + b;
    legMin.textContent = a;
    legMax.textContent = b;
  }
  function setYear(y) {
    if (y === yearShown) return;
    const now = performance.now(),
      fast = now - yearChangedAt < YEAR_ANIM_MIN_MS; // very quick changes: no rolling, nothing lags behind
    yearChangedAt = now;
    if (yearShown == null || fast) yearNum.set(y);
    else yearNum.to(y); // counts down when scrubbing back or on replay
    yearShown = y;
  }
  new MutationObserver(() => {
    readStops();
    kick();
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  readStops();

  /** Polyline with softly rounded corners (quadratic bends at the data points), so yearly values do not make sharp kinks. */
  const path = (pts) => {
    if (!pts.length) return "";
    const P = pts.map((p) => [xOf(p.t), yScale(p.v)]);
    const R = Math.min(CORNER.share * ppy(), CORNER.max);
    let d = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
    for (let i = 1; i < P.length - 1; i++) {
      const [a, b, c] = [P[i - 1], P[i], P[i + 1]];
      const l1 = Math.hypot(a[0] - b[0], a[1] - b[1]),
        l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const r = Math.min(R, l1 / 2, l2 / 2);
      if (r < 0.5) {
        d += `L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
        continue;
      }
      const p1 = [
        b[0] + ((a[0] - b[0]) / l1) * r,
        b[1] + ((a[1] - b[1]) / l1) * r,
      ];
      const p2 = [
        b[0] + ((c[0] - b[0]) / l2) * r,
        b[1] + ((c[1] - b[1]) / l2) * r,
      ];
      d += `L${p1[0].toFixed(1)} ${p1[1].toFixed(1)}Q${b[0].toFixed(1)} ${b[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    if (P.length > 1)
      d += `L${P.at(-1)[0].toFixed(1)} ${P.at(-1)[1].toFixed(1)}`;
    return d;
  };

  function drawAxes(left, right) {
    const top = PAD.top - 10,
      bottom = H - PAD.bottom + 10;
    const ys = ticksOf(yScale.invert(bottom), yScale.invert(top), 6);
    yTicks.forEach((tk, i) => {
      const v = ys[i];
      tk.line.style.display = tk.text.style.display = v == null ? "none" : "";
      if (v == null) return;
      const y = yScale(v);
      tk.line.setAttribute("x1", PAD.left);
      tk.line.setAttribute("x2", W - PAD.right);
      tk.line.setAttribute("y1", y);
      tk.line.setAttribute("y2", y);
      tk.text.setAttribute("x", PAD.left + 6);
      tk.text.setAttribute("y", y - 4);
      tk.text.textContent = String(v);
    });
    const years = [];
    for (let y = Math.ceil(left); y <= right; y++) years.push(y);
    xTicks.forEach((tk, i) => {
      const y = years[i];
      const x = y == null ? 0 : xOf(y);
      const off = y == null || y < data.t0 || x > W - 24;
      tk.line.style.display = tk.text.style.display = off ? "none" : "";
      if (off) return;
      tk.line.setAttribute("x1", x);
      tk.line.setAttribute("x2", x);
      tk.line.setAttribute("y1", bottom);
      tk.line.setAttribute("y2", bottom + 6);
      tk.text.setAttribute("x", x);
      tk.text.setAttribute("y", bottom + 22);
      tk.text.textContent = String(y);
    });
    axisLine.setAttribute("x1", PAD.left);
    axisLine.setAttribute("x2", W);
    axisLine.setAttribute("y1", bottom);
    axisLine.setAttribute("y2", bottom);
  }

  // ---- loop: runs only while something changes ----
  function kick() {
    dirty = true;
    if (raf || !active || !W) return;
    lastNow = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    raf = 0;
    if (!active) return;
    const dt = clamp(now - lastNow, 1, 50);
    lastNow = now;
    if (playing) {
      t = Math.min(data.t1, t + dt / MS_PER_YEAR);
      tMax = Math.max(tMax, t);
      if (t >= data.t1) {
        playing = false;
        syncButton();
      }
    }
    dirty = false;
    const moving = update(dt);
    if (playing || moving || dirty) raf = requestAnimationFrame(frame);
  }

  // ---- play / pause / replay ----
  const atEnd = () => t >= data.t1 - 1e-9;
  const mode = () => (playing ? "pause" : atEnd() ? "replay" : "play");
  function syncButton() {
    const m = mode(),
      i18n = getI18n();
    playBtn.dataset.mode = m;
    playBtn.innerHTML = `${ICON[m === "pause" ? "pause" : m === "replay" ? "replay" : "play"]}<span>${i18n.t(`race.${m}`)}</span>`;
  }
  playBtn.addEventListener("click", () => {
    const m = mode();
    if (m === "pause") playing = false;
    else if (m === "replay") {
      t = tMax = data.t0;
      playing = true;
    } // start over, lines grow again from the left
    else playing = true; // continues from the current time
    syncButton();
    kick();
  });

  // Space toggles play / pause / replay while this screen is in view. On a focused button or slider Space keeps its own meaning
  // (a focused play button already toggles itself), so those are skipped to avoid a double toggle.
  document.addEventListener("keydown", (e) => {
    if (
      e.code !== "Space" ||
      e.repeat ||
      !active ||
      e.target.closest?.('button, input, a, [role="switch"]')
    )
      return;
    e.preventDefault(); // no page scroll
    playBtn.click();
  });

  // ---- scrubbing: drag, horizontal wheel, Shift+wheel (vertical wheel stays page scroll) ----
  function scrubBy(years) {
    if (!years) return;
    t = clamp(t + years, data.t0, tMax);
    playing = false;
    syncButton();
    kick();
  }
  let drag = null;
  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, moved: false };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 3) return;
    drag.moved = true;
    svg.classList.add("is-dragging");
    drag.x = e.clientX;
    scrubBy(-dx / ppy());
  });
  const endDrag = () => {
    drag = null;
    svg.classList.remove("is-dragging");
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener(
    "wheel",
    (e) => {
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!horizontal && !e.shiftKey) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : 1;
      scrubBy(((horizontal ? e.deltaX : e.deltaY) * unit) / ppy());
    },
    { passive: false },
  );

  // ---- Top-N slider (1 .. number of countries, step 1: only 54 values, so no coarser steps are needed) ----
  slider.min = 1;
  slider.max = data.countries.length;
  slider.step = 1;
  slider.value = topN;
  function syncSlider() {
    topN = Number(slider.value);
    sliderLabel.textContent = getI18n().t("race.topn", {
      n: topN,
      total: data.countries.length,
    });
    sliderFill.style.width = `${((topN - 1) / Math.max(1, data.countries.length - 1)) * 100}%`;
    kick();
  }
  slider.addEventListener("input", syncSlider);

  // ---- public ----
  function refresh() {
    const i18n = getI18n();
    for (const c of cs)
      c.nm.textContent = i18n.countryName(c.src.id, c.src.name);
    unitText.textContent = i18n.t("race.unit");
    svg.setAttribute("aria-label", i18n.t("race.ariaLabel"));
    legTxt = "";
    for (const c of cs) c.vTxt = "";
    syncButton();
    syncSlider();
  }
  refresh();

  return {
    refresh,
    /** The screen is (partly) in view. Leaving it pauses the animation. */
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on) {
        resize();
        kick();
      } else {
        playing = false;
        syncButton();
      }
    },
  };
}
