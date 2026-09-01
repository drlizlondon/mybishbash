import { describe, expect, it } from "vitest";
import {
  readSyncV2PreflightControls,
  resolveSyncV2Assignment,
  selectSyncV2Transport,
  SYNC_V2_DIAGNOSTIC_MODE_KEY,
  SYNC_V2_E2E_TRANSPORT_KEY,
} from "./syncV2Assignment.js";

const validBlobAssignment = Object.freeze({
  mode: "blob",
  readAuthority: "blob",
  audience: "catch-all-blob",
  configGeneration: "7",
  ownerOverrideGeneration: null,
  rollbackGeneration: null,
  syncProtocolVersion: 1,
  entitySchemaVersion: 1,
  reason: "matched_rule",
});

function resolve(overrides = {}) {
  return resolveSyncV2Assignment({
    hasClient: true,
    hasSession: true,
    assignment: validBlobAssignment,
    ...overrides,
  });
}

describe("Preflight Commit 0 assignment resolution", () => {
  it.each([
    [{ hasClient: false }, "missing_client"],
    [{ hasSession: false }, "missing_session"],
    [{ rpcError: new Error("unavailable") }, "assignment_rpc_error"],
    [{ assignment: null }, "malformed_assignment"],
    [{ assignment: [] }, "malformed_assignment"],
    [{ assignment: {} }, "malformed_assignment"],
  ])("fails closed to blob for %j", (overrides, reason) => {
    expect(resolve(overrides)).toMatchObject({
      mode: "blob",
      readAuthority: "blob",
      reason,
      serverAssignmentValid: false,
    });
  });

  it.each([
    { mode: "entities", readAuthority: "entities" },
    { mode: "shadow" },
    { mode: "paused" },
    { mode: "unknown" },
    { readAuthority: "entities" },
    { syncProtocolVersion: 2 },
    { entitySchemaVersion: 2 },
    { configGeneration: "-1" },
    { configGeneration: "01" },
    { configGeneration: 1.5 },
    { ownerOverrideGeneration: "bad" },
    { rollbackGeneration: "bad" },
  ])("rejects a malformed or non-blob server contract: %j", (change) => {
    const assignment = { ...validBlobAssignment, ...change };
    expect(resolve({ assignment })).toMatchObject({
      mode: "blob",
      readAuthority: "blob",
      reason: "malformed_assignment",
      serverAssignmentValid: false,
    });
  });

  it("accepts only a complete server blob assignment", () => {
    expect(resolve()).toEqual({ ...validBlobAssignment, serverAssignmentValid: true });
  });

  it("rejects a generation older than the durable minimum", () => {
    expect(resolve({ minimumConfigGeneration: "8" })).toMatchObject({
      mode: "blob",
      readAuthority: "blob",
      configGeneration: "8",
      reason: "stale_assignment",
      serverAssignmentValid: false,
    });
  });

  it.each([
    { rpcError: new Error("offline") },
    { assignment: null },
    { minimumConfigGeneration: "8" },
    { assignment: { ...validBlobAssignment, mode: "entities", readAuthority: "entities" } },
  ])("never downgrades prior entity authority after failure: %j", (overrides) => {
    expect(resolve({ priorReadAuthority: "entities", ...overrides })).toMatchObject({
      mode: "paused",
      readAuthority: "entities",
      serverAssignmentValid: false,
    });
  });

  it("allows the device diagnostic to pause but keeps server read authority", () => {
    expect(resolve({ diagnosticPause: true })).toMatchObject({
      mode: "paused",
      readAuthority: "blob",
      reason: "device_diagnostic_pause",
      serverAssignmentValid: true,
    });
  });
});

describe("device-local Preflight Commit 0 controls", () => {
  it("recognises only the exact pause and scripted-transport values", () => {
    const values = new Map([
      [SYNC_V2_DIAGNOSTIC_MODE_KEY, "paused"],
      [SYNC_V2_E2E_TRANSPORT_KEY, "scripted"],
    ]);
    expect(readSyncV2PreflightControls({ getItem: (key) => values.get(key) ?? null })).toEqual({
      diagnosticPause: true,
      scriptedTransportRequested: true,
    });

    values.set(SYNC_V2_DIAGNOSTIC_MODE_KEY, "entities");
    values.set(SYNC_V2_E2E_TRANSPORT_KEY, "hosted");
    expect(readSyncV2PreflightControls({ getItem: (key) => values.get(key) ?? null })).toEqual({
      diagnosticPause: false,
      scriptedTransportRequested: false,
    });
  });

  it("fails closed when device storage is inaccessible", () => {
    expect(
      readSyncV2PreflightControls({
        getItem() {
          throw new Error("blocked");
        },
      }),
    ).toEqual({ diagnosticPause: false, scriptedTransportRequested: false });
  });

  it.each([
    {},
    { scriptedTransportRequested: true },
    { scriptedTransportRequested: true, e2eAuthMode: true },
    {
      scriptedTransportRequested: true,
      e2eAuthMode: true,
      testBuildTransportCapability: true,
      hasRealServerAssignment: true,
    },
  ])("does not select the scripted transport without every safe gate: %j", (input) => {
    expect(selectSyncV2Transport(input)).toBe("server");
  });

  it("selects the scripted transport only for isolated E2E use", () => {
    expect(
      selectSyncV2Transport({
        scriptedTransportRequested: true,
        e2eAuthMode: true,
        testBuildTransportCapability: true,
        hasRealServerAssignment: false,
      }),
    ).toBe("scripted");
  });
});
