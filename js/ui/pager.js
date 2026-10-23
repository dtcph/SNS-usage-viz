// Two full-height screens in a snapping scroll container. Screen 1 (globe) is locked against scrolling down (CSS `is-locked`:
// overflow hidden, so wheel, touchpad and keys do nothing and the globe's own wheel zoom is untouched). The arrow glides to
// screen 2; there normal scrolling is allowed and scrolling up (or the arrow) goes back.
// Screen 2's own info button and control bar fly in (class `is-in`, css/race.css) when the slide has FINISHED (end of the glide or the
// browser's `scrollend`), and fly out again as soon as the way back starts. Screen 1 is never touched, so its layout cannot change.
import { cubicBezier } from "./motion.js";

const GLIDE_MS = 900;
const ease = cubicBezier(0.65, 0, 0.35, 1);
const CTA_IDLE_MS = 6000; // screen 1; screen 2 waits twice as long

/**
 * @param {object} o
 * @param {HTMLElement} o.pager  scroll container
 * @param {HTMLElement[]} o.screens  [first, second]
 * @param {HTMLElement} o.down  arrow in screen 1
 * @param {HTMLElement} o.up    arrow in screen 2
 * @param {HTMLElement[]} [o.playBtns]  [screen 1 play button, screen 2 play button]; same idle animation
 * @param {HTMLElement[]} [o.infoBtns]  [screen 1 info button, screen 2 info button]; they share the arrows' idle animation
 * @param {(visible:boolean)=>void} o.onVisible  screen 2 is (partly) in view
 * @param {(on:boolean)=>void} [o.onFlyIn]  the fly-in elements of screen 2 are shown (true) or sent away (false)
 */
