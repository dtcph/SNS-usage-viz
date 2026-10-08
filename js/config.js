// All tunable constants and placeholders. Anything marked TODO_DATA is a stand-in until real data is available.
// This file is plain data (no DOM access), so the model can also run in Node (tools/check-calc.mjs).

// ---- Reference & languages ----------------------------------------------------------------------------------
/** Year all generation age ranges are computed from. */
export const REFERENCE_YEAR = 2026;
export const DEFAULT_LANG = 'en';
export const LANGUAGES = ['en', 'ko'];
/** BCP-47 locale per UI language (number formats, country names). */
export const LOCALES = { en: 'en', ko: 'ko-KR' };

// ---- Data locations -----------------------------------------------------------------------------------------
export const DATA_FILES = {
  weeklyByCountry: 'data/weekly-time-by-country.json',   // data 1
  dailySeries: 'data/daily-time-2012-2025.json',          // data 2
  usageReasons: 'data/usage-reasons.json',                // data 3
  franceScreenTime: 'data/screentime-france.json',        // data 4
  healthIssues: 'data/health-issues.json',                // data 5
  generationScreenTime: 'data/screentime-us-generations.json', // data 6
  countryMap: 'data/country-map.json',
  populationSnapshot: 'data/population-snapshot.json',
};
/** World geometry (drawn on a 3D globe). Swap to a 50m file for more detail (small states such as Singapore/Hong Kong only exist there). */
export const MAP_TOPOLOGY_URL = 'data/countries-110m.json';
/** Antarctica (ISO numeric) is not drawn. */
export const MAP_HIDDEN_IDS = ['010'];

// ---- Population (live fetch + snapshot fallback) ------------------------------------------------------------
export const WORLDOMETER_URL = 'https://www.worldometers.info/world-population/population-by-country/';
/**
 * CORS proxy, used for the live fetch. `{url}` is replaced with the URL-encoded Worldometer address.
 * Set to your own proxy later; set to null to always use the snapshot.
 * TODO_DATA: public proxies are unreliable; replace with your own endpoint.
 */
export const CORS_PROXY_URL_TEMPLATE = 'https://api.allorigins.win/raw?url={url}';
/** Give up on the live fetch after this long and use the snapshot. */
export const POPULATION_FETCH_TIMEOUT_MS = 6000;

// ---- Social-media users & affected people -------------------------------------------------------------------
/**
 * Share of the population that uses social media. 62.3 % = global penetration quoted in the description of data 2 (Feb 2025).
 * Applied to every country; override single countries in INTERNET_PENETRATION_BY_COUNTRY.
 */
export const SOCIAL_MEDIA_USER_SHARE = 0.623;
/** TODO_DATA: per-country social-media user share, keyed by ISO alpha-3, e.g. { DEU: 0.78 }. Missing keys use SOCIAL_MEDIA_USER_SHARE. */
export const INTERNET_PENETRATION_BY_COUNTRY = {};

/**
 * "Affected" = social-media users who spend at least this many minutes per day in social media.
 * Individual daily time is assumed exponentially distributed around the group's mean (see calc.js), so the share of
 * affected people is exp(-threshold / mean). The mean is the country's daily time (data 1) scaled by generation.
 */
export const DOOMSCROLL_THRESHOLD_MIN_PER_DAY = 120;

// ---- Generations --------------------------------------------------------------------------------------------
/** Birth-year ranges (inclusive). Age ranges are derived from REFERENCE_YEAR. Order = chip order (youngest first). */
export const GENERATIONS = [
  { id: 'alpha', birthFrom: 2013, birthTo: REFERENCE_YEAR },
  { id: 'genZ', birthFrom: 1997, birthTo: 2012 },
  { id: 'millennials', birthFrom: 1981, birthTo: 1996 },
  { id: 'genX', birthFrom: 1965, birthTo: 1980 },
  { id: 'boomers', birthFrom: 1946, birthTo: 1964 },
];

/**
 * TODO_DATA: share of a country's population per generation (global, rough UN-style age structure; normalised in calc.js,
 * so the ~2 % aged 81+ are folded into the others). Replace per country via GENERATION_POPULATION_SHARES_BY_COUNTRY.
 */
