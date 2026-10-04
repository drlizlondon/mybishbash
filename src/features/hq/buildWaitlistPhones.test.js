import { describe, expect, it } from "vitest";
import { buildWaitlistPhones } from "./HQPanel";

describe("buildWaitlistPhones", () => {
  it("counts iPhone, Android and Other, folding unknown or missing into Other", () => {
    const rows = buildWaitlistPhones([
      { phone_os: "iPhone" },
      { phone_os: "iphone " },
      { phone_os: "Android" },
      { phone_os: "Other" },
      { phone_os: "Windows" },
      {},
    ]);
    expect(rows).toEqual([
      { label: "iPhone", count: 2 },
      { label: "Android", count: 1 },
      { label: "Other", count: 3 },
    ]);
  });

  it("returns zero counts for an empty waitlist", () => {
    expect(buildWaitlistPhones()).toEqual([
      { label: "iPhone", count: 0 },
      { label: "Android", count: 0 },
      { label: "Other", count: 0 },
    ]);
  });
});
