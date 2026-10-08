// Entry point: loads data, wires the store to the UI modules.
import { DEFAULT_LANG, LANGUAGES, GENERATIONS, REFERENCE_YEAR } from './config.js';
import { createStore, initialState } from './state.js';
import { loadAll } from './data/loader.js';
import { loadPopulation } from './data/population.js';
import { createModel, describeCountry } from './model/calc.js';
import { buildGenerations } from './model/generations.js';
import { createI18n, loadLang } from './ui/i18n.js';
import { createMap } from './ui/map.js';
import { createTooltip } from './ui/tooltip.js';
import { createLegend } from './ui/legend.js';
import { createControls } from './ui/controls.js';
import { createInfo } from './ui/info.js';
import { createTimeline } from './ui/timeline.js';
import { createHeadline } from './ui/headline.js';
import { createPanels } from './ui/panels.js';
import { initZones } from './ui/zones.js';

const $ = (id) => document.getElementById(id);
const stored = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode etc. */ } };

async function main() {
  const generations = buildGenerations(GENERATIONS, REFERENCE_YEAR);
  const lang = LANGUAGES.includes(stored('lang')) ? stored('lang') : DEFAULT_LANG;
  const theme = stored('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;

  const store = createStore(initialState(generations.map((g) => g.id), lang, theme));
  let i18n = createI18n(lang, await loadLang(lang).catch(() => ({})));
  i18n.apply();
  const status = $('status');
  const fail = (key, err) => { console.error(err); status.hidden = false; status.textContent = i18n.t(key); };

  let data;
  try { data = await loadAll(); } catch (err) { return fail('map.error', err); }
  const model = createModel(data.raw);

  // Population: map renders at once, numbers follow when live data or the snapshot has arrived.
  loadPopulation(data.index).then((population) => store.set({ population }));

  const tooltip = createTooltip($('tooltip'));
  const map = createMap({ svg: $('map'), topology: data.topology, index: data.index, model, store, getI18n: () => i18n, tooltip });
  const legend = createLegend($('legend'), { extent: map.extent });
  const timeline = createTimeline({ el: $('timeline'), series: data.raw.daily.series });
  const headline = createHeadline({ nameEl: $('headline-name'), lineEl: $('headline-line'), avgEl: $('headline-avg') });
  const panels = await createPanels({ container: $('panels'), store });
  initZones({ store });
  createInfo({ store, getI18n: () => i18n });

  async function setLang(next) {
    if (next === store.get().lang) return;
    try { i18n = createI18n(next, await loadLang(next)); } catch (err) { console.error(err); return; }
    remember('lang', next);
    i18n.apply();
    store.set({ lang: next });
  }
  createControls({ store, generations, getI18n: () => i18n, onLang: setLang });

  // ---- derived view ----
  function currentView() {
    const { country, population, ageGroups } = store.get();
    if (!country) return { vm: null, name: '' };
    const entry = data.index.byA3.get(country);
    const pop = population?.byA3[country];
    return {
      vm: pop != null ? describeCountry(model, country, pop, ageGroups) : null,
      name: i18n.countryName(entry?.a2, entry?.name),
    };
  }
  function renderCountry() {
    const { country, zone } = store.get();
    const { vm, name } = currentView();
    if (country) {
      headline.render({ i18n, vm, id: country, name });
      panels.update({ i18n, vm });
    }
    panels.setZone(zone, !!country);
  }

  function renderFooter() {
    const { population } = store.get();
    const key = !population ? 'footer.popLoading' : population.source === 'live' ? 'footer.popLive' : population.source === 'snapshot' ? 'footer.popSnapshot' : 'footer.popNone';
    $('footnote').textContent = i18n.t(key, { date: population?.date ? i18n.date(population.date) : '' });
  }

  store.subscribe((s, prev) => {
    document.body.classList.toggle('is-zoomed', !!s.country);
    if (s.theme !== prev.theme) { document.documentElement.dataset.theme = s.theme; remember('theme', s.theme); }
    if (s.lang !== prev.lang) { legend.render(i18n); timeline.render(i18n); renderFooter(); }
    if (s.population !== prev.population) renderFooter();
    if (s.country !== prev.country) headline.reset();
    if (s.highlight && (s.zone !== prev.zone || s.country !== prev.country || s.ageGroups !== prev.ageGroups)) store.set({ highlight: null });
    if (s.country !== prev.country || s.ageGroups !== prev.ageGroups || s.lang !== prev.lang || s.population !== prev.population || s.zone !== prev.zone) renderCountry();
  });

  legend.render(i18n); timeline.render(i18n); renderFooter();

  // ---- global input ----
  $('back').addEventListener('click', () => store.set({ country: null }));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (store.get().infoOpen) store.set({ infoOpen: false });
    else if (store.get().country) store.set({ country: null });
  });
  let resizeRaf = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => map.resize()); });
}

main().catch((err) => {
  console.error(err);
  const status = document.getElementById('status');
  status.hidden = false;
  status.textContent = String(err.message ?? err);
});