export const GENERATION_POPULATION_SHARES = { alpha: 0.235, genZ: 0.225, millennials: 0.215, genX: 0.17, boomers: 0.13 };
/** TODO_DATA: per-country override, keyed by ISO alpha-3 -> same shape as GENERATION_POPULATION_SHARES. */
export const GENERATION_POPULATION_SHARES_BY_COUNTRY = {};
/**
 * TODO_DATA: relative likelihood of being a social-media user per generation (1 = average). Only the ratios matter:
 * the total user count always equals population x SOCIAL_MEDIA_USER_SHARE.
 */
export const GENERATION_USER_PROPENSITY = { alpha: 0.25, genZ: 1.2, millennials: 1.2, genX: 1.0, boomers: 0.6 };

// ---- Generation weighting from data 6 (US device screen time) -----------------------------------------------
/** Which devices of data 6 add up to a generation's screen time. 0 = ignore. */
export const DEVICE_WEIGHTS = { smartphone: 1, desktop: 1, laptop: 1, tablet: 1, connectedTv: 1 };
/**
 * The labels "Gen X" and "Baby boomers" look swapped in data 6: its description says baby boomers watch 4 h 20 min of
 * connected TV, but that value is in the "Gen X" row. true = swap the two rows' values.
 */
export const DATA6_SWAP_GENX_BOOMERS = true;
/** TODO_DATA: data 6 only covers adults (18+). Generations without a row borrow another one's value x factor. */
export const GENERATION_SCREENTIME_PROXY = { alpha: { like: 'genZ', factor: 0.8 } };

// ---- Health issues (data 5) ---------------------------------------------------------------------------------
export const TEEN_AGE_FROM = 10;
export const TEEN_AGE_TO = 19;
/** TODO_DATA: share of the population aged 10-19 (global ~15 %). Override per country with TEEN_SHARE_BY_COUNTRY. */
export const TEEN_SHARE = 0.15;
export const TEEN_SHARE_BY_COUNTRY = {};
/**
 * How teens spread over the weekend-screen-time categories of data 5.
 *  - Mean daily weekend hours = FRANCE_TEEN_DAILY_HOURS (data 4, 13-19, latest year)
 *      x (country weekly social-media time / France's) ^ COUNTRY_ELASTICITY  x  WEEKEND_FACTOR
 *    Data 4 is only a scaling aid here; it is not drawn anywhere.
 *  - Spread: lognormal with the given coefficient of variation, cut at the category bounds from data 5.
 *  - `fixedShares`: set to { c0: .., ..., c6: .. } (sums to 1) to bypass the model completely.
 * TODO_DATA: elasticity, weekend factor and spread are assumptions.
 */
export const SCREENTIME_CATEGORY_DISTRIBUTION = {
  countryElasticity: 0.35,
  weekendFactor: 1.35,
  coefficientOfVariation: 0.6,
  maxMeanHours: 14,
  fixedShares: null,
};

// ---- Display ------------------------------------------------------------------------------------------------
/** Count-up animation of numbers (ms). Everything else is animated through CSS variables (css/animations.css). */
export const COUNT_UP_DURATION_MS = 1100;
/** Max. usage reasons shown in the popup (sorted by size). */
export const USAGE_REASONS_VISIBLE = 8;
/** Number of colour classes of the heatmap (css/theme-*.css define --rb-0 ... --rb-6, blue -> pink -> red). */
export const MAP_COLOR_STEPS = 7;
/** Globe: initial view as [longitude, latitude] of the point facing the viewer, and the user zoom range (1 = whole globe fits). */
export const GLOBE_INITIAL_CENTER = [10, 20];
export const GLOBE_ZOOM_MIN = 0.8;
export const GLOBE_ZOOM_MAX = 6;
/** Zoom fit: share of the neutral middle third the country may fill (0-1), and a cap on the zoom factor. */
export const ZOOM_FILL = 0.92;
export const ZOOM_MAX_SCALE = 40;
/** Zoom fits the main landmass: polygons smaller than this share of the largest one (overseas territories) are ignored. */
export const ZOOM_MIN_PART_AREA_RATIO = 0.25;

/** Panels: zone decides where they fly in from. Add a panel = module in js/ui/panels/ + an entry here. */
export const PANELS = [
  { id: 'health', zone: 'left' },
  { id: 'usage', zone: 'right' },
];
