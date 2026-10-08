// Console check of the model: node tools/check-calc.mjs
import fs from 'node:fs';
import { createModel, describeCountry, worldAffected } from '../js/model/calc.js';
import { attachCountryCodes } from '../js/data/loader.js';
import { buildCountryIndex } from '../js/data/country-names.js';

const J = (f) => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url)));
const raw = { weekly: J('weekly-time-by-country.json'), daily: J('daily-time-2012-2025.json'), reasons: J('usage-reasons.json'),
  france: J('screentime-france.json'), health: J('health-issues.json'), generationScreen: J('screentime-us-generations.json') };
const index = buildCountryIndex(J('country-map.json'));
const pop = J('population-snapshot.json').population;
const unmapped = attachCountryCodes(raw.weekly, index);
console.log('unmapped data-1 names:', unmapped.length ? unmapped : 'none');
console.log('data-1 countries without population:', raw.weekly.countries.filter((c) => c.a3 && !pop[c.a3]).map((c) => c.name));
const topo = J('countries-110m.json');
const ids = new Set(topo.objects.countries.geometries.map((g) => g.id));
console.log('data-1 countries without geometry:', raw.weekly.countries.filter((c) => c.a3 && !ids.has(index.byA3.get(c.a3).num)).map((c) => c.name));

const model = createModel(raw);
console.log('generations:', model.generations.map((g) => `${g.id} ${g.ageFrom}-${g.ageTo}`).join(' | '));
console.log('device totals (min/day):', model.deviceTotal);
const all = model.generations.map((g) => g.id);
for (const [a3, sel] of [['DEU', all], ['PHL', all], ['JPN', all], ['USA', ['genZ']], ['DEU', ['boomers']], ['BRA', ['alpha', 'genZ']]]) {
  const r = describeCountry(model, a3, pop[a3], sel);
  const f = (n) => Math.round(n).toLocaleString('en');
  console.log(`\n${a3} [${sel}] pop(filtered)=${f(r.population)} users=${f(r.users)} affected=${f(r.affected)} (${(100 * r.affected / r.users).toFixed(0)}% of users)`);
  console.log('  top reasons:', r.reasons.slice(0, 3).map((x) => `${x.id}=${f(x.count)}`).join(', '));
  console.log('  health:', r.health ? `teens=${f(r.health.teens)} dist=${r.health.distribution.map((p) => p.toFixed(2))} ${r.health.issues.map((i) => `${i.id}=${f(i.count)}(${(100 * i.share).toFixed(0)}%)`).join(' ')}` : 'no overlap with 10-19');
}

// Time travel (estimate): global trend applied to every country
for (const y of [2012, 2018, 2025]) {
  const r = describeCountry(model, 'DEU', pop.DEU, all, y);
  console.log(`\nDEU ${y}: weekly=${Math.round(r.weeklyMin)} min, affected=${Math.round(r.affected).toLocaleString('en')}`);
}
console.log('world affected 2012 / 2025:', [2012, 2025].map((y) => Math.round(worldAffected(model, pop, all, y)).toLocaleString('en')).join(' / '));
