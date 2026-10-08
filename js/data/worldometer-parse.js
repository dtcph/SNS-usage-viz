// Pure, DOM-free parser for the Worldometer "population by country" page.
// Works in the browser and in Node (tools/build-population-snapshot.mjs shares it).
// Locates the population column by its header text, so a changed year ("Population (2025)") or an extra column
// does not break it.

const stripTags = (html) => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#0?39;|&apos;/g, "'").replace(/&[a-z]+;/g, '').trim();

/** @returns {{name:string, population:number}[]} empty array when no matching table is found */
export function parseWorldometerHtml(html) {
  for (const table of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const rows = (table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []).map((tr) => (tr.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) ?? []).map(stripTags));
    const headerIdx = rows.findIndex((r) => r.some((c) => /^population/i.test(c)));
    if (headerIdx < 0) continue;
    const head = rows[headerIdx];
    const popCol = head.findIndex((c) => /^population/i.test(c));
    const nameCol = head.findIndex((c) => /country|dependency/i.test(c));
    if (nameCol < 0) continue;
    const out = [];
    for (const r of rows.slice(headerIdx + 1)) {
      const population = Number((r[popCol] ?? '').replace(/[^\d]/g, ''));
      if (r[nameCol] && population > 0) out.push({ name: r[nameCol], population });
    }
    if (out.length) return out;
  }
  return [];
}
