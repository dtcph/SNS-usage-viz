// Generations & age ranges, derived from REFERENCE_YEAR (nothing hard-coded). Pure functions.

/**
 * @param {{id:string, birthFrom:number, birthTo:number}[]} defs  birth-year ranges (inclusive)
 * @param {number} year  reference year
 * @returns {{id:string, birthFrom:number, birthTo:number, ageFrom:number, ageTo:number}[]}
 */
export function buildGenerations(defs, year) {
  return defs.map((g) => ({ ...g, ageFrom: year - g.birthTo, ageTo: year - g.birthFrom }));
}

/** Number of whole ages that lie in both [a1, a2] and [b1, b2] (inclusive, 0 when disjoint). */
export function ageOverlap(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1) + 1);
}

/**
 * Share of the ages [rangeFrom, rangeTo] that belong to the selected generations.
 * Ages are assumed to be uniformly populated, so this is also the share of that age band within the selection.
 */
export function rangeShareInGenerations(generations, selectedIds, rangeFrom, rangeTo) {
  const width = rangeTo - rangeFrom + 1;
  const covered = generations
    .filter((g) => selectedIds.includes(g.id))
    .reduce((sum, g) => sum + ageOverlap(g.ageFrom, g.ageTo, rangeFrom, rangeTo), 0);
  return covered / width;
}
