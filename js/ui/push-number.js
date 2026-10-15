// Dynamic numbers: the formatted string is a row of character slots. On a change the old and new strings are compared position
// by position, aligned from the right. Unchanged characters stay put; every changed character is replaced at once by a "push":
// value up -> the old character moves down one line and fades out while the new one slides in from above (down is reversed).
// No intermediate characters are shown. Only transform and opacity are animated (css/animations.css, popup duration/easing).
//
// Works for HTML elements (slots are spans, distance 1lh) and SVG elements (slots are <text>, distance 1em; the element is a <g>
// whose right edge is x = 0, the caller positions it). A new value that arrives mid-animation settles the previous target at once
// (nothing queued, nothing left over) and then animates from there.
import { readMotion } from './motion.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * @param {HTMLElement|SVGGElement} el  emptied and owned by the component
 * @param {(n:number)=>string} format   value -> display string (e.g. i18n.compact)
 */
export function createPushNumber(el, format) {
  const isSvg = el instanceof SVGElement;
  el.classList.add('pn');
  if (isSvg) el.classList.add('pn-svg');
  el.replaceChildren();

  let value = null, text = '', items = [], outs = [], timer = 0, digitW = 0;
  // items: left -> right, { ch, node }. HTML: node = slot span holding one .pn-ch. SVG: node = a <text class="pn-ch">.

  /** Widest of 0-9 in the element's current font: every digit gets a cell this wide, so slots are constant even if the font has no tabular figures. */
  function measureDigit() {
    const probe = isSvg ? document.createElementNS(NS, 'text') : document.createElement('span');
    probe.setAttribute('class', 'pn-ch');
    if (!isSvg) probe.style.cssText = 'position:absolute;visibility:hidden';
    el.append(probe);
    let max = 0;
    for (const d of '0123456789') {
      probe.textContent = d;
      max = Math.max(max, isSvg ? probe.getComputedTextLength() : probe.getBoundingClientRect().width);
    }
    probe.remove();
    digitW = max;
  }
  const isDigit = (ch) => ch >= '0' && ch <= '9';
  const cellWidth = (ch) => (digitW && isDigit(ch) ? `${digitW}px` : '');

  const makeChar = (ch) => {
    if (isSvg) {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'pn-ch');
      t.setAttribute('text-anchor', 'middle');
      t.textContent = ch;
      return t;
    }
    const slot = document.createElement('span');
    slot.className = 'pn-slot';
    slot.style.width = cellWidth(ch);
    const c = document.createElement('span');
    c.className = 'pn-ch';
    c.textContent = ch;
    slot.append(c);
    return slot;
  };
  const charNode = (item) => (isSvg ? item.node : item.node.firstChild);

  /** SVG only: every character centred in its cell, cells right-aligned at x = 0 (digit cells constant, others measured). */
  function placeSvg() {
    let x = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      const { ch, node } = items[i];
      const w = digitW && isDigit(ch) ? digitW : node.getComputedTextLength();
      node.setAttribute('x', x - w / 2);
      x -= w;
    }
  }

  /** Final, static rendering of a string (no animation, nothing left over). */
  function paint(str) {
    clearTimeout(timer); timer = 0; outs = [];
    measureDigit();
    items = [...str].map((ch) => ({ ch, node: makeChar(ch) }));
    el.replaceChildren(...items.map((i) => i.node));
    if (isSvg) placeSvg();
    text = str;
  }

  function animate(str, dir) {
    measureDigit();
    const old = items, a = old.map((i) => i.ch), b = [...str];
    const m = a.length, n = b.length;
    const next = new Array(n), leaving = [], entering = [];
    el.style.setProperty('--pn-dir', dir);

    // Removed (leftmost) slots go out of flow where they stood, so nothing else is affected by them.
    const offsets = new Map();
    if (!isSvg) for (let k = 0; k < m - n; k++) offsets.set(old[k], old[k].node.offsetLeft);

    for (let i = 0; i < Math.max(m, n); i++) {
      const o = m - 1 - i >= 0 ? old[m - 1 - i] : null;
      const ni = n - 1 - i;
      const ch = ni >= 0 ? b[ni] : null;
      if (o && ch !== null && o.ch === ch) { next[ni] = o; continue; } // unchanged: untouched
      if (o) { // the old character leaves
        if (isSvg) leaving.push(o.node);
        else if (ch !== null) { const c = o.node.firstChild; c.classList.add('pn-out'); leaving.push(c); }
        else { const s = o.node; s.classList.add('pn-gone'); s.style.left = `${offsets.get(o)}px`; leaving.push(s.firstChild); outs.push(s); }
      }
      if (ch !== null) { // the new character enters
        if (isSvg || !o) {
          const node = makeChar(ch);
          next[ni] = { ch, node };
          entering.push(charNode(next[ni]));
        } else {
          const c = document.createElement('span');
          c.className = 'pn-ch'; c.textContent = ch;
          o.node.append(c);
          o.node.style.width = cellWidth(ch);
          next[ni] = { ch, node: o.node };
          entering.push(c);
        }
      }
    }
    for (const c of entering) c.classList.add('is-enter');
    // SVG: the old <text> nodes stay in the group until the animation ends. HTML: replaced characters (.pn-out) stay inside their
    // slot, removed slots (.pn-gone) stay after the row; both are removed by cleanup().
    if (isSvg) outs.push(...leaving);
    el.replaceChildren(...next.map((i) => i.node), ...outs);
    items = next.map((i, k) => ({ ch: b[k], node: i.node }));
    if (isSvg) placeSvg();

    el.getBoundingClientRect(); // flush: the start state (is-enter) is rendered before the end state is set
    for (const c of leaving) c.classList.add('is-leave');
    for (const c of entering) c.classList.remove('is-enter');
    text = str;
    const { duration } = readMotion('popup');
    timer = setTimeout(cleanup, duration + 60);
  }

  function cleanup() {
    timer = 0;
    for (const o of outs) o.remove();
    outs = [];
    for (const i of items) if (!isSvg) i.node.querySelectorAll('.pn-out').forEach((c) => c.remove());
  }

  return {
    get value() { return value; },
    /** Shows the value at once, without animation. */
    set(v) { value = v; paint(format(v)); },
    /** Animates to the value (the first value is shown without animation). */
    to(v) {
      const str = format(v);
      const prev = value;
      if (prev === null) { this.set(v); return; }
      if (str === text) { value = v; return; } // same text: nothing to animate (also avoids flicker on sub-text changes)
      if (v === prev) { this.set(v); return; } // same value, different text (language switch)
      if (timer) paint(text); // settle the in-flight target in its final state, then go on from there
      value = v;
      animate(str, v > prev ? 1 : -1);
    },
  };
}

/** Static, JSON-sourced numbers: no sliding, just a fade-in when the text changes. */
export function setFaded(el, str) {
  if (el.textContent === str) return;
  el.textContent = str;
  el.classList.remove('pn-fade');
  el.getBoundingClientRect();
  el.classList.add('pn-fade');
}
