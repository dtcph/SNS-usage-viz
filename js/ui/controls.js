// Bottom control bar: age-group chips (multi-select), "All" reset, dark-mode switch, language switch.

/**
 * Chip behaviour: with everything selected, a click isolates that group; otherwise it toggles. At least one group stays on.
 * @returns {string[]} the next selection
 */
export function nextSelection(current, clickedId, allIds) {
  if (current.length === allIds.length) return [clickedId];
  if (current.includes(clickedId)) return current.length > 1 ? current.filter((id) => id !== clickedId) : current;
  return allIds.filter((id) => id === clickedId || current.includes(id)); // keeps generation order
}

export function createControls({ store, generations, getI18n, onLang }) {
  const chipRow = document.getElementById('chip-row');
  const themeSwitch = document.getElementById('theme-switch');
  const langButtons = [...document.querySelectorAll('#lang-switch button')];
  const allIds = generations.map((g) => g.id);

  const makeChip = (id) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = id; return b; };
  const allChip = makeChip('__all');
  const chips = generations.map((g) => makeChip(g.id));
  chipRow.append(allChip, ...chips);

  chipRow.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const { ageGroups } = store.get();
    store.set({ ageGroups: chip.dataset.id === '__all' ? allIds : nextSelection(ageGroups, chip.dataset.id, allIds) });
  });
  themeSwitch.addEventListener('click', () => store.set({ theme: store.get().theme === 'dark' ? 'light' : 'dark' }));
  langButtons.forEach((b) => b.addEventListener('click', () => onLang(b.dataset.lang)));

  function render() {
    const { ageGroups, theme, lang } = store.get();
    const i18n = getI18n();
    allChip.textContent = i18n.t('age.all');
    allChip.setAttribute('aria-pressed', String(ageGroups.length === allIds.length));
    generations.forEach((g, i) => {
      chips[i].textContent = `${i18n.t(`gen.${g.id}`)} · ${i18n.t('age.range', { from: i18n.number(g.ageFrom), to: i18n.number(g.ageTo) })}`;
      chips[i].setAttribute('aria-pressed', String(ageGroups.includes(g.id)));
    });
    themeSwitch.setAttribute('aria-checked', String(theme === 'dark'));
    langButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }
  store.subscribe(render);
  render();
  return { render };
}
