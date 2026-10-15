// Name -> country lookup built from /data/country-map.json (shared by the usage data, which carries ISO alpha-2 codes, and Worldometer matching).
export function normalizeName(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function buildCountryIndex(countryMap) {
  const byA3 = new Map(), byA2 = new Map(), byNum = new Map(), byName = new Map();
  for (const c of countryMap.countries) {
    byA3.set(c.a3, c);
    byA2.set(c.a2, c);
    byNum.set(c.num, c);
    for (const n of c.names) byName.set(normalizeName(n), c);
  }
  return {
    byA3, byA2, byNum,
    /** Finds a country by any known spelling; a trailing "(...)" is tried without as a second attempt. */
    byName(name) {
      return byName.get(normalizeName(name)) ?? byName.get(normalizeName(name.replace(/\(.*?\)/g, ''))) ?? null;
    },
  };
}
