import React from "react";
import ReactDOM from "react-dom/client";
import RootRouter from "./app/router/RootRouter";
import { registerServiceWorker } from "./registerServiceWorker";
import { initDynamicLaunchersFromCache } from "./lib/dynamicLauncherCache";
import { installGlobalErrorHandlers } from "./services/errors/reporter";
import { RootErrorBoundary } from "./services/errors/RootErrorBoundary";
import { hydrateLocalData } from "./storage";
import "./styles.css";

// Install error telemetry first so failures in the boot sequence below
// (dynamic launcher registration, service worker, first render) are captured.
installGlobalErrorHandlers();

// Lightweight first-paint perf mark (dev only) so we can measure how long the
// app/card screen takes to render. Paired with the "card-overlay-first-mount"
// mark in App.jsx.
if (import.meta.env.DEV && typeof performance !== "undefined") {
  performance.mark("mbb:boot");
}

// HQ-created launchers must be registered before App parses the initial
// route, so direct hits on dynamic /intercept/:id shells resolve.
initDynamicLaunchersFromCache();

registerServiceWorker();

async function renderAfterLocalDataHydration() {
  // In idb mode, storage.js deliberately serves localStorage until hydration
  // finishes; those pre-hydration accesses are not replayed into the mirror.
  // Keep every storage.js-owned read/write below this gate. The work above is
  // limited to pre-hydration-safe device-local flags and service registration.
  // hydrateLocalData owns the 3s timeout, fallback, and error report, and always
  // resolves so a failed IndexedDB open cannot strand the app before render.
  await hydrateLocalData();

  ReactDOM.createRoot(document.getElementById("root")).render(
    <RootErrorBoundary>
      <RootRouter />
    </RootErrorBoundary>,
  );
}

void renderAfterLocalDataHydration();
