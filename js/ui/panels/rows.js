// Shared list of "label ... animated number ... bar" rows used by the popups.
import { createCounter } from '../counter.js';

/** Keeps the DOM when ids and labels stay the same, so numbers can count from their previous value. */
export function createRows(listEl) {
  let sig = '';
  let rows = [];
  return {
    /** @param {{id:string,label:string}[]} items */
    sync(items, format) {
      const next = items.map((i) => `${i.id}:${i.label}`).join('|');
      if (next === sig) return rows;
      sig = next;
      listEl.replaceChildren();
      rows = items.map((item, i) => {
        const li = document.createElement('li');
        const head = document.createElement('div'); head.className = 'row-head';
        const label = document.createElement('span'); label.textContent = item.label;
        const valueWrap = document.createElement('span');
        const num = document.createElement('span'); num.className = 'num';
        valueWrap.append(num);
        head.append(label, valueWrap);
        const sub = document.createElement('div'); sub.className = 'row-sub';
        const bar = document.createElement('div'); bar.className = 'row-bar';
        const fill = document.createElement('i');
        fill.style.setProperty('--bar-color', `var(--rb-${(i * 2 + 1) % 7})`);
        bar.append(fill);
        li.append(head, sub, bar);
        listEl.append(li);
        return { id: item.id, counter: createCounter(num, format), sub, fill };
      });
      return rows;
    },
    invalidate() { sig = ''; },
  };
}
