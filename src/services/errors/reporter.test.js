import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetReporterForTests,
  configureReporter,
  flushBufferedErrorReports,
  reportError,
} from "./reporter.js";

const SESSION = { user: { id: "user-123" } };

function setup({ transportResult = true, session = SESSION } = {}) {
  const transport = vi.fn(async () =>
    transportResult instanceof Error ? Promise.reject(transportResult) : transportResult,
  );
  const getSession = vi.fn(async () => session);
  configureReporter({ transport, getSession, isEnabled: () => true });
  return { transport, getSession };
}

async function settle() {
  // Let the async flush chain resolve.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  _resetReporterForTests();
});

describe("reportError delivery", () => {
  it("delivers a scrubbed row stamped with the session user id", async () => {
    const { transport } = setup();
    reportError(new Error("boom"), "boundary");
    await settle();

    expect(transport).toHaveBeenCalledTimes(1);
    const rows = transport.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe("user-123");
    expect(rows[0].kind).toBe("boundary");
    expect(rows[0].message).toBe("boom");
    expect(rows[0].occurred_at).toBeTruthy();
  });

  it("does nothing when disabled", async () => {
    const transport = vi.fn(async () => true);
    configureReporter({ transport, getSession: async () => SESSION, isEnabled: () => false });
    reportError(new Error("boom"), "boundary");
    await settle();
    expect(transport).not.toHaveBeenCalled();
  });

  it("drops errors originating from the reporter's own files", async () => {
    const { transport } = setup();
    const selfError = new Error("internal");
    selfError.stack = "Error: internal\n    at flush (src/services/errors/reporter.js:1:1)";
    reportError(selfError, "window-error");
    await settle();
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("dedupe and caps", () => {
  it("stops reporting a signature after 3 occurrences", async () => {
    const { transport } = setup();
    for (let i = 0; i < 6; i += 1) {
      reportError(new Error("same failure"), "boundary");
      await settle();
    }
    const totalRows = transport.mock.calls.flatMap(([rows]) => rows).length;
    expect(totalRows).toBe(3);
  });

  it("accepts at most 20 reports per page session", async () => {
    const { transport } = setup();
    for (let i = 0; i < 30; i += 1) {
      reportError(new Error(`distinct failure ${i}`), "boundary");
      await settle();
    }
    const totalRows = transport.mock.calls.flatMap(([rows]) => rows).length;
    expect(totalRows).toBe(20);
  });
});

describe("pre-auth buffering", () => {
  it("buffers without a session and flushes when one appears", async () => {
    let session = null;
    const transport = vi.fn(async () => true);
    configureReporter({ transport, getSession: async () => session, isEnabled: () => true });

    reportError(new Error("early failure"), "window-error");
    await settle();
    expect(transport).not.toHaveBeenCalled();

    session = SESSION;
    flushBufferedErrorReports();
    await settle();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0][0].user_id).toBe("user-123");
  });

  it("caps the pre-auth buffer at 10, dropping the oldest", async () => {
    let session = null;
    const transport = vi.fn(async () => true);
    configureReporter({ transport, getSession: async () => session, isEnabled: () => true });

    for (let i = 0; i < 15; i += 1) {
      reportError(new Error(`buffered ${i}`), "window-error");
    }
    await settle();

    session = SESSION;
    flushBufferedErrorReports();
    await settle();

    const rows = transport.mock.calls[0][0];
    expect(rows).toHaveLength(10);
    expect(rows[0].message).toBe("buffered 5");
    expect(rows.at(-1).message).toBe("buffered 14");
  });
});

describe("transport failure handling", () => {
  it("never throws when the transport rejects", async () => {
    setup({ transportResult: new Error("network down") });
    expect(() => reportError(new Error("boom"), "boundary")).not.toThrow();
    await settle();
  });

  it("keeps rows after one failure, drops them after a second consecutive failure", async () => {
    const transport = vi.fn(async () => false);
    configureReporter({ transport, getSession: async () => SESSION, isEnabled: () => true });

    reportError(new Error("boom"), "boundary");
    await settle();
    expect(transport).toHaveBeenCalledTimes(1);

    // Retry (e.g. via the online listener): second failure drops the buffer.
    flushBufferedErrorReports();
    await settle();
    expect(transport).toHaveBeenCalledTimes(2);

    // Buffer is now empty — nothing further to send.
    flushBufferedErrorReports();
    await settle();
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("recovers the failure counter after a successful delivery", async () => {
    let shouldFail = true;
    const transport = vi.fn(async () => !shouldFail);
    configureReporter({ transport, getSession: async () => SESSION, isEnabled: () => true });

    reportError(new Error("first"), "boundary");
    await settle();

    shouldFail = false;
    flushBufferedErrorReports();
    await settle();

    reportError(new Error("second"), "boundary");
    await settle();

    const lastRows = transport.mock.calls.at(-1)[0];
    expect(lastRows[0].message).toBe("second");
  });
});
