import { useState } from "react";
import { getLauncherSetupUrl, getLauncherBrowserSetupUrl } from "../../lib/launcherSetupUrl";

export default function LauncherSetupInterstitial({ version, onClose }) {
  const appName = version.realAppLabel ?? version.name ?? version.displayName ?? version.id;
  const setupUrl = getLauncherSetupUrl(version.id);
  const [copyStatus, setCopyStatus] = useState("");

  async function copySetupLink() {
    try {
      await window.navigator?.clipboard?.writeText(setupUrl);
      setCopyStatus("Setup link copied.");
    } catch {
      setCopyStatus(setupUrl);
    }
  }

  function openSetupPage() {
    const browserSetupUrl = getLauncherBrowserSetupUrl(version.id);
    const captureNavigation = window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION;
    if (typeof captureNavigation === "function") {
      const handled = captureNavigation(browserSetupUrl, { source: "launcher_setup_interstitial", launcherId: version.id });
      if (handled) return;
    }

    if (browserSetupUrl.startsWith("x-safari-")) {
      window.location.assign(browserSetupUrl);
      return;
    }

    const opened = window.open(browserSetupUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.assign(browserSetupUrl);
    }
  }

  return (
    <div className="modal-backdrop apps-setup-backdrop" role="presentation" onClick={onClose}>
      <div
        className="composer apps-setup-interstitial"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apps-setup-title"
        onClick={(event) => event.stopPropagation()}
        data-testid="apps-setup-interstitial"
      >
        <div className="settings-version-heading">
          <p id="apps-setup-title">Set up {appName} with myBishBash</p>
          <span>Open the setup page in Safari so the Home Screen controls are available.</span>
        </div>
        <div className="apps-setup-actions">
          <button type="button" className="pack-button" onClick={openSetupPage}>
            Open setup page
          </button>
          <button type="button" className="pack-button secondary" onClick={copySetupLink}>
            Copy setup link
          </button>
          <button type="button" className="text-button apps-code-link" onClick={onClose}>
            I’ll do this later
          </button>
        </div>
        <p className="tiny-note" data-testid="apps-setup-link">{setupUrl}</p>
        {copyStatus ? <p className="tiny-note" role="status">{copyStatus}</p> : null}
      </div>
    </div>
  );
}

