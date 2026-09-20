// Tracks the on-screen (software) keyboard height and exposes it to CSS as the
// `--kb-inset` custom property on <html>.
//
// Why this exists: on iOS Safari the software keyboard resizes only the *visual*
// viewport, not the *layout* viewport. That means CSS viewport units (vh, dvh,
// svh, lvh) do NOT shrink when the keyboard opens, so a full-height or
// bottom-anchored element (e.g. the .modal-backdrop bottom-sheet composer) keeps
// its full size and ends up partly hidden behind the keyboard — the "oversized
// because of the keyboard" bug. The default `interactive-widget=resizes-visual`
// behaviour cannot be fixed with CSS units alone, so we measure the gap with
// window.visualViewport and let CSS subtract it.
//
// The value is the difference between the layout-viewport bottom and the
// visual-viewport bottom, i.e. how much of the layout viewport the keyboard is
// covering. It is 0 when no keyboard is open, and stays 0 (property untouched,
// CSS falls back) when visualViewport is unsupported.

// Below this many pixels we treat the gap as noise (dynamic browser chrome,
// rounding) rather than a keyboard. Real software keyboards are far taller.
const KEYBOARD_THRESHOLD_PX = 90;

export function installKeyboardInsetTracking() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const viewport = window.visualViewport;
  const root = document.documentElement;
  if (!viewport || !root?.style) return;

  let frame = 0;

  const update = () => {
    frame = 0;
    const covered = window.innerHeight - viewport.height - viewport.offsetTop;
    const inset = covered > KEYBOARD_THRESHOLD_PX ? Math.round(covered) : 0;
    root.style.setProperty("--kb-inset", `${inset}px`);
  };

  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(update);
  };

  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", schedule);
  update();
}
