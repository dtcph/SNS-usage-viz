// Tiny store: modules read with get(), change with set(patch) and react through subscribe(). No globals.
export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    /** Merges the patch; listeners get (next, prev) only when a value actually changed. */
    set(patch) {
      const prev = state;
      const next = { ...prev, ...patch };
      if (Object.keys(patch).every((k) => Object.is(prev[k], next[k]))) return;
      state = next;
      listeners.forEach((fn) => fn(next, prev));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Fields: country (ISO alpha-3 | null), ageGroups (array of generation ids), lang, theme, zone ('left'|'middle'|'right'),
 *  population ({byA3, source, date} | null while loading), infoOpen,
 *  year (2012..latest shown on the globe by the timeline; null = latest),
 *  highlight ({share 0-1, context, label} | null: chart column hovered in a popup, drawn into the country). */
export const initialState = (ageGroups, lang, theme) => ({
  country: null, ageGroups, lang, theme, zone: 'middle', population: null, infoOpen: false, year: null, highlight: null,
});
