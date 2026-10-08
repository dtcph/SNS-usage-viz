// Calm count-up of a number inside an element (requestAnimationFrame, ease-in-out).
import { COUNT_UP_DURATION_MS } from '../config.js';

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {HTMLElement|SVGElement} el
 * @param {(n:number)=>string} format  called every frame, so it must be cheap
 */
export function createCounter(el, format) {
  let value = 0, raf = 0;
  const cancel = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const set = (v) => { cancel(); value = v; el.textContent = format(v); };
  return {
    set,
    get value() { return value; },
    /** Animates from `from` (default: the current value) to `target`; `duration` (ms) and `ease` default to the calm count-up. */
    to(target, { from = value, duration = COUNT_UP_DURATION_MS, ease = easeInOut } = {}) {
      cancel();
      if (reduced() || from === target) return set(target);
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        value = from + (target - from) * ease(p);
        el.textContent = format(value);
        if (p < 1) raf = requestAnimationFrame(step); else { raf = 0; value = target; }
      };
      raf = requestAnimationFrame(step);
    },
  };
}
