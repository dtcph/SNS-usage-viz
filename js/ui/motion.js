// Reads the motion variables from CSS (css/animations.css) so JS-driven animation matches CSS transitions.

const KEYWORDS = {
  linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1],
};

/** CSS cubic-bezier(x1,y1,x2,y2) as an easing function t -> t. */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t;
  const Y = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) { // bisection is plenty precise for animation
      const v = X(t);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return Y(t);
  };
}

export function parseEasing(value) {
  const v = value.trim();
  const m = v.match(/^cubic-bezier\(([^)]+)\)$/);
  const pts = m ? m[1].split(',').map(Number) : KEYWORDS[v] ?? KEYWORDS['ease-in-out'];
  return cubicBezier(...pts);
}

export function parseTime(value) {
  const v = value.trim();
  const n = parseFloat(v);
  if (Number.isNaN(n)) return 0;
  return v.endsWith('ms') ? n : n * 1000;
}

/** @param {string} name  e.g. "zoom" reads --zoom-duration and --zoom-easing @returns {{duration:number, ease:(t:number)=>number}} */
export function readMotion(name) {
  const cs = getComputedStyle(document.documentElement);
  return { duration: parseTime(cs.getPropertyValue(`--${name}-duration`)), ease: parseEasing(cs.getPropertyValue(`--${name}-easing`)) };
}

/** Pixel value of a CSS custom property such as --zoom-pad-top. */
export const readPx = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
