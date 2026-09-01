// Client error reporter (Phase 1 — unhandled errors only, no analytics).
// See docs/architecture/phase-01-error-telemetry.md for the settled decisions.
//
// Contracts this module must never break:
//   • reportError never throws and never returns a rejected promise.
//   • Inert in DEV (console only), in e2e/demo modes, and when Supabase env
//     is absent (nullable client).
//   • Errors from this module's own files are dropped (no report loops).
//   • Per-signature dedupe (max 3), hard session cap (max 20 accepted),
//     in-memory buffer (max 10, oldest dropped) held until a session exists.
//   • Transport failures are swallowed: buffered once, dropped on the second
//     consecutive failure (covers offline and a not-yet-applied migration).

import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { buildErrorReport, getErrorSignature } from "./scrub.js";

const MAX_REPORTS_PER_SIGNATURE = 3;
const MAX_ACCEPTED_PER_SESSION = 20;
const MAX_BUFFERED_REPORTS = 10;

const DISABLING_LOCAL_STORAGE_FLAGS = [
  "MYBISHBASH_E2E_MODE",
  "MYBISHBASH_E2E_AUTH_MOCK",
  "MYBISHBASH_DEMO_MODE",
];

// Dev-time defence: stacks from this module's own source files are dropped.
// (Production stacks are minified chunk URLs, so the structural protections —
// full try/catch coverage plus the re-entrancy guard below — carry the load.)
const SELF_STACK_PATTERN = /services\/errors\/(reporter|scrub|RootErrorBoundary)\.jsx?[^.\w]/;

function defaultTransport(rows) {
  if (!supabase) return Promise.resolve(false);
  return supabase
    .from("client_errors")
    .insert(rows)
    .then(({ error }) => !error);
}

async function defaultGetSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

function isDisabledByContext() {
  if (typeof window === "undefined") return true;
  try {
    return DISABLING_LOCAL_STORAGE_FLAGS.some(
      (flag) => window.localStorage.getItem(flag) === "true",
    );
  } catch {
    return false;
  }
}

function defaultIsEnabled() {
  return isSupabaseConfigured() && !import.meta.env.DEV && !isDisabledByContext();
}

function getRelease() {
  return typeof __MYBISHBASH_VERSION__ !== "undefined" ? String(__MYBISHBASH_VERSION__) : "dev";
}

function getPlatform() {
  // Capacitor injects window.Capacitor in native shells; browsers stay "web".
  try {
    return window.Capacitor?.getPlatform?.() ?? "web";
  } catch {
    return "web";
  }
}

function createInitialState() {
  return {
    transport: defaultTransport,
    getSession: defaultGetSession,
    isEnabled: defaultIsEnabled,
    signatureCounts: new Map(),
    acceptedCount: 0,
    buffer: [],
    consecutiveFailures: 0,
    flushing: false,
    handlersInstalled: false,
  };
}

let state = createInitialState();

// Test seam. Production callers never pass arguments to configureReporter.
export function configureReporter({ transport, getSession, isEnabled } = {}) {
  if (transport) state.transport = transport;
  if (getSession) state.getSession = getSession;
  if (isEnabled) state.isEnabled = isEnabled;
}

export function _resetReporterForTests() {
  const { handlersInstalled } = state;
  state = createInitialState();
  state.handlersInstalled = handlersInstalled;
}

let reporting = false;

export function reportError(error, kind, context = {}) {
  if (reporting) return; // re-entrancy guard: never report while reporting
  reporting = true;
  try {
    if (!state.isEnabled()) {
      if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
        // Dev visibility for the pipeline without any network traffic.
        console.warn("[client-error]", kind, error, context);
      }
      return;
    }

    const report = buildErrorReport({
      error,
      kind,
      release: getRelease(),
      platform: getPlatform(),
      pathname: typeof window !== "undefined" ? window.location?.pathname ?? "" : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent ?? "" : "",
    });

    // Never report our own failures — that way lies an error loop.
    if (SELF_STACK_PATTERN.test(report.stack)) return;

    const signature = getErrorSignature(report);
    const seen = state.signatureCounts.get(signature) ?? 0;
    if (seen >= MAX_REPORTS_PER_SIGNATURE) return;
    if (state.acceptedCount >= MAX_ACCEPTED_PER_SESSION) return;
    state.signatureCounts.set(signature, seen + 1);
    state.acceptedCount += 1;

    state.buffer.push({ ...report, occurred_at: new Date().toISOString() });
    if (state.buffer.length > MAX_BUFFERED_REPORTS) state.buffer.shift();

    void flush();
  } catch {
    // The reporter must never become an error source itself.
  } finally {
    reporting = false;
  }
}

async function flush() {
  if (state.flushing || state.buffer.length === 0) return;
  state.flushing = true;
  try {
    const session = await state.getSession();
    const userId = session?.user?.id;
    if (!userId) return; // stay buffered until a session exists

    const rows = state.buffer.map((report) => ({ ...report, user_id: userId }));
    const delivered = await state.transport(rows);
    if (delivered) {
      state.buffer = [];
      state.consecutiveFailures = 0;
    } else {
      state.consecutiveFailures += 1;
      if (state.consecutiveFailures >= 2) state.buffer = [];
    }
  } catch {
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= 2) state.buffer = [];
  } finally {
    state.flushing = false;
  }
}

// Exposed so a freshly-arrived session (or connectivity) can drain the buffer.
export function flushBufferedErrorReports() {
  try {
    void flush();
  } catch {
    // never throws
  }
}

export function installGlobalErrorHandlers() {
  if (typeof window === "undefined" || state.handlersInstalled) return;
  state.handlersInstalled = true;

  // No preventDefault anywhere: existing console behaviour stays visible.
  window.addEventListener("error", (event) => {
    reportError(event?.error ?? event?.message, "window-error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError(event?.reason, "unhandled-rejection");
  });

  window.addEventListener("online", () => {
    flushBufferedErrorReports();
  });
}
