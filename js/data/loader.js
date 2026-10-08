// Loads the embedded JSON files and links country names to ISO codes. Unmappable names are logged once.
import { DATA_FILES, MAP_TOPOLOGY_URL } from '../config.js';
import { buildCountryIndex } from './country-names.js';

const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
};

/** Adds `a3` to every country row of data 1; returns the names that could not be mapped. */
export function attachCountryCodes(weekly, index) {
  const unmapped = [];
  for (const row of weekly.countries) {
    const c = index.byName(row.name);
    if (c) row.a3 = c.a3; else unmapped.push(row.name);
  }
  return unmapped;
}

/** @returns {Promise<{raw:object, index:object, topology:object}>} */
export async function loadAll() {
  const [weekly, daily, reasons, france, health, generationScreen, countryMap, topology] = await Promise.all([
    getJson(DATA_FILES.weeklyByCountry), getJson(DATA_FILES.dailySeries), getJson(DATA_FILES.usageReasons),
    getJson(DATA_FILES.franceScreenTime), getJson(DATA_FILES.healthIssues), getJson(DATA_FILES.generationScreenTime),
    getJson(DATA_FILES.countryMap), getJson(MAP_TOPOLOGY_URL),
  ]);
  const index = buildCountryIndex(countryMap);
  const unmapped = attachCountryCodes(weekly, index);
  if (unmapped.length) console.warn('[country-map] unmapped names in data 1:', unmapped);
  return { raw: { weekly, daily, reasons, france, health, generationScreen }, index, topology };
}
