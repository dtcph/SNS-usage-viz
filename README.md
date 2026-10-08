# Out of the Pull – a doomscrolling data visualisation

Interactive world map of people "affected" by doomscrolling. Vanilla HTML/CSS/JS (ES modules), no build step at runtime.
Desktop only. Part of the master's thesis *"Raus aus dem Sog"*.

## Run

```bash
npx serve .            # or: python -m http.server 8000
```

Open the printed address (ES modules need http, not `file://`).

## Interaction

1. Hover a country: name + population (age-filtered where data exists). Countries without data are dark grey, not clickable.
2. Click a country with data: zoom. ESC, a click outside the country, or the back button returns.
3. Zoomed: pointer in the left third opens **Health issues**, right third **Reasons for scrolling**, middle stays calm. The control bar has priority over the zones.
3b. The popups are column charts (count above, group below). Hovering a column fills the chosen country from the bottom up to that share (height-based) and counts up the percentage inside it.
4. Control bar: age chips (multi-select, "All" resets, at least one stays on), dark mode, EN / 한국어. "i" explains the assumptions.

## Structure

```
index.html, css/        base, theme-light, theme-dark, animations, map, panels, controls
js/config.js            every constant and placeholder (TODO_DATA marks stand-ins)
js/state.js             tiny store (get / set / subscribe)
js/data/                loader.js, population.js (live + snapshot), worldometer-parse.js, country-names.js
js/model/               calc.js (pure, no DOM), generations.js
js/ui/                  map, tooltip, panels (+ panels/<id>.js), controls, timeline, counter, i18n, ...
data/                   *.json (converted XLS), country-map.json, population-snapshot.json, countries-110m.json
i18n/                   en.json, ko.json
data-src/               the original Statista XLSX files
tools/                  one-off scripts (not part of the runtime)
vendor/d3-lite.js       d3-geo/selection/zoom/transition/scale/shape/interpolate + topojson-client, bundled once
```

New panel: add `js/ui/panels/<id>.js` (export `zone`, `create(card)` returning `{ render({ i18n, vm, fromZero }) }`), one entry in `PANELS` (config.js), and its strings in `i18n/*.json`.

## Updating data (tools)

```bash
cd tools && npm install
node xls-to-json.mjs ../data-src ../data     # XLSX -> data/*.json (files are found by their Statista id)
node build-country-map.mjs                    # ISO mapping; add spellings to EXTRA_NAMES when the console reports unmapped names
node build-population-snapshot.mjs --worldometer          # snapshot from Worldometer (Node has no CORS limit), or
node build-population-snapshot.mjs --worldbank pop.csv 2024
node check-calc.mjs                           # console check of the model with the real data
npm run vendor                                # only if the d3 bundle needs changing
```

Statista stores durations as `h.mm` (8.50 = 8 h 50 min). The converter restores the dropped trailing zero (`11.1` -> 11 h 10 min) and warns about impossible minutes (data 4, 2016, 13–19: `32.6`).

## Population

`js/data/population.js` tries Worldometer through a CORS proxy (`CORS_PROXY_URL_TEMPLATE` in config.js, timeout `POPULATION_FETCH_TIMEOUT_MS`) and falls back to `data/population-snapshot.json`. The footer shows which one is used. To use your own proxy, change the template (`{url}` is replaced by the encoded Worldometer address). `null` forces the snapshot.

## Constants (config.js)

| Constant | Meaning |
| --- | --- |
| `REFERENCE_YEAR`, `GENERATIONS` | Generations and their age ranges are derived from birth years |
| `DOOMSCROLL_THRESHOLD_MIN_PER_DAY` | "Affected" = social-media users at or above this daily time |
| `SOCIAL_MEDIA_USER_SHARE`, `INTERNET_PENETRATION_BY_COUNTRY` | Users per population (global, per-country override) |
| `GENERATION_POPULATION_SHARES(_BY_COUNTRY)`, `GENERATION_USER_PROPENSITY` | Age structure and user likelihood |
| `DEVICE_WEIGHTS`, `DATA6_SWAP_GENX_BOOMERS`, `GENERATION_SCREENTIME_PROXY` | Generation weighting from data 6 |
| `TEEN_SHARE(_BY_COUNTRY)`, `SCREENTIME_CATEGORY_DISTRIBUTION` | Teen projection for the health popup |
| `COUNT_UP_DURATION_MS`, `USAGE_REASONS_VISIBLE`, `ZOOM_*` | Display |

Motion lives in `css/animations.css` (`--anim-duration`, `--anim-easing` and per-purpose variables). The zoom reads the same variables, and `prefers-reduced-motion` shortens them to ~0.

## Model in short

- Users = population × user share, spread over generations by population share × propensity.
- A generation's mean daily time = the country's daily time (data 1, h.mm → minutes, ÷ 7) × its relative device screen time (data 6, population-weighted mean = 1).
- Individual times are assumed exponential: affected share = `exp(-threshold / mean)`.
- Reasons (data 3): percent × affected. Health (data 5): teens 10–19 = population × `TEEN_SHARE`, reduced to the overlap of ages 10–19 with the selected generations; teens are spread over weekend-screen-time categories by a lognormal model whose mean scales from France (data 4) and the country's social-media time.

## Known limits

- 110m geometry lacks Singapore and Hong Kong (listed in the console). Set `MAP_TOPOLOGY_URL` to a 50m file (`world-atlas/countries-50m.json`) to draw them.
- Data 1 excludes video time and covers internet users aged 16+; data 6 covers US adults only. Everything beyond that is an estimate, stated in the "i" card.
