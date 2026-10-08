// One-off converter: Statista XLSX files  ->  /data/*.json
// Usage: node xls-to-json.mjs [inputDir=../data-src] [outDir=../data]
// Input files are located by their Statista id in the file name, so any
// download prefix/suffix is fine. Nothing here runs at page runtime.
import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const inDir = path.resolve(process.argv[2] ?? '../data-src');
const outDir = path.resolve(process.argv[3] ?? '../data');
fs.mkdirSync(outDir, { recursive: true });

const warnings = [];
const warn = (m) => { warnings.push(m); console.warn('WARN', m); };

function findFile(statId) {
  const f = fs.readdirSync(inDir).find((n) => n.includes(`statistic_id${statId}_`) && /\.xlsx?$/i.test(n));
  if (!f) throw new Error(`No file for statistic_id${statId} in ${inDir}`);
  return path.join(inDir, f);
}

/** Reads the "Data" sheet as array of rows (empty cells -> null), and the "Overview" sheet as key/value metadata. */
function readSheets(statId) {
  const wb = XLSX.readFile(findFile(statId), { cellDates: false });
  const rows = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
  const data = rows('Data').filter((r) => r.some((c) => c !== null)); // sheet ranges start at column B, so index 0 = first used column
  const meta = {};
  for (const r of rows('Overview')) {
    const [k, v] = r;
    if (typeof k === 'string' && typeof v === 'string' && ['Source', 'Survey period', 'Region', 'Publication date', 'Age group', 'Note'].includes(k)) meta[k] = v.trim();
  }
  return { data, meta, title: data[0][0] };
}

/**
 * Statista stores "hours.minutes" (e.g. 8.50 = 8 h 50 min, NOT 8.5 h) as a float.
 * Going through toFixed(2) restores the dropped trailing zero (11.1 -> "11.10").
 * Minutes >= 60 are impossible in h.mm: flagged and passed through as written (60 min).
 */
function hmToMinutes(v, label) {
  const [h, m] = Number(v).toFixed(2).split('.').map(Number);
  if (m >= 60) warn(`${label}: "${v}" is not a valid h.mm value (minutes=${m}); treated as ${h} h ${m} min`);
  return h * 60 + m;
}

const src = (meta, statId) => ({ statisticId: statId, source: meta.Source, period: meta['Survey period'], published: meta['Publication date'] });
const write = (name, obj) => { fs.writeFileSync(path.join(outDir, name), JSON.stringify(obj, null, 2) + '\n'); console.log('wrote', name); };

// ---- 1. Weekly time per territory, Q4 2025 (h.mm) -------------------------
{
  const { data, meta } = readSheets(270229);
  const rows = data.slice(2).map(([name, v]) => ({ name, hm: Number(v).toFixed(2), weeklyMin: hmToMinutes(v, `data1 ${name}`) }));
  const globalRow = rows.find((r) => /global average/i.test(r.name));
  write('weekly-time-by-country.json', {
    ...src(meta, 270229), unit: 'minutes per week (converted from h.mm)', note: meta.Note,
    global: globalRow ? { weeklyMin: globalRow.weeklyMin } : null,
    countries: rows.filter((r) => r !== globalRow),
  });
}

// ---- 2. Daily time on social networking 2012-2025 (minutes) ---------------
{
  const { data, meta } = readSheets(433871);
  write('daily-time-2012-2025.json', {
    ...src(meta, 433871), unit: 'minutes per day',
    series: data.slice(2).map(([y, v]) => ({ year: Number(y), minutes: Number(v) })),
  });
}

// ---- 3. Reasons for using social media, Q2 2025 (%) -----------------------
const REASON_IDS = {
  'Keeping in touch with friends and family': 'friendsFamily',
  'Filling spare time': 'spareTime',
  'Reading news stories': 'news',
  'Finding content (e.g. articles, videos)': 'findContent',
  "Seeing what's being talked about": 'talkedAbout',
  'Finding products to purchase': 'products',
  'Finding inspiration for things to do and buy': 'inspiration',
  'Watching or following sports': 'sports',
  'Watching live streams': 'liveStreams',
  'Making new contacts': 'newContacts',
  'Seeing content for your favorite brands': 'brands',
  'Sharing and discussing opinions with others': 'opinions',
  'Work-related networking and research': 'work',
  'Following celebrities or influencers': 'celebrities',
  'Avoiding missing out on things (FOMO)': 'fomo',
};
{
  const { data, meta } = readSheets(715449);
  write('usage-reasons.json', {
    ...src(meta, 715449), unit: 'percent of respondents (multiple answers possible)', ageGroup: meta['Age group'],
    reasons: data.slice(2).map(([label, pct]) => {
      if (!REASON_IDS[label]) warn(`unknown reason label "${label}" - add an id in REASON_IDS and i18n keys usage.reason.<id>`);
      return { id: REASON_IDS[label] ?? label, label, pct: Number(pct) };
    }),
  });
}

