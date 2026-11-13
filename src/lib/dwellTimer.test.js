import { describe, expect, it } from "vitest";
import { createDwellTimer } from "./dwellTimer";

function harness() {
  let t = 0;
  const listeners = new Set();
  const doc = {
    visibilityState: "visible",
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  const setVisibility = (state) => {
    doc.visibilityState = state;
    listeners.forEach((fn) => fn());
  };
  const timer = createDwellTimer({ now: () => t, doc });
  return { timer, advance: (ms) => { t += ms; }, setVisibility };
}

describe("dwell timer", () => {
  it("excludes time the page is hidden: 2 s visible + 30 s hidden + 1 s visible is 3000 ms", () => {
    const { timer, advance, setVisibility } = harness();
    timer.start();
    advance(2000);
    setVisibility("hidden");
    advance(30000);
    setVisibility("visible");
    advance(1000);
    expect(timer.elapsedMs()).toBe(3000);
  });

  it("reads correctly while still hidden", () => {
    const { timer, advance, setVisibility } = harness();
    timer.start();
    advance(2000);
    setVisibility("hidden");
    advance(5000);
    expect(timer.elapsedMs()).toBe(2000);
  });

  it("records idle time over 60 s as null", () => {
    const { timer, advance } = harness();
    timer.start();
    advance(60000);
    expect(timer.elapsedMs()).toBe(60000);
    advance(1);
    expect(timer.elapsedMs()).toBeNull();
  });

  it("is null before start and after stop", () => {
    const { timer, advance } = harness();
    expect(timer.elapsedMs()).toBeNull();
    timer.start();
    advance(100);
    timer.stop();
    expect(timer.elapsedMs()).toBeNull();
  });
});
