// Single source of truth for the app's base path and production origin.
//
// Production (Cloudflare Pages, https://mybishbash.app) serves from the root,
// so the default base is "/". Staging (GitHub Pages) and the e2e suite still
// run under "/mybishbash/" by setting VITE_BASE_PATH=/mybishbash/ at build time
// — that keeps their existing paths/assertions working unchanged.
//
// This module is imported by both the Vite browser build (import.meta.env) and
// plain Node scripts (process.env), so it resolves the base from whichever is
// available.

function resolveRawBase() {
  // Vite statically replaces import.meta.env.BASE_URL at build time.
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) {
      return import.meta.env.BASE_URL;
    }
  } catch {
    /* import.meta.env not available (plain Node) */
  }
  if (typeof process !== "undefined" && process.env && process.env.VITE_BASE_PATH) {
    return process.env.VITE_BASE_PATH;
  }
  return "/";
}

// Always normalised to a leading + trailing slash, e.g. "/" or "/mybishbash/".
export const BASE = (() => {
  const raw = resolveRawBase() || "/";
  const withLead = raw.startsWith("/") ? raw : `/${raw}`;
  return withLead.endsWith("/") ? withLead : `${withLead}/`;
})();

// No trailing slash, empty at root, e.g. "" or "/mybishbash".
export const BASE_NO_SLASH = BASE === "/" ? "" : BASE.replace(/\/$/, "");

// The path the launcher registry / generated assets were authored against.
// Anything starting with this is re-pointed at the active BASE.
export const SOURCE_BASE = "/mybishbash/";

export function rebase(pathValue) {
  if (typeof pathValue !== "string") return pathValue;
  if (pathValue.startsWith(SOURCE_BASE)) {
    return `${BASE}${pathValue.slice(SOURCE_BASE.length)}`;
  }
  return pathValue;
}

// Canonical production origin for absolute URLs (PWA manifests, deep links).
export const PRODUCTION_ORIGIN = "https://mybishbash.app";
