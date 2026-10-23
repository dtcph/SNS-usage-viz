// Intro card of screen 1: a short introduction to the site. Opens on hover/focus, click pins it.
import {
  DOOMSCROLL_THRESHOLD_MIN_PER_DAY,
  REFERENCE_YEAR,
  SOCIAL_MEDIA_USER_SHARE,
} from "../config.js";

export function createInfo({ store, getI18n }) {
  const btn = document.getElementById("info-btn");
  const panel = document.getElementById("info-panel");
  const list = document.getElementById("info-list");

  function render() {
    const i18n = getI18n();
    list.replaceChildren(
      ...i18n.list("info.items").map((tpl) => {
        const li = document.createElement("li");
        li.textContent = tpl.replace(
          /\{(\w+)\}/g,
          (_, k) =>
            ({
              threshold: i18n.minutes(DOOMSCROLL_THRESHOLD_MIN_PER_DAY),
              share: i18n.percent(SOCIAL_MEDIA_USER_SHARE),
              year: String(REFERENCE_YEAR),
            })[k] ?? `{${k}}`,
        );
        return li;
      }),
    );
  }
  // Opens on hover or keyboard focus; click pins it open (touch). Short close delay lets the pointer travel from button to card.
  let pinned = false,
    hovering = false,
    timer = 0;
  const sync = () => {
    if (store.get().infoOpen !== (pinned || hovering))
      store.set({ infoOpen: pinned || hovering });
  };
  const hover = (on) => {
    clearTimeout(timer);
    if (on) {
      hovering = true;
      sync();
    } else
      timer = setTimeout(() => {
        hovering = false;
        sync();
      }, 120);
  };
  for (const el of [btn, panel]) {
    el.addEventListener("pointerenter", () => hover(true));
    el.addEventListener("pointerleave", () => hover(false));
  }
  btn.addEventListener("focus", () => hover(true));
  btn.addEventListener("blur", () => hover(false));
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    pinned = !pinned;
    sync();
  });
  document.addEventListener("click", (e) => {
    // click outside closes
    if (store.get().infoOpen && !e.target.closest("#info-panel")) {
      pinned = hovering = false;
      sync();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      pinned = hovering = false;
      sync();
    }
  });
  store.subscribe((s, prev) => {
    if (s.infoOpen !== prev.infoOpen) {
      if (!s.infoOpen) {
        pinned = hovering = false;
      }
      panel.hidden = !s.infoOpen;
      document.body.classList.toggle("is-info-open", s.infoOpen);
      btn.setAttribute("aria-expanded", String(s.infoOpen));
    }
    if (s.lang !== prev.lang) render();
  });
  render();
}
