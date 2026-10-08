// Quiet tooltip that follows the pointer. Position updates are batched per animation frame.
export function createTooltip(el) {
  let x = 0, y = 0, raf = 0;
  const place = () => {
    raf = 0;
    const w = el.offsetWidth, h = el.offsetHeight, gap = 16;
    const left = x + gap + w > window.innerWidth ? x - gap - w : x + gap;
    const top = y + gap + h > window.innerHeight ? y - gap - h : y + gap;
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };
  return {
    /** @param {string} title @param {string[]} lines */
    show(title, lines, px, py) {
      el.replaceChildren();
      const strong = document.createElement('strong');
      strong.textContent = title;
      el.append(strong, ...lines.map((l) => { const s = document.createElement('span'); s.textContent = l; return s; }));
      this.move(px, py);
      el.classList.add('is-visible');
    },
    move(px, py) {
      x = px; y = py;
      if (!raf) raf = requestAnimationFrame(place);
    },
    hide() { el.classList.remove('is-visible'); },
  };
}
