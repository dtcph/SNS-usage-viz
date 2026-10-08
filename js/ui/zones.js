// Zoomed state: the screen is split into left / middle / right thirds by pointer position (rAF-throttled).
// The control bar and the info card have priority: while the pointer is over them the zone is left unchanged.
export function initZones({ store, ignore = '.controls, .info-panel, .info-btn' }) {
  let x = null, over = false, raf = 0;

  const zoneFor = (px) => (px < window.innerWidth / 3 ? 'left' : px > (window.innerWidth * 2) / 3 ? 'right' : 'middle');
  const flush = () => {
    raf = 0;
    if (!store.get().country || over || x == null) return;
    store.set({ zone: zoneFor(x) });
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(flush); };

  window.addEventListener('pointermove', (e) => {
    x = e.clientX;
    over = !!e.target.closest?.(ignore);
    schedule();
  });
  document.documentElement.addEventListener('pointerleave', () => { x = null; if (store.get().country) store.set({ zone: 'middle' }); });
  store.subscribe((s, prev) => { if (s.country !== prev.country && !s.country) store.set({ zone: 'middle' }); });
}
