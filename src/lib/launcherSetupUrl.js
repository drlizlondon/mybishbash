import { BASE_PATH } from "../app/router/routes";

export function isStandaloneDisplayMode() {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true || window.Capacitor);
}

function shouldUseSafariSetupHandoff() {
  if (typeof window === "undefined") return false;
  const userAgent = window.navigator.userAgent || "";
  const isIos = /iPad|iPhone|iPod/.test(userAgent) || window.navigator.standalone === true;
  return isStandaloneDisplayMode() && isIos;
}

export function getLauncherSetupUrl(launcherId) {
  if (typeof window === "undefined") {
    return `${BASE_PATH}/install/${launcherId}/`;
  }
  const basePath = BASE_PATH;
  return new URL(`${basePath}/install/${launcherId}/`, window.location.origin).toString();
}

export function getLauncherBrowserSetupUrl(launcherId) {
  const setupUrl = getLauncherSetupUrl(launcherId);
  return shouldUseSafariSetupHandoff() ? `x-safari-${setupUrl}` : setupUrl;
}

export function getBrowserSafeDestinationHref(href) {
  if (!href) return "";
  if (!isStandaloneDisplayMode() && href.startsWith("x-safari-")) {
    return href.replace(/^x-safari-/, "");
  }
  return href;
}
