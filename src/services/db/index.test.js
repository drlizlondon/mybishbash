// Phase 5 commit 1 — services/db unit tests.
//
// Runs against fake-indexeddb (loaded by the `fake-indexeddb/auto` setup file
// in vitest.config.js), which is a spec-compliant in-process IndexedDB. Every
// test starts from a deleted database so ordering between files cannot leak.

import { beforeEach, afterEach, describe, expect, it } from "vitest";

import {
  DB_NAME,
  DB_VERSION,
  KV_STORE,
  META_STORE,
  closeDb,
  deleteDb,
  flushWrites,
  isIndexedDbAvailable,
  kvDelete,
  kvGet,
  kvGetAll,
  kvPut,
  metaGet,
  metaPut,
  openDb,
  pendingWriteKeyCount,
} from "./index.js";

beforeEach(async () => {
  await deleteDb();
});

afterEach(async () => {
  await flushWrites();
  await closeDb();
});

describe("environment", () => {
  it("reports IndexedDB as available under the test setup", () => {
    expect(isIndexedDbAvailable()).toBe(true);
  });
});

describe("openDb / upgrade path", () => {
  it("creates both object stores at version 1", async () => {
    const db = await openDb();
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    expect(db.objectStoreNames.contains(KV_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(META_STORE)).toBe(true);
  });

  it("returns the same cached connection to concurrent callers", async () => {
    const [a, b] = await Promise.all([openDb(), openDb()]);
    expect(a).toBe(b);
  });

  it("replays the upgrade from version 0 after the database is deleted", async () => {
    await kvPut("k", "v");
    await flushWrites();
    await deleteDb();

    const db = await openDb();
    expect(db.objectStoreNames.contains(KV_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(META_STORE)).toBe(true);
    expect(await kvGet("k")).toBeNull();
  });

  it("reopens after closeDb", async () => {
    await kvPut("persisted", "yes");
    await flushWrites();
    await closeDb();
    expect(await kvGet("persisted")).toBe("yes");
  });
});

describe("kv CRUD", () => {
  it("returns null for a missing key", async () => {
    expect(await kvGet("nope")).toBeNull();
  });

  it("round-trips a value", async () => {
    await kvPut("mybishbash.cards.v1", '[{"id":"c1"}]');
    expect(await kvGet("mybishbash.cards.v1")).toBe('[{"id":"c1"}]');
  });

  it("overwrites an existing key", async () => {
    await kvPut("k", "first");
    await kvPut("k", "second");
    expect(await kvGet("k")).toBe("second");
  });

  it("stores values as strings, preserving the localStorage contract", async () => {
    await kvPut("bool", true);
    await kvPut("num", 7);
    expect(await kvGet("bool")).toBe("true");
    expect(await kvGet("num")).toBe("7");
  });

  it("preserves an empty string rather than collapsing it to null", async () => {
    await kvPut("empty", "");
    expect(await kvGet("empty")).toBe("");
  });

  it("deletes a key", async () => {
    await kvPut("k", "v");
    await kvDelete("k");
    expect(await kvGet("k")).toBeNull();
  });

  it("deleting an absent key is a no-op", async () => {
    await expect(kvDelete("never-existed")).resolves.not.toThrow();
    expect(await kvGet("never-existed")).toBeNull();
  });

  it("kvGetAll returns every entry as a Map", async () => {
    await kvPut("a", "1");
    await kvPut("b", "2");
    await kvPut("c", "3");
    await flushWrites();

    const all = await kvGetAll();
    expect(all).toBeInstanceOf(Map);
    expect(all.size).toBe(3);
    expect(all.get("a")).toBe("1");
    expect(all.get("b")).toBe("2");
    expect(all.get("c")).toBe("3");
  });

  it("kvGetAll on an empty store returns an empty Map", async () => {
    const all = await kvGetAll();
    expect(all.size).toBe(0);
  });

  it("kvGetAll excludes deleted keys", async () => {
    await kvPut("a", "1");
    await kvPut("b", "2");
    await kvDelete("a");
    await flushWrites();

    const all = await kvGetAll();
    expect(Array.from(all.keys())).toEqual(["b"]);
  });
});

// The tests below are deliberately split into two groups.
//
// "fire-and-forget write behaviour" asserts the contract storage.js will rely
// on (last write wins, deletes and puts interleave correctly). These pass with
// or without the per-key chain — verified by mutation — because IndexedDB
// itself orders same-scope readwrite transactions by creation order. They are
// behavioural coverage, NOT a proof of the chain; labelling them as such would
// be the vacuous-guardrail mistake Phase 4c caught.
//
// "write-chain observability" is the group that actually fails when the chain
// is removed, and it covers the chain's real job: making unawaited writes
// awaitable.
describe("fire-and-forget write behaviour", () => {
  it("last write wins when puts to one key are interleaved without awaiting", async () => {
    // Fire-and-forget, exactly as storage.js will: no await between calls.
    void kvPut("ordered", "1");
    void kvPut("ordered", "2");
    void kvPut("ordered", "3");
    await flushWrites();

    expect(await kvGet("ordered")).toBe("3");
  });

  it("holds ordering across a longer unawaited burst", async () => {
    for (let index = 0; index < 25; index += 1) void kvPut("burst", String(index));
    await flushWrites();

    expect(await kvGet("burst")).toBe("24");
  });

  it("orders a delete after an earlier unawaited put to the same key", async () => {
    void kvPut("doomed", "value");
    void kvDelete("doomed");
    await flushWrites();

    expect(await kvGet("doomed")).toBeNull();
  });

  it("orders a put after an earlier unawaited delete to the same key", async () => {
    await kvPut("revived", "old");
    void kvDelete("revived");
    void kvPut("revived", "new");
    await flushWrites();

    expect(await kvGet("revived")).toBe("new");
  });

  it("keeps different keys independent", async () => {
    void kvPut("x", "x1");
    void kvPut("y", "y1");
    void kvPut("x", "x2");
    await flushWrites();

    expect(await kvGet("x")).toBe("x2");
    expect(await kvGet("y")).toBe("y1");
  });

});

describe("write-chain observability", () => {
  it("registers an unawaited kvPut as in-flight before it lands", async () => {
    // Without the chain there is nothing to observe and this reads 0 — this
    // assertion is what fails if chainWrite is bypassed.
    void kvPut("tracked", "v");
    expect(pendingWriteKeyCount()).toBe(1);

    await flushWrites();
    expect(pendingWriteKeyCount()).toBe(0);
    expect(await kvGet("tracked")).toBe("v");
  });

  it("registers an unawaited kvDelete as in-flight", async () => {
    await kvPut("doomed-tracked", "v");
    void kvDelete("doomed-tracked");
    expect(pendingWriteKeyCount()).toBe(1);

    await flushWrites();
    expect(pendingWriteKeyCount()).toBe(0);
  });

  it("registers unawaited metaPut as in-flight under its own namespace", async () => {
    void kvPut("collide", "kv");
    void metaPut("collide", { from: "meta" });
    expect(pendingWriteKeyCount()).toBe(2);

    await flushWrites();
    expect(pendingWriteKeyCount()).toBe(0);
  });

  it("collapses repeated writes to one key into a single chain entry", async () => {
    void kvPut("one-key", "1");
    void kvPut("one-key", "2");
    void kvPut("one-key", "3");
    expect(pendingWriteKeyCount()).toBe(1);

    await flushWrites();
    expect(pendingWriteKeyCount()).toBe(0);
  });

  it("drains its bookkeeping so the map does not grow unbounded", async () => {
    for (let index = 0; index < 10; index += 1) void kvPut(`key-${index}`, "v");
    expect(pendingWriteKeyCount()).toBe(10);

    await flushWrites();
    expect(pendingWriteKeyCount()).toBe(0);
  });

  it("flushWrites resolves when there is nothing queued", async () => {
    expect(pendingWriteKeyCount()).toBe(0);
    await expect(flushWrites()).resolves.toBeUndefined();
  });
});

describe("meta store", () => {
  it("returns null for a missing meta key", async () => {
    expect(await metaGet("migratedFromLocalStorage")).toBeNull();
  });

  it("round-trips a structured meta value", async () => {
    const record = { at: "2026-07-28T00:00:00.000Z", appVersion: "0.1.0" };
    await metaPut("migratedFromLocalStorage", record);
    expect(await metaGet("migratedFromLocalStorage")).toEqual(record);
  });

  it("keeps meta separate from kv under the same key name", async () => {
    await kvPut("shared-name", "kv-value");
    await metaPut("shared-name", { from: "meta" });
    await flushWrites();

    expect(await kvGet("shared-name")).toBe("kv-value");
    expect(await metaGet("shared-name")).toEqual({ from: "meta" });
    const all = await kvGetAll();
    expect(all.size).toBe(1);
  });

  it("orders interleaved meta writes to one key", async () => {
    void metaPut("flag", { n: 1 });
    void metaPut("flag", { n: 2 });
    await flushWrites();

    expect(await metaGet("flag")).toEqual({ n: 2 });
  });
});

describe("deleteDb", () => {
  it("removes both stores' contents", async () => {
    await kvPut("k", "v");
    await metaPut("m", { a: 1 });
    await flushWrites();

    await deleteDb();

    expect(await kvGet("k")).toBeNull();
    expect(await metaGet("m")).toBeNull();
  });

  it("is safe to call twice", async () => {
    await deleteDb();
    await expect(deleteDb()).resolves.toBeUndefined();
  });
});