// ---- 4. Weekly screen time of minors in France (h.mm) ---------------------
{
  const { data, meta } = readSheets(1630850);
  const header = data[2].slice(1).filter((x) => x !== null); // ['1-6 years','7-12 years old','13-19 years old']
  const groups = header.map((label) => { const [a, b] = label.match(/\d+/g).map(Number); return { id: `${a}-${b}`, label, minAge: a, maxAge: b }; });
  const weeklyMin = {};
  for (const [year, ...rest] of data.slice(3)) {
    const vals = rest.slice(0, groups.length);
    weeklyMin[year] = Object.fromEntries(vals.map((v, i) => [groups[i].id, hmToMinutes(v, `data4 ${year} ${groups[i].id}`)]));
  }
  write('screentime-france.json', { ...src(meta, 1630850), unit: 'minutes per week (converted from h.mm)', region: 'France', groups, weeklyMin });
}

// ---- 5. Health issues of adolescents by weekend screen time (%) -----------
const ISSUE_IDS = {
  'Tired eyes': 'tiredEyes',
  'Feeling very tired or overwhelmed': 'veryTired',
  'Finding it hard to concentrate or stay focused': 'concentrate',
  'Problems sleeping': 'sleep',
  'Using substances': 'substances',
};
{
  const { data, meta } = readSheets(1673190);
  const header = data[2].slice(1, 8);
  // "12 and more hours" | "10 to less than 12 hours" | "Less than 2 hours"  ->  [minHours, maxHours) (maxHours null = open end)
  const categories = header.map((label, i) => {
    const n = label.match(/\d+/g).map(Number);
    let minHours, maxHours;
    if (/and more/i.test(label)) [minHours, maxHours] = [n[0], null];
    else if (/^less than/i.test(label)) [minHours, maxHours] = [0, n[0]];
    else [minHours, maxHours] = n;
    return { id: `c${i}`, label, minHours, maxHours };
  });
  write('health-issues.json', {
    ...src(meta, 1673190), unit: 'percent of adolescents reporting the issue in the past 30 days', basis: 'EU adolescents (13-18 surveyed); projected onto ages 10-19',
    categories,
    issues: data.slice(3).map(([label, ...vals]) => {
      if (!ISSUE_IDS[label]) warn(`unknown health issue "${label}" - add an id in ISSUE_IDS and i18n keys health.issue.<id>`);
      return { id: ISSUE_IDS[label] ?? label, label, pct: vals.slice(0, 7).map(Number) };
    }),
  });
}

// ---- 6. Screen time by device and generation, US 2026 (h.mm) --------------
const GEN_IDS = { 'Gen Z': 'genZ', Millenials: 'millennials', Millennials: 'millennials', 'Baby boomers': 'boomers', 'Gen X': 'genX' };
const DEVICE_IDS = { Smartphone: 'smartphone', Desktop: 'desktop', Laptop: 'laptop', Tablet: 'tablet', 'Connected TV': 'connectedTv' };
{
  const { data, meta } = readSheets(1716080);
  const devices = data[2].slice(1).filter((x) => x !== null).map((l) => DEVICE_IDS[l] ?? l);
  write('screentime-us-generations.json', {
    ...src(meta, 1716080), unit: 'minutes per day (converted from h.mm)', region: 'United States', ageGroup: meta['Age group'],
    // NOTE: raw labels as in the file. The file's description says baby boomers watch 4 h 20 min of connected TV,
    // but that value sits in the "Gen X" row -> see DATA6_SWAP_GENX_BOOMERS in js/config.js.
    devices,
    generations: data.slice(3).map(([label, ...vals]) => {
      if (!GEN_IDS[label]) warn(`unknown generation label "${label}"`);
      return { id: GEN_IDS[label] ?? label, label, minutes: Object.fromEntries(vals.slice(0, devices.length).map((v, i) => [devices[i], hmToMinutes(v, `data6 ${label} ${devices[i]}`)])) };
    }),
  });
}

console.log(warnings.length ? `\nDone with ${warnings.length} warning(s).` : '\nDone.');
