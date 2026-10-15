// Loads the embedded JSON files and links countries to ISO codes. Unmappable rows are logged once.
import { DATA_FILES, MAP_TOPOLOGY_URL } from '../config.js';
import { buildCountryIndex } from './country-names.js';

const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
};

/** Adds `a3` to every country row of the usage data (matched by ISO alpha-2); returns the names that could not be mapped. */
export function attachCountryCodes(usage, index) {
  const unmapped = [];
  for (const row of usage.countries) {
    const c = index.byA2.get(row.iso2);
    if (c) row.a3 = c.a3; else unmapped.push(row.country);
  }
  return unmapped;
}

/** @returns {Promise<{raw:object, index:object, topology:object}>} */
export async function loadAll() {
  const [usage, reasons, france, health, generationScreen, countryMap, topology] = await Promise.all([
    getJson(DATA_FILES.socialMediaTime), getJson(DATA_FILES.usageReasons),
    getJson(DATA_FILES.franceScreenTime), getJson(DATA_FILES.healthIssues), getJson(DATA_FILES.generationScreenTime),
    getJson(DATA_FILES.countryMap), getJson(MAP_TOPOLOGY_URL),
  ]);
  const index = buildCountryIndex(countryMap);
  const unmapped = attachCountryCodes(usage, index);
  if (unmapped.length) console.warn('[country-map] unmapped countries in social_media_time.json:', unmapped);
  return { raw: { usage, reasons, france, health, generationScreen }, index, topology };
}
