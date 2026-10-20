// Country series for the race chart (second screen): data preparation and interpolation only, no DOM.
// A country's line starts at its first reported year (nothing before it, never a zero). Gaps between two reported years are
// interpolated linearly, so between data points the value moves steadily and at a reported year it is exactly the JSON value.

/**
 * @param {object} usage  social_media_time.json
 * @returns {{countries:{id:string, name:string, points:{t:number, v:number}[]}[], t0:number, t1:number, min:number, max:number}}
 *   id = ISO alpha-2 (for localised names). Colours are not part of the data: the chart colours by the current value (race-chart.js).
 */
export function buildSeries(usage) {
  const countries = usage.countries.map((c) => ({
    id: c.iso2,
    name: c.country,
    points: Object.entries(c.social_daily_minutes_by_year ?? {})
      .map(([year, v]) => ({ t: Number(year), v }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
      .sort((a, b) => a.t - b.t),
  })).filter((c) => c.points.length);

  const all = countries.flatMap((c) => c.points);
  const t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t));
  const values = all.map((p) => p.v);

  return { countries, t0, t1, min: Math.min(...values), max: Math.max(...values) };
}

/** Value of a country at fractional time t (e.g. 2019.37); null before its first and after its last reported year. */
export function valueAt(country, t) {
  const p = country.points;
  if (t < p[0].t || t > p.at(-1).t) return null;
  let i = 0;
  while (i < p.length - 1 && p[i + 1].t <= t) i++; // p[i].t <= t < p[i + 1].t
  if (i === p.length - 1 || p[i].t === t) return p[i].v; // exact at a data point
  const a = p[i], b = p[i + 1];
  return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
}

/** Polyline of a country between two times: interpolated end points plus every data point in between ([] if nothing is there). */
export function segment(country, from, to) {
  const p = country.points;
  const a = Math.max(from, p[0].t), b = Math.min(to, p.at(-1).t);
  if (a > b) return [];
  const out = [{ t: a, v: valueAt(country, a) }];
  for (const q of p) if (q.t > a && q.t < b) out.push(q);
  if (b > a) out.push({ t: b, v: valueAt(country, b) });
  return out;
}
