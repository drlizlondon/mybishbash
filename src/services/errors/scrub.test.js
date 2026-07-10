import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_LENGTH,
  MAX_STACK_LENGTH,
  buildErrorReport,
  getErrorSignature,
  scrubText,
} from "./scrub.js";

const FAKE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4";

describe("scrubText", () => {
  it("redacts JWT-shaped tokens", () => {
    expect(scrubText(`auth failed for ${FAKE_JWT} today`)).toBe("auth failed for [jwt] today");
  });

  it("redacts email addresses", () => {
    expect(scrubText("user liz.zie+test@example.co.uk not found")).toBe("user [email] not found");
  });

  it("strips query strings and hashes but keeps the path", () => {
    expect(scrubText("failed to fetch /claim?code=SECRET123&ref=abc")).toBe(
      "failed to fetch /claim?[redacted]",
    );
    expect(scrubText("at https://app.example/page#access_token=xyz end")).toBe(
      "at https://app.example/page#[redacted] end",
    );
  });

  it("truncates to the requested length", () => {
    expect(scrubText("a".repeat(600), 500)).toHaveLength(500);
    expect(scrubText("short", 500)).toBe("short");
  });

  it("coerces non-string input safely", () => {
    expect(scrubText(undefined)).toBe("");
    expect(scrubText(null)).toBe("");
    expect(scrubText(42)).toBe("42");
  });
});

describe("buildErrorReport", () => {
  it("builds a scrubbed report from an Error", () => {
    const error = new Error(`boom for someone@example.com`);
    const report = buildErrorReport({
      error,
      kind: "window-error",
      release: "1.2.3",
      platform: "web",
      pathname: "/home",
      userAgent: "TestAgent/1.0",
    });
    expect(report.kind).toBe("window-error");
    expect(report.message).toBe("boom for [email]");
    expect(report.stack).toContain("Error");
    expect(report.stack.length).toBeLessThanOrEqual(MAX_STACK_LENGTH);
    expect(report.route).toBe("/home");
    expect(report.release).toBe("1.2.3");
  });

  it("never includes query strings or hashes in the route", () => {
    expect(buildErrorReport({ error: new Error("x"), kind: "k", pathname: "/claim?code=SECRET" }).route).toBe("/claim");
    expect(buildErrorReport({ error: new Error("x"), kind: "k", pathname: "/auth#token=abc" }).route).toBe("/auth");
  });

  it("handles non-Error inputs", () => {
    expect(buildErrorReport({ error: "string failure", kind: "k" }).message).toBe("string failure");
    expect(buildErrorReport({ error: undefined, kind: "k" }).message).toBe("unknown error");
    expect(buildErrorReport({ error: { weird: true }, kind: "k" }).message).toBe("[object Object]");
    expect(buildErrorReport({ error: null, kind: "k" }).message).toBe("unknown error");
  });

  it("truncates oversized messages", () => {
    const report = buildErrorReport({ error: new Error("x".repeat(2000)), kind: "k" });
    expect(report.message).toHaveLength(MAX_MESSAGE_LENGTH);
  });
});

describe("getErrorSignature", () => {
  it("is stable for identical errors and distinct for different ones", () => {
    const a1 = buildErrorReport({ error: new Error("same thing"), kind: "boundary" });
    const a2 = buildErrorReport({ error: new Error("same thing"), kind: "boundary" });
    const b = buildErrorReport({ error: new Error("different thing"), kind: "boundary" });
    expect(getErrorSignature(a1)).toBe(getErrorSignature(a2));
    expect(getErrorSignature(a1)).not.toBe(getErrorSignature(b));
  });

  it("distinguishes the same message across kinds", () => {
    const report = { message: "m", stack: "s" };
    expect(getErrorSignature({ ...report, kind: "boundary" })).not.toBe(
      getErrorSignature({ ...report, kind: "window-error" }),
    );
  });
});
