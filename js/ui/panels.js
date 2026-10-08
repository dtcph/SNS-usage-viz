// Popup host. Panels are listed in config.PANELS and live in js/ui/panels/<id>.js
// (export `zone` and `create(card, { store }) -> { render({ i18n, vm, fromZero }) }`).
// Adding a panel = one module + one config entry.
import { PANELS } from '../config.js';

export async function createPanels({ container, store }) {
  const panels = [];
  for (const def of PANELS) {
    const mod = await import(`./panels/${def.id}.js`);
    const shell = document.createElement('aside');
    shell.className = 'panel';
    shell.dataset.zone = def.zone;
    shell.dataset.panel = def.id;
    const card = document.createElement('div');
    card.className = 'panel-card';
    shell.append(card);
    container.append(shell);
    panels.push({ def, shell, view: mod.create(card, { store }), open: false });
  }

  let latest = null; // { i18n, vm }
  return {
    /** Called whenever country / filter / language changes. Open panels update in place (numbers count on). */
    update(ctx) {
      latest = ctx;
      for (const p of panels) if (p.open) p.view.render({ ...ctx, fromZero: false });
    },
    /** Opens the panel of the current zone, closes the others. */
    setZone(zone, active = true) {
      for (const p of panels) {
        const want = active && p.def.zone === zone;
        if (want === p.open) continue;
        p.open = want;
        p.shell.classList.toggle('is-open', want);
        if (want && latest) p.view.render({ ...latest, fromZero: true });
      }
    },
  };
}
