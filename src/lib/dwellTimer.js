import { useCallback, useEffect, useRef } from "react";
import { MAX_DWELL_MS } from "./readTime";

function defaultNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Counts how long a card has been on screen, pausing while the page is hidden.
 * `now` and `doc` are injectable so tests can drive time and visibility.
 */
export function createDwellTimer({
  now = defaultNow,
  doc = typeof document !== "undefined" ? document : null,
} = {}) {
  let accumulated = 0;
  let segmentStart = null;
  let started = false;

  const isHidden = () => doc?.visibilityState === "hidden";

  function closeSegment() {
    if (segmentStart !== null) {
      accumulated += Math.max(0, now() - segmentStart);
      segmentStart = null;
    }
  }

  function onVisibilityChange() {
    if (!started) return;
    if (isHidden()) closeSegment();
    else if (segmentStart === null) segmentStart = now();
  }

  return {
    start() {
      accumulated = 0;
      started = true;
      segmentStart = isHidden() ? null : now();
      doc?.addEventListener?.("visibilitychange", onVisibilityChange);
    },
    stop() {
      started = false;
      segmentStart = null;
      doc?.removeEventListener?.("visibilitychange", onVisibilityChange);
    },
    /** Visible milliseconds so far; null when not started or past MAX_DWELL_MS (idle). */
    elapsedMs() {
      if (!started) return null;
      const total = accumulated + (segmentStart !== null && !isHidden() ? Math.max(0, now() - segmentStart) : 0);
      if (total > MAX_DWELL_MS) return null;
      return Math.round(total);
    },
  };
}

/**
 * React hook: restarts the timer whenever `resetKey` changes. A falsy key
 * means nothing is on screen, so elapsed time is null. Returns a getter.
 */
export function useDwellTimer(resetKey) {
  const timerRef = useRef(null);
  useEffect(() => {
    if (!resetKey) {
      timerRef.current = null;
      return undefined;
    }
    const timer = createDwellTimer();
    timer.start();
    timerRef.current = timer;
    return () => timer.stop();
  }, [resetKey]);
  return useCallback(() => (timerRef.current ? timerRef.current.elapsedMs() : null), []);
}
