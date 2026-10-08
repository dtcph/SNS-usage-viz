// Population per country: live from Worldometer through a configurable CORS proxy, else the embedded snapshot.
// Swap the strategy by editing CORS_PROXY_URL_TEMPLATE in config.js, or replace `fetchLive` below.
import { CORS_PROXY_URL_TEMPLATE, DATA_FILES, POPULATION_FETCH_TIMEOUT_MS, WORLDOMETER_URL } from '../config.js';
import { parseWorldometerHtml } from './worldometer-parse.js';

/** Strategy (a): proxy + HTML parsing. Resolves to [{name, population}] or throws. */
async function fetchLive(fetchImpl = fetch) {
  if (!CORS_PROXY_URL_TEMPLATE) throw new Error('no proxy configured');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), POPULATION_FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(CORS_PROXY_URL_TEMPLATE.replace('{url}', encodeURIComponent(WORLDOMETER_URL)), { signal: ctl.signal });
    if (!res.ok) throw new Error(`proxy answered HTTP ${res.status}`);
    const rows = parseWorldometerHtml(await res.text());
    if (rows.length < 100) throw new Error(`table not recognised (${rows.length} rows)`);
    return rows;
  } finally {
    clearTimeout(timer);
  }
}

/** Strategy (b): the snapshot file. */
async function fetchSnapshot(fetchImpl = fetch) {
  const res = await fetchImpl(DATA_FILES.populationSnapshot);
  if (!res.ok) throw new Error(`snapshot: HTTP ${res.status}`);
  return res.json();
}

/**
 * @param {{byName:(n:string)=>{a3:string}|null}} index  country lookup
 * @returns {Promise<{byA3:Object<string,number>, source:'live'|'snapshot'|'none', date:string|null}>}
 */
export async function loadPopulation(index, fetchImpl = fetch) {
  try {
    const rows = await fetchLive(fetchImpl);
    const byA3 = {}, unmapped = [];
    for (const r of rows) {
      const c = index.byName(r.name);
      if (c) byA3[c.a3] = r.population; else unmapped.push(r.name);
    }
    if (unmapped.length) console.warn('[country-map] unmapped Worldometer names:', unmapped);
    return { byA3, source: 'live', date: null };
  } catch (err) {
    console.info('[population] live fetch failed, using snapshot:', err.message ?? err);
  }
  try {
    const snap = await fetchSnapshot(fetchImpl);
    return { byA3: snap.population, source: 'snapshot', date: snap.date };
  } catch (err) {
    console.warn('[population] snapshot unavailable:', err.message ?? err);
    return { byA3: {}, source: 'none', date: null };
  }
}
