// Entry point: loads data, wires the store to the UI modules.
import {
  DEFAULT_LANG,
  DOOMSCROLL_THRESHOLD_MIN_PER_DAY,
  LANGUAGES,
  GENERATIONS,
  REFERENCE_YEAR,
} from "./config.js";
import { createStore, initialState } from "./state.js";
import { loadAll } from "./data/loader.js";
import { loadPopulation } from "./data/population.js";
import {
  createModel,
  describeCountry,
  extentFor,
  worldAffected,
} from "./model/calc.js";
import { buildGenerations } from "./model/generations.js";
import { createI18n, loadLang } from "./ui/i18n.js";
import { createMap } from "./ui/map.js";
import { createTooltip } from "./ui/tooltip.js";
import { createLegend } from "./ui/legend.js";
import { createControls } from "./ui/controls.js";
import { createInfo } from "./ui/info.js";
import { createTimeline } from "./ui/timeline.js";
import { createHeadline } from "./ui/headline.js";
import { createPanels } from "./ui/panels.js";
import { initZones } from "./ui/zones.js";
import { createPager } from "./ui/pager.js";
import { createRaceInfo } from "./ui/race-info.js";
import { createRaceChart } from "./chart/race-chart.js";

const $ = (id) => document.getElementById(id);
const stored = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const remember = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. */
  }
};

async function main() {
  const generations = buildGenerations(GENERATIONS, REFERENCE_YEAR);
  const lang = LANGUAGES.includes(stored("lang"))
    ? stored("lang")
    : DEFAULT_LANG;
  const theme =
    stored("theme") ??
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;

  const store = createStore(
    initialState(
      generations.map((g) => g.id),
      lang,
      theme,
    ),
  );
  let i18n = createI18n(lang, await loadLang(lang).catch(() => ({})));
  i18n.apply();
  const status = $("status");
  const fail = (key, err) => {
    console.error(err);
    status.hidden = false;
    status.classList.remove("is-loading");
    status.textContent = i18n.t(key);
  };

  let data;
  try {
    data = await loadAll();
  } catch (err) {
    return fail("map.error", err);
  }
  const model = createModel(data.raw);

  // Population: map renders at once, numbers follow when live data or the snapshot has arrived.
  loadPopulation(data.index).then((population) => store.set({ population }));

  const tooltip = createTooltip($("tooltip"));
  let legend = null;
  const map = createMap({
    svg: $("map"),
    topology: data.topology,
    index: data.index,
    model,
    store,
    getI18n: () => i18n,
    tooltip,
    onHoverTime: (m) => legend?.mark(m),
  });
  legend = createLegend($("legend"), {
    extentFor: (year) => extentFor(model, year),
  });
  const timeline = createTimeline({
    el: $("timeline"),
    series: model.yearSeries,
    store,
    getI18n: () => i18n,
    totalFor: (year) =>
      worldAffected(
        model,
        store.get().population.byA3,
        store.get().ageGroups,
        year,
      ),
  });
  const headline = createHeadline({
    nameEl: $("headline-name"),
    statsEl: $("headline-stats"),
  });
  const panels = await createPanels({ container: $("panels"), store });
  initZones({ store });
  createInfo({ store, getI18n: () => i18n });

  // Screen 2: animated line chart. Its info button and control row are their own instances (screen 1 stays untouched).
  const race = createRaceChart({
    root: $("screen-chart"),
    usage: data.raw.usage,
    getI18n: () => i18n,
  });
  const raceInfo = createRaceInfo({
    btn: $("info-btn-2"),
    panel: $("info-panel-2"),
    list: $("race-info-list"),
    getI18n: () => i18n,
  });
  createPager({
    pager: $("pager"),
    screens: [$("screen-map"), $("screen-chart")],
    down: $("pager-down"),
    up: $("pager-up"),
    onVisible: race.setActive,
    onFlyIn: (on) => {
      if (!on) raceInfo.close();
    },
  });

  async function setLang(next) {
    if (next === store.get().lang) return;
    try {
      i18n = createI18n(next, await loadLang(next));
    } catch (err) {
      console.error(err);
      return;
    }
    remember("lang", next);
    i18n.apply();
    store.set({ lang: next });
    race.refresh();
    raceInfo.render();
  }
  createControls({ store, generations, getI18n: () => i18n, onLang: setLang });

  // ---- derived view ----
  function currentView() {
    const { country, population, ageGroups } = store.get();
    if (!country) return { vm: null, name: "" };
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

  function renderDefinition() {
    $("definition").textContent = i18n.t("app.definition", {
      duration: i18n.minutes(DOOMSCROLL_THRESHOLD_MIN_PER_DAY),
    });
  }

  store.subscribe((s, prev) => {
    document.body.classList.toggle("is-zoomed", !!s.country);
    if (s.theme !== prev.theme) {
      document.documentElement.dataset.theme = s.theme;
      remember("theme", s.theme);
    }
    if (s.lang !== prev.lang || s.year !== prev.year)
      legend.render(i18n, s.year, model.latestYear);
    if (s.lang !== prev.lang) renderDefinition();
    if (s.country !== prev.country) headline.reset();
    if (
      s.highlight &&
      (s.zone !== prev.zone ||
        s.country !== prev.country ||
        s.ageGroups !== prev.ageGroups)
    )
      store.set({ highlight: null });
    if (
      s.country !== prev.country ||
      s.ageGroups !== prev.ageGroups ||
      s.lang !== prev.lang ||
      s.population !== prev.population ||
      s.zone !== prev.zone
    )
      renderCountry();
  });

  legend.render(i18n, null, model.latestYear);
  renderDefinition();

  status.hidden = true; // loaded

  // ---- global input ----
  $("back").addEventListener("click", () => store.set({ country: null }));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (store.get().infoOpen) store.set({ infoOpen: false });
    else if (store.get().country) store.set({ country: null });
  });
  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => map.resize());
  });
}

main().catch((err) => {
  console.error(err);
  const status = document.getElementById("status");
  status.hidden = false;
  status.classList.remove("is-loading");
  status.textContent = String(err.message ?? err);
});
