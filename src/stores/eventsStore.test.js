import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getEventsActions, getEventsStore, resetEventsStoreForTests } from "./eventsStore";

function createLocalStorageStub() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: vi.fn((key, value) => data.set(key, String(value))),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  };
}

vi.stubGlobal("window", {
  localStorage: createLocalStorageStub(),
  navigator: { onLine: false },
});

beforeEach(() => {
  resetEventsStoreForTests();
  window.localStorage.clear();
  window.localStorage.setItem.mockClear();
});

afterAll(() => vi.unstubAllGlobals());

describe("eventsStore", () => {
  it("loads the existing event log and supports functional updates", () => {
    window.localStorage.setItem("mybishbash.event-log.v1", JSON.stringify([{ id: "one" }]));
    window.localStorage.setItem.mockClear();

    expect(getEventsStore().getState().events).toEqual([{ id: "one" }]);
    getEventsActions().setEvents((events) => [...events, { id: "two" }]);

    expect(getEventsStore().getState().events).toEqual([{ id: "one" }, { id: "two" }]);
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "mybishbash.event-log.v1",
      JSON.stringify([{ id: "one" }, { id: "two" }]),
    );
  });

  it("appends through the event service without a second event-log write", async () => {
    const event = { id: "event", event_type: "launcher_session_started", created_at: "2026-07-22T00:00:00.000Z" };

    await getEventsActions().appendEvent(event);

    expect(getEventsStore().getState().events).toEqual([event]);
    const eventLogWrites = window.localStorage.setItem.mock.calls.filter(([key]) => key === "mybishbash.event-log.v1");
    expect(eventLogWrites).toEqual([["mybishbash.event-log.v1", JSON.stringify([event])]]);
  });
});
