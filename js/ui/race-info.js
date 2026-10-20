// Info button + card of the chart screen. Same look as screen 1's (shared .info-btn / .info-panel styles), but the card opens on hover
// or keyboard focus (click toggles it for touch). It is independent of the store's infoOpen, which belongs to screen 1.
export function createRaceInfo({ btn, panel, list, getI18n }) {
  let pinned = false,
    hovering = false,
    timer = 0;

  function render() {
    list.replaceChildren(
      ...getI18n()
        .list("race.info.items")
        .map((text) => {
          const li = document.createElement("li");
          li.textContent = text;
          return li;
        }),
    );
  }
  const open = (on) => {
    panel.hidden = !on;
    btn.setAttribute("aria-expanded", String(on));
  };
  const sync = () => open(pinned || hovering);
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

  btn.addEventListener("pointerenter", () => hover(true));
  btn.addEventListener("pointerleave", () => hover(false));
  panel.addEventListener("pointerenter", () => hover(true));
  panel.addEventListener("pointerleave", () => hover(false));
  btn.addEventListener("focus", () => hover(true));
  btn.addEventListener("blur", () => hover(false));
  btn.addEventListener("click", () => {
    pinned = !pinned;
    sync();
  });
  document.addEventListener("click", (e) => {
    if (pinned && !e.target.closest("#info-panel-2, #info-btn-2")) {
      pinned = false;
      sync();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (pinned || hovering)) {
      pinned = hovering = false;
      sync();
    }
  });

  render();
  return {
    render,
    close() {
      pinned = hovering = false;
      clearTimeout(timer);
      open(false);
    },
  };
}
