// MBB-26: behaviour-event upload is consent-gated and carries no free text.
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn(async () => ({ error: null }));
const from = vi.fn(() => ({ upsert }));
const getSession = vi.fn(async () => ({ data: { session: { user: { id: "acct-1" } } } }));

vi.mock("./lib/supabaseClient", () => ({ supabase: { from, auth: { getSession } } }));

const store = new Map();
vi.mock("./storage", () => ({
  getStorageItem: (k) => (store.has(k) ? store.get(k) : null),
  setStorageItem: (k, v) => store.set(k, v),
}));

const CONSENT_KEY = "mbb_analytics_consent_v1";
const QUEUE_KEY = "mybishbash.offline-event-queue.v1";

function setConsent(value) {
  const ls = new Map(value ? [[CONSENT_KEY, JSON.stringify({ value })]] : []);
  globalThis.window = {
    navigator: { onLine: true },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null) },
  };
}

const { processEventQueue, createEventRecord, toUploadRow } = await import("./eventLog.js");

function queueIdentifiableEvent() {
  const event = createEventRecord({
    event_type: "card_commitment_made",
    card_id: "legacy:my private words",
    bash_title: "Stop doomscrolling",
    card_text: "Stop doomscrolling",
    message_id: "m1",
    metadata: {
      cardKind: "commitment",
      reason: "my private reason",
      message: "free text",
      href: "https://example.com/x",
      packTitle: "A pack",
      decisionSource: "accept",
      frequency: "daily",
      timingWindows: ["morning"],
      dwell_ms: 1200,
    },
  });
  store.set(QUEUE_KEY, JSON.stringify([event]));
  return event;
}

beforeEach(() => {
  store.clear();
  upsert.mockClear();
  from.mockClear();
  getSession.mockClear();
});

describe("processEventQueue consent gate (G1)", () => {
  it("signed in + no consent: zero network calls, queue kept on-device", async () => {
    setConsent(null);
    queueIdentifiableEvent();
    await processEventQueue();
    expect(getSession).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(JSON.parse(store.get(QUEUE_KEY))).toHaveLength(1);
  });

  it("explicit decline: zero network calls", async () => {
    setConsent("denied");
    queueIdentifiableEvent();
    await processEventQueue();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("uploaded row shape (G3/G5)", () => {
  it("consent granted: payload has no free-text or identifying keys", async () => {
    setConsent("granted");
    queueIdentifiableEvent();
    await processEventQueue();
    expect(upsert).toHaveBeenCalledTimes(1);
    const [[row]] = upsert.mock.calls[0];
    const serialized = JSON.stringify(row);
    for (const banned of ["card_text", "card_title", "bash_title", "card_id", "bash_id", "message_id", "reason", "message", "href", "packTitle", "Stop doomscrolling", "private"]) {
      expect(serialized).not.toContain(banned);
    }
    expect(Object.keys(row).sort()).toEqual(
      ["action_taken", "app_id", "card_source", "created_at", "event_type", "id", "launcher_context", "metadata", "pack_id", "source_type", "target_app", "user_id"].sort(),
    );
    expect(row.user_id).toBe("acct-1");
    expect(row.metadata).toEqual({ decisionSource: "accept", frequency: "daily", timingWindows: ["morning"], dwell_ms: 1200, cardKind: "commitment" });
  });

  it("drops long strings and objects from allowed metadata keys", () => {
    const row = toUploadRow({ id: "1", metadata: { response: "x".repeat(200), phase: { a: 1 }, surface: "home" } });
    expect(row.metadata).toEqual({ surface: "home" });
  });
});
