// Console check of the model: node tools/check-calc.mjs
import fs from 'node:fs';
import { createModel, describeCountry, worldAffected } from '../js/model/calc.js';
import { attachCountryCodes } from '../js/data/loader.js';
import { buildCountryIndex } from '../js/data/country-names.js';

const J = (f) => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url)));
const raw = { usage: J('social_media_time.json'), reasons: J('usage-reasons.json'),
  france: J('screentime-france.json'), health: J('health-issues.json'), generationScreen: J('screentime-us-generations.json') };
const index = buildCountryIndex(J('country-map.json'));
const pop = J('population-snapshot.json').population;
const unmapped = attachCountryCodes(raw.usage, index);
console.log('unmapped usage countries:', unmapped.length ? unmapped : 'none');
console.log('usage countries without population:', raw.usage.countries.filter((c) => c.a3 && !pop[c.a3]).map((c) => c.country));
const topo = J('countries-110m.json');
const ids = new Set(topo.objects.countries.geometries.map((g) => g.id));
console.log('usage countries without geometry:', raw.usage.countries.filter((c) => c.a3 && !ids.has(index.byA3.get(c.a3).num)).map((c) => c.country));

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

// Time travel: each year uses the reported values only
for (const y of [2017, 2021, 2025]) {
  const r = describeCountry(model, 'DEU', pop.DEU, all, y);
  console.log(`\nDEU ${y}: daily=${Math.round(r.dailyMin)} min, affected=${Math.round(r.affected).toLocaleString('en')}`);
}
console.log('GHA 2017 (no value):', describeCountry(model, 'GHA', pop.GHA, all, 2017));
console.log('year series:', model.yearSeries.map((p) => `${p.year}: ${p.minutes.toFixed(0)} min (${p.countries})`).join(' | '));
console.log('affected by year:', model.years.map((y) => { const w = worldAffected(model, pop, all, y); return `${y}: ${Math.round(w.total / 1e6)}M in ${w.countries}`; }).join(' | '));
