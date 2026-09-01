export const SYNC_V2_PROTOCOL_VERSION = 1;
export const SYNC_V2_ENTITY_SCHEMA_VERSION = 1;

// Device-local controls only. Neither key is part of SHARED_STORAGE_KEYS and
// neither is read by production application code in Preflight Commit 0.
export const SYNC_V2_DIAGNOSTIC_MODE_KEY = "mybishbash.sync-v2-diagnostic.v1";
export const SYNC_V2_E2E_TRANSPORT_KEY = "mybishbash.sync-v2-e2e-transport.v1";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeGeneration(value) {
  if (typeof value === "bigint") return value >= 0n ? value.toString() : null;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) return null;

  try {
    return BigInt(value).toString();
  } catch {
    return null;
  }
}

function normalizeNullableGeneration(value) {
  return value === null ? null : normalizeGeneration(value);
}

function failClosed(reason, priorReadAuthority, minimumConfigGeneration) {
  const preserveEntities = priorReadAuthority === "entities";
  return {
    mode: preserveEntities ? "paused" : "blob",
    readAuthority: preserveEntities ? "entities" : "blob",
    audience: "preflight-client-fallback",
    configGeneration: normalizeGeneration(minimumConfigGeneration) ?? "0",
    ownerOverrideGeneration: null,
    rollbackGeneration: null,
    syncProtocolVersion: SYNC_V2_PROTOCOL_VERSION,
    entitySchemaVersion: SYNC_V2_ENTITY_SCHEMA_VERSION,
    reason,
    serverAssignmentValid: false,
  };
}

function parseBlobAssignment(assignment) {
  if (!isPlainObject(assignment)) return null;
  if (assignment.mode !== "blob" || assignment.readAuthority !== "blob") return null;
  if (assignment.syncProtocolVersion !== SYNC_V2_PROTOCOL_VERSION) return null;
  if (assignment.entitySchemaVersion !== SYNC_V2_ENTITY_SCHEMA_VERSION) return null;
  if (typeof assignment.audience !== "string" || assignment.audience.trim() === "") return null;
  if (typeof assignment.reason !== "string" || assignment.reason.trim() === "") return null;

  const configGeneration = normalizeGeneration(assignment.configGeneration);
  const ownerOverrideGeneration = normalizeNullableGeneration(assignment.ownerOverrideGeneration);
  const rollbackGeneration = normalizeNullableGeneration(assignment.rollbackGeneration);
  if (configGeneration === null) return null;
  if (assignment.ownerOverrideGeneration !== null && ownerOverrideGeneration === null) return null;
  if (assignment.rollbackGeneration !== null && rollbackGeneration === null) return null;

  return {
    mode: "blob",
    readAuthority: "blob",
    audience: assignment.audience,
    configGeneration,
    ownerOverrideGeneration,
    rollbackGeneration,
    syncProtocolVersion: SYNC_V2_PROTOCOL_VERSION,
    entitySchemaVersion: SYNC_V2_ENTITY_SCHEMA_VERSION,
    reason: assignment.reason,
    serverAssignmentValid: true,
  };
}

/**
 * Resolve the Preflight Commit 0 assignment without ever treating client input
 * as authority. Server responses are blob-only in this commit. If a later
 * client has already recorded entity authority, any failure preserves it in a
 * paused state instead of silently hydrating a stale blob.
 */
export function resolveSyncV2Assignment({
  hasClient = false,
  hasSession = false,
  assignment = null,
  rpcError = null,
  minimumConfigGeneration = "0",
  priorReadAuthority = "blob",
  diagnosticPause = false,
} = {}) {
  let resolved;

  if (!hasClient) {
    resolved = failClosed("missing_client", priorReadAuthority, minimumConfigGeneration);
  } else if (!hasSession) {
    resolved = failClosed("missing_session", priorReadAuthority, minimumConfigGeneration);
  } else if (rpcError) {
    resolved = failClosed("assignment_rpc_error", priorReadAuthority, minimumConfigGeneration);
  } else {
    resolved = parseBlobAssignment(assignment);
    if (!resolved) {
      resolved = failClosed("malformed_assignment", priorReadAuthority, minimumConfigGeneration);
    } else {
      const minimum = normalizeGeneration(minimumConfigGeneration);
      if (minimum === null || BigInt(resolved.configGeneration) < BigInt(minimum)) {
        resolved = failClosed("stale_assignment", priorReadAuthority, minimumConfigGeneration);
      }
    }
  }

  if (diagnosticPause === true) {
    return {
      ...resolved,
      mode: "paused",
      reason: "device_diagnostic_pause",
    };
  }

  return resolved;
}

export function readSyncV2PreflightControls(storage) {
  try {
    return {
      diagnosticPause: storage?.getItem?.(SYNC_V2_DIAGNOSTIC_MODE_KEY) === "paused",
      scriptedTransportRequested:
        storage?.getItem?.(SYNC_V2_E2E_TRANSPORT_KEY) === "scripted",
    };
  } catch {
    return { diagnosticPause: false, scriptedTransportRequested: false };
  }
}

export function selectSyncV2Transport({
  scriptedTransportRequested = false,
  e2eAuthMode = false,
  testBuildTransportCapability = false,
  hasRealServerAssignment = false,
} = {}) {
  if (
    scriptedTransportRequested === true &&
    e2eAuthMode === true &&
    testBuildTransportCapability === true &&
    hasRealServerAssignment !== true
  ) {
    return "scripted";
  }

  return "server";
}
