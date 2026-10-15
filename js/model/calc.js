// Pure model: from population + survey data to "affected" people, usage reasons and teen health numbers.
// No DOM, no fetch. Every tunable value comes from config.js. Run `node tools/check-calc.mjs` for a console check.
import * as cfg from '../config.js';
import { buildGenerations, rangeShareInGenerations } from './generations.js';

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const poly = ((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592;
  const erf = 1 - poly * t * Math.exp(-(z * z) / 2);
  return 0.5 * (1 + Math.sign(z) * erf);
}

/**
 * Builds everything that does not depend on the selected country/filter.
 * @param {object} raw  parsed JSON files: { usage, reasons, france, health, generationScreen }.
 *                      `usage.countries[i].a3` must already be set (the loader does that via country-map.json).
 */
export function createModel(raw, config = cfg) {
  const generations = buildGenerations(config.GENERATIONS, config.REFERENCE_YEAR);

  // Average daily minutes on social media per ISO alpha-3 and year (social_media_time.json). Years a country has no
  // value for stay missing: nothing is interpolated or estimated.
  const dailyByA3 = new Map(raw.usage.countries.filter((c) => c.a3).map((c) => [
    c.a3, new Map(Object.entries(c.social_daily_minutes_by_year).map(([y, m]) => [Number(y), m])),
  ]));
  const years = raw.usage.meta.years.map(Number).sort((a, b) => a - b);
  const latestYear = years.at(-1);
  /** Min and max over the countries that report each year (the legend and colour scale follow the shown year). */
  const extentByYear = new Map(years.map((year) => {
    const vals = [...dailyByA3.values()].map((byYear) => byYear.get(year)).filter((v) => v != null);
    return [year, [Math.min(...vals), Math.max(...vals)]];
  }));
  /** Per year: mean over the countries that report it, and how many do. */
  const yearSeries = years.map((year) => {
    const vals = [...dailyByA3.values()].map((byYear) => byYear.get(year)).filter((v) => v != null);
    return { year, minutes: sum(vals) / vals.length, countries: vals.length };
  });

  // Data 6: screen minutes per day, summed over devices (DEVICE_WEIGHTS) -> one number per generation.
  const rows = raw.generationScreen.generations.map((g) => ({ ...g }));
  if (config.DATA6_SWAP_GENX_BOOMERS) { // labels look swapped in the source, see config.js
    const x = rows.find((r) => r.id === 'genX'), b = rows.find((r) => r.id === 'boomers');
    if (x && b) [x.minutes, b.minutes] = [b.minutes, x.minutes];
  }
  const deviceTotal = {};
  for (const r of rows) deviceTotal[r.id] = sum(Object.entries(r.minutes).map(([dev, m]) => m * (config.DEVICE_WEIGHTS[dev] ?? 0)));
  for (const [id, p] of Object.entries(config.GENERATION_SCREENTIME_PROXY)) {
    if (deviceTotal[id] == null && deviceTotal[p.like] != null) deviceTotal[id] = deviceTotal[p.like] * p.factor; // TODO_DATA
  }

  // Data 4 (scaling aid only): France, 13-19 years, latest year, in hours per day.
  const franceYears = Object.keys(raw.france.weeklyMin).map(Number).sort((a, b) => a - b);
  const franceTeenHoursPerDay = raw.france.weeklyMin[franceYears.at(-1)]['13-19'] / 7 / 60;

  return { config, raw, generations, dailyByA3, years, latestYear, extentByYear, yearSeries, deviceTotal, franceTeenHoursPerDay, franceDailyMin: dailyByA3.get('FRA')?.get(latestYear) };
}

/**
 * [min, max] daily minutes of the colour scale / legend in `year` (null = latest year).
 * Between two reported years the ends are blended linearly, so the legend moves smoothly along with the slider.
 */
export function extentFor(model, year = null) {
  const y = year ?? model.latestYear, y0 = Math.floor(y), f = y - y0;
  const e0 = model.extentByYear.get(y0), e1 = model.extentByYear.get(y0 + 1);
  if (!e0 || f === 0 || !e1) return e0 ?? model.extentByYear.get(model.latestYear);
  return [e0[0] + (e1[0] - e0[0]) * f, e0[1] + (e1[1] - e0[1]) * f];
}

/**
 * Average daily minutes of a country in `year` (null = latest year). A fractional year (e.g. 2018.25) is interpolated
 * linearly between the two reported neighbours. Returns null when the data has no value for the year, or when one of the
 * two neighbours is missing: nothing is extrapolated or bridged across gaps.
 */
export function dailyMinutes(model, a3, year = null) {
  const byYear = model.dailyByA3.get(a3);
  if (!byYear) return null;
  const y = year ?? model.latestYear, y0 = Math.floor(y), f = y - y0;
  const v0 = byYear.get(y0);
  if (f === 0 || v0 == null) return f === 0 ? v0 ?? null : null;
  const v1 = byYear.get(y0 + 1);
  return v1 == null ? null : v0 + (v1 - v0) * f;
}

/** Normalised population shares per generation for a country (sum = 1). */
export function generationShares(model, a3) {
  const c = model.config;
  const base = c.GENERATION_POPULATION_SHARES_BY_COUNTRY[a3] ?? c.GENERATION_POPULATION_SHARES; // TODO_DATA per country
  const total = sum(model.generations.map((g) => base[g.id] ?? 0));
  return Object.fromEntries(model.generations.map((g) => [g.id, (base[g.id] ?? 0) / total]));
}

/** Population of the selected age groups (all groups selected = whole population). */
export function filteredPopulation(model, a3, population, selectedIds) {
  const shares = generationShares(model, a3);
  return population * sum(selectedIds.map((id) => shares[id] ?? 0));
}

/**
 * Affected people: social-media users of the selected generations whose daily time reaches the threshold.
 *  1. users_g    = population x userShare x (share_g x propensity_g) / sum(share x propensity)
 *  2. mean_g     = country daily minutes x relative screen weight of generation g (data 6; user-weighted mean = 1)
 *  3. affected_g = users_g x exp(-threshold / mean_g)      (exponential distribution of individual times)
 * @returns {{users:number, affected:number, byGeneration:{id:string, users:number, affected:number, meanMin:number}[]}}
 */
export function affectedPeople(model, a3, dailyMin, population, selectedIds) {
  const c = model.config;
  const shares = generationShares(model, a3);
  const weights = model.generations.map((g) => shares[g.id] * (c.GENERATION_USER_PROPENSITY[g.id] ?? 1));
  const wTotal = sum(weights);
  const userShare = c.INTERNET_PENETRATION_BY_COUNTRY[a3] ?? c.SOCIAL_MEDIA_USER_SHARE; // TODO_DATA per country
  const userFrac = Object.fromEntries(model.generations.map((g, i) => [g.id, weights[i] / wTotal]));
  const meanScreen = sum(model.generations.map((g) => userFrac[g.id] * (model.deviceTotal[g.id] ?? 0)));

  const byGeneration = model.generations.filter((g) => selectedIds.includes(g.id)).map((g) => {
    const users = population * userShare * userFrac[g.id];
    const rel = meanScreen > 0 && model.deviceTotal[g.id] ? model.deviceTotal[g.id] / meanScreen : 1;
    const meanMin = dailyMin * rel;
    const affected = meanMin > 0 ? users * Math.exp(-c.DOOMSCROLL_THRESHOLD_MIN_PER_DAY / meanMin) : 0;
    return { id: g.id, users, affected, meanMin };
  });
  return { users: sum(byGeneration.map((g) => g.users)), affected: sum(byGeneration.map((g) => g.affected)), byGeneration };
}

/** Data 3: percent of respondents x affected people = absolute number per reason (multiple answers, so the sum exceeds the total). */
export function usageReasonCounts(model, affected) {
  return model.raw.reasons.reasons.map((r) => ({ id: r.id, pct: r.pct, count: affected * r.pct / 100 })).sort((a, b) => b.count - a.count);
}

/**
 * Share of teens (10-19) per weekend-screen-time category of data 5, modelled as lognormal.
 * The mean scales with the country's daily social-media time relative to France (data 4 + usage data), dampened by countryElasticity.
 */
export function screenTimeDistribution(model, dailyMin) {
  const d = model.config.SCREENTIME_CATEGORY_DISTRIBUTION;
  const cats = model.raw.health.categories;
  if (d.fixedShares) return cats.map((c) => d.fixedShares[c.id]);
  const ratio = model.franceDailyMin ? dailyMin / model.franceDailyMin : 1;
  const mean = Math.min(d.maxMeanHours, model.franceTeenHoursPerDay * Math.pow(ratio, d.countryElasticity) * d.weekendFactor);
  const s2 = Math.log(1 + d.coefficientOfVariation ** 2), mu = Math.log(mean) - s2 / 2, s = Math.sqrt(s2);
  const cdf = (h) => (h <= 0 ? 0 : h === Infinity ? 1 : normalCdf((Math.log(h) - mu) / s));
  return cats.map((c) => cdf(c.maxHours ?? Infinity) - cdf(c.minHours));
}

/**
 * Teen health numbers. Teens = population x TEEN_SHARE (10-19), reduced to the part of ages 10-19 that lies in the
 * selected generations. Returns null when the selection has no overlap with 10-19.
 */
export function healthIssues(model, a3, dailyMin, population, selectedIds) {
  const c = model.config;
  const overlap = rangeShareInGenerations(model.generations, selectedIds, c.TEEN_AGE_FROM, c.TEEN_AGE_TO);
  if (overlap === 0) return null;
  const teens = population * (c.TEEN_SHARE_BY_COUNTRY[a3] ?? c.TEEN_SHARE) * overlap; // TODO_DATA per country
  const dist = screenTimeDistribution(model, dailyMin);
  const issues = model.raw.health.issues.map((i) => {
    const share = sum(dist.map((p, k) => p * i.pct[k] / 100));
    return { id: i.id, share, count: teens * share };
  });
  return { teens, distribution: dist, issues };
}

/**
 * Everything the UI needs for one country + selection. Returns null for countries without a value in `year`
 * (null = latest year); earlier years use the reported value of that year, never an estimate.
 */
export function describeCountry(model, a3, population, selectedIds, year = null) {
  const dailyMin = dailyMinutes(model, a3, year);
  if (dailyMin == null) return null;
  const aff = affectedPeople(model, a3, dailyMin, population, selectedIds);
  return {
    dailyMin,
    population: filteredPopulation(model, a3, population, selectedIds),
    ...aff,
    reasons: usageReasonCounts(model, aff.affected),
    health: healthIssues(model, a3, dailyMinutes(model, a3) ?? dailyMin, population, selectedIds), // teen distribution always uses the latest data
  };
}

/**
 * Affected people summed over all countries that report a value in `year` and have a known population (respects the
 * age selection). Population is held at today's level; `countries` says how many countries the sum covers.
 */
export function worldAffected(model, populationByA3, selectedIds, year = null) {
  let total = 0, countries = 0;
  for (const a3 of model.dailyByA3.keys()) {
    const pop = populationByA3[a3];
    const vm = pop != null ? describeCountry(model, a3, pop, selectedIds, year) : null;
    if (vm) { total += vm.affected; countries++; }
  }
  return { total, countries };
}

/** 125 -> { h: 2, m: 5 } */
export const splitMinutes = (min) => ({ h: Math.floor(Math.round(min) / 60), m: Math.round(min) % 60 });