export function createPager({
  pager,
  screens: [first, second],
  down,
  up,
  infoBtns = [],
  playBtns = [],
  onVisible,
  onFlyIn = () => {},
}) {
  let anim = 0,
    timer = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const flyEls = [...second.querySelectorAll(".fly-top, .fly-bottom")];

  function fly(on) {
    if (pager.classList.contains("is-in") === on) return;
    pager.classList.toggle("is-in", on);
    pager.classList.add("is-flying"); // will-change only while something moves (removed on transitionend)
    onFlyIn(on);
  }
  flyEls.forEach((el) =>
    el.addEventListener("transitionend", (e) => {
      if (e.target === el && e.propertyName === "transform")
        pager.classList.remove("is-flying");
    }),
  );

  function apply(at) {
    pager.classList.toggle("is-locked", at === "first");
    first.inert = at === "second";
    second.inert = at === "first";
    fly(at === "second");
  }
  function settle() {
    const top = pager.scrollTop,
      h = pager.clientHeight;
    if (top <= 1) apply("first");
    else if (top >= h - 1) apply("second");
  }
  function glide(target) {
    if (anim) return;
    const from = pager.scrollTop,
      dist = target - from;
    if (!dist) return settle();
    first.inert = second.inert = false;
    if (target === 0) fly(false);
    const dur = reduced.matches ? 0 : GLIDE_MS;
    pager.classList.add("is-gliding"); // snapping off while we animate
    const start = performance.now();
    const step = (now) => {
      const p = dur ? Math.min(1, (now - start) / dur) : 1;
      pager.scrollTop = from + dist * ease(p);
      if (p < 1) {
        anim = requestAnimationFrame(step);
        return;
      }
      anim = 0;
      pager.classList.remove("is-gliding");
      settle(); // the slide is over: only now do the elements fly in
    };
    anim = requestAnimationFrame(step);
  }

  // Native scrolling (wheel up in screen 2): leaving screen 2 sends the elements away at once, arriving is detected by scrollend.
  const hasScrollEnd = "onscrollend" in window;
  pager.addEventListener(
    "scroll",
    () => {
      onVisible(pager.scrollTop > 1);
      if (anim) return;
      if (pager.scrollTop < pager.clientHeight - 2) fly(false);
      if (!hasScrollEnd) {
        clearTimeout(timer);
        timer = setTimeout(settle, 100);
      } // fallback for browsers without scrollend
    },
    { passive: true },
  );
  if (hasScrollEnd)
    pager.addEventListener("scrollend", () => {
      if (!anim) settle();
    });

  // Any clear upward scroll gesture in screen 2 goes back as one clean slide (a short flick would otherwise snap back down).
  // Horizontal gestures (chart scrubbing) are left alone.
  pager.addEventListener(
    "wheel",
    (e) => {
      if (
        pager.scrollTop < pager.clientHeight - 1 ||
        e.shiftKey ||
        e.deltaY > -6 ||
        Math.abs(e.deltaX) > Math.abs(e.deltaY)
      )
        return;
      e.preventDefault();
      glide(0);
    },
    { passive: false },
  );
  down.addEventListener("click", () => glide(pager.clientHeight));
  up.addEventListener("click", () => glide(0));
  document.addEventListener("keydown", (e) => {
    // Arrow up / Page up in screen 2 goes back; range sliders keep their arrows
    if (pager.scrollTop < 1 || anim || e.target.closest?.("input")) return;
    if (["ArrowUp", "PageUp", "Home"].includes(e.key)) {
      e.preventDefault();
      glide(0);
    }
  });
  window.addEventListener("resize", () => {
    // stay on the screen we are on
    if (!anim)
      pager.scrollTop =
        pager.scrollTop > pager.clientHeight / 2 ? pager.clientHeight : 0;
  });

  // CTA nudge: after a while without interaction the arrow of the current screen plays a wipe (css/race.css .is-cta); repeats while idle.
  let idleTimer = 0;
  const arm = () => {
    clearTimeout(idleTimer);
    if (reduced.matches) return;
    const onSecond = pager.scrollTop > pager.clientHeight / 2;
    idleTimer = setTimeout(() => {
      const zoomed = document.body.classList.contains("is-zoomed"); // screen 1's arrow is hidden while zoomed
      const btns = [
        onSecond ? up : down,
        infoBtns[onSecond ? 1 : 0],
        playBtns[onSecond ? 1 : 0],
      ].filter(
        (b) =>
          b &&
          !(b === down && zoomed) &&
          b.getAttribute("aria-expanded") !== "true", // not while its card is open
      );
      const playing = playBtns.some((b) => b?.dataset.mode === "pause"); // playback counts as interaction
      if (!anim && btns.length && !document.hidden && !playing) {
        for (const b of btns) {
          b.classList.remove("is-cta");
          void b.offsetWidth; // restart the animation
          b.classList.add("is-cta");
        }
      }
      arm(); // next run CTA_IDLE_MS after this one started, until the user interacts
    }, CTA_IDLE_MS);
  };
  const ctaBtns = [down, up, ...infoBtns, ...playBtns];
  // The info buttons' entry animation (css/animations.css) must run only once: the CTA animation temporarily replaces it, and
  // dropping .is-cta would otherwise start it again.
  for (const b of infoBtns) {
    const entry = b.getAnimations().find((a) => a.animationName === "enter");
    const done = () => b.classList.add("is-entered");
    if (entry)
      entry.finished.then(done, done); // also when cancelled (e.g. replaced by the CTA animation)
    else b.classList.add("is-entered");
  }
  for (const btn of ctaBtns)
    btn.addEventListener("animationend", (e) => {
      if (e.target !== btn) return;
      btn.classList.remove("is-cta");
    });
  const interact = () => {
    for (const b of ctaBtns) b.classList.remove("is-cta");
    arm();
  };
  for (const ev of [
    "pointerdown",
    "pointermove",
    "wheel",
    "keydown",
    "touchstart",
  ])
    document.addEventListener(ev, interact, { passive: true, capture: true });
  pager.addEventListener("scroll", interact, { passive: true });
  // Starting, pausing or finishing playback (data-mode on the play buttons) restarts the idle time.
  const modeWatch = new MutationObserver(interact);
  for (const b of playBtns)
    if (b)
      modeWatch.observe(b, {
        attributes: true,
        attributeFilter: ["data-mode"],
      });

  apply("first");
  arm();
}
