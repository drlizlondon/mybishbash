import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { registerServiceWorker } from "./registerServiceWorker";
import { initDynamicLaunchersFromCache } from "./lib/dynamicLauncherCache";
import { installGlobalErrorHandlers } from "./services/errors/reporter";
import { RootErrorBoundary } from "./services/errors/RootErrorBoundary";
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

ReactDOM.createRoot(document.getElementById("root")).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
);
