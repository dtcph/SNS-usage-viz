// Shared column chart for the popups (plain HTML/CSS, animated through the CSS variables).
// Each column: animated count on top, bar, short group label below. Hovering a column reports its index.
import { createCounter } from '../counter.js';

/** @param {HTMLElement} el  @param {{onHover:(index:number|null)=>void}} o */
export function createChart(el, { onHover }) {
  let sig = '';
  let cols = [];
  el.classList.add('chart');
  el.addEventListener('pointerleave', () => onHover(null));
  return {
    /**
     * Keeps the DOM when ids and labels stay the same, so numbers can count on from their previous value.
     * @param {{id:string, label:string, short:string}[]} items
     * @returns {{id:string, counter:object, track:HTMLElement}[]}
     */
    sync(items, format) {
      const next = items.map((i) => `${i.id}:${i.short}`).join('|');
      if (next === sig) return cols;
      sig = next;
      onHover(null);
      el.replaceChildren();
      cols = items.map((item, i) => {
        const col = document.createElement('div');
        col.className = 'col'; col.tabIndex = 0; col.title = item.label; col.setAttribute('aria-label', item.label);
        const track = document.createElement('div'); track.className = 'col-track';
        const bar = document.createElement('i');
        const val = document.createElement('span'); val.className = 'col-val num';
        track.append(bar, val);
        const label = document.createElement('span'); label.className = 'col-label'; label.textContent = item.short;
        col.append(track, label);
        col.addEventListener('pointerenter', () => onHover(i));
        col.addEventListener('focus', () => onHover(i));
        col.addEventListener('blur', () => onHover(null));
        el.append(col);
        return { id: item.id, counter: createCounter(val, format), track };
      });
      return cols;
    },
    /** Bar height as 0-1 (also picks its heatmap colour); set from 0 first on opening so the column grows. */
    setHeight(col, ratio, { fromZero }) {
      col.track.style.setProperty('--bar-color', `var(--rb-${Math.round(ratio * 6)})`);
      if (fromZero) col.track.style.setProperty('--h', 0);
      requestAnimationFrame(() => requestAnimationFrame(() => col.track.style.setProperty('--h', ratio)));
    },
  };
}
