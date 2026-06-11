import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { registerServiceWorker } from "./registerServiceWorker";
import { initDynamicLaunchersFromCache } from "./lib/dynamicLauncherCache";
import "./styles.css";

// HQ-created launchers must be registered before App parses the initial
// route, so direct hits on dynamic /intercept/:id shells resolve.
initDynamicLaunchersFromCache();

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")).render(
  <App />,
);
