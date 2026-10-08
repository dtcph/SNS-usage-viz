// Builds /data/population-snapshot.json (keyed by ISO alpha-3). Two sources:
//   node build-population-snapshot.mjs --worldometer [html-file]   Worldometer, fetched directly (Node has no CORS) or from a saved HTML file
//   node build-population-snapshot.mjs --worldbank <population.csv> [year]
//        CSV from https://github.com/datasets/population (columns: Country Name, Country Code, Year, Value)
import fs from 'node:fs';
import { parseWorldometerHtml } from '../js/data/worldometer-parse.js';
import { buildCountryIndex } from '../js/data/country-names.js';

const [mode, arg, yearArg] = process.argv.slice(2);
const outFile = new URL('../data/population-snapshot.json', import.meta.url);
const index = buildCountryIndex(JSON.parse(fs.readFileSync(new URL('../data/country-map.json', import.meta.url))));
const today = new Date().toISOString().slice(0, 10);
const population = {}, unmapped = [];
let source, note;

if (mode === '--worldometer') {
  const html = arg ? fs.readFileSync(arg, 'utf8') : await (await fetch('https://www.worldometers.info/world-population/population-by-country/')).text();
  for (const r of parseWorldometerHtml(html)) {
    const c = index.byName(r.name);
    if (c) population[c.a3] = r.population; else unmapped.push(r.name);
  }
  source = 'worldometers.info/world-population/population-by-country';
  note = 'Scraped table, population column as published.';
} else if (mode === '--worldbank' && arg) {
  const rows = fs.readFileSync(arg, 'utf8').trim().split('\n').slice(1).map((l) => l.match(/("[^"]*"|[^,]*)(?:,|$)/g).map((s) => s.replace(/,$/, '').replace(/^"|"$/g, '')));
  const year = yearArg ?? String(Math.max(...rows.map((r) => Number(r[2]))));
  for (const [name, a3, y, v] of rows) {
    if (y !== year) continue;
    if (index.byA3.has(a3)) population[a3] = Number(v); else unmapped.push(name); // aggregates (World, EU, ...) land here
  }
  // The World Bank does not list Taiwan. Rounded approximation (about 23.4 million), replaced by live data when available.
  if (!population.TWN) population.TWN = 23400000;
  source = `World Bank population estimates via github.com/datasets/population, year ${year}`;
  note = 'Used because worldometers.info could not be reached when this snapshot was built. Taiwan (TWN) is a rounded manual value. Regenerate with --worldometer.';
} else {
  console.error('usage: see header of this file'); process.exit(1);
}

fs.writeFileSync(outFile, JSON.stringify({ date: today, source, note, population }, null, 1) + '\n');
console.log(`wrote ${Object.keys(population).length} countries (${source}); not mapped:`, unmapped.length ? unmapped.join(', ') : 'none');
