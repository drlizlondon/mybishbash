import { useState } from "react";
import { LAUNCHER_CONTEXTS, getAvailableLaunchersForUser } from "../../lib/launcherAvailability";
import { DEFAULT_WINDOW_DEFS, isValidWindowDefs } from "../../utils";
import { BASE_PATH } from "../../app/router/routes";
import DeleteAccountModal from "./DeleteAccountModal";
import RestoreActionCardsModal from "./RestoreActionCardsModal";
import TesterToolsSettingsCard from "./TesterToolsSettingsCard";

/** Convert a stored hour integer (0-23) to an HH:00 string for <input type="time">. */
function hourToTimeString(h) {
  return `${String(h).padStart(2, "0")}:00`;
}

/** Parse an HH:MM string back to an integer hour (0-23), or null on failure. */
function timeStringToHour(s) {
  const m = typeof s === "string" && s.match(/^(\d{1,2}):\d{2}$/);
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}

/** Check that four defs form a valid, gap-free 24-hour partition. */
function validateWindowDefsGapFree(defs) {
  if (!isValidWindowDefs(defs)) return { valid: false, error: "Each window needs a valid start and end time." };
  // Check contiguity: each window's end must equal the next window's start.
  for (let i = 0; i < defs.length; i++) {
    const next = defs[(i + 1) % defs.length];
    if (defs[i].end !== next.start) {
      return {
        valid: false,
        error: `"${defs[i].label || defs[i].id}" ends at ${hourToTimeString(defs[i].end)} but "${next.label || next.id}" starts at ${hourToTimeString(next.start)}. Windows must connect without gaps.`,
      };
    }
  }
  return { valid: true, error: null };
}

export default function SettingsPanel({
  homeScreenVersions,
  session,
  onLogOut,
  onDeleteAccount,
  onRefreshSession,
  onRefreshAppShell,
  onResetSharedState,
  isTester = false,
  notificationSettings,
  notificationStatus,
  onEnableNotifications,
  onDisableNotifications,
  onUpdateNotificationsPerDay,
  actionCards,
  onRestoreActionCards,
  morningSummaryDebug,
  onShowMorningSummaryNow,
  onGenerateMorningSummaryForToday,
  onGenerateMorningSummaryForYesterday,
  timingWindowsPrefs = DEFAULT_WINDOW_DEFS,
  onSaveTimingWindowsPrefs,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftWindowDefs, setDraftWindowDefs] = useState(timingWindowsPrefs);
  const [windowSaveStatus, setWindowSaveStatus] = useState(null); // null | "saved" | { error: string }
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const settingsTesterStatus = { is_tester: isTester };
  const supportedShortcutNames = getAvailableLaunchersForUser({
    launchers: Object.values(homeScreenVersions).filter((version) => version.id !== "mybishbash"),
    testerStatus: settingsTesterStatus,
    context: LAUNCHER_CONTEXTS.SETTINGS,
  })
    .map((version) => version.name ?? version.displayName ?? version.id)
    .join(", ");
  return (
    <section className="panel-section">
      <div className="section-heading solo">
        <div>
          <h2>Settings</h2>
          <p>Manage your account, cards and myBishBash preferences.</p>
        </div>
      </div>

      <section className="settings-section" aria-labelledby="settings-account-heading">
        <div className="settings-version-heading">
          <h3 id="settings-account-heading">Account</h3>
          <span>Signed in as {session?.user?.email ?? "Unknown"}</span>
        </div>
        <div className="settings-card settings-compact account-delete-card" data-testid="delete-account-settings-card">
          <div className="settings-version-heading">
            <p>Delete account</p>
            <span>This permanently deletes your myBishBash account, cards, settings and saved app data. This cannot be undone.</span>
          </div>
          <button type="button" className="pack-button secondary danger-soft-button" onClick={() => setIsDeleteAccountModalOpen(true)}>
            Delete account
          </button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-cards-timing-heading">
        <div className="settings-version-heading">
          <h3 id="settings-cards-timing-heading">Cards & Timing</h3>
          <span>Choose when cards are most likely to appear.</span>
        </div>
        <div className="settings-card" data-testid="timing-windows-settings-card">
          <div className="settings-version-heading">
            <p>Card times</p>
            <span>Morning, afternoon and evening windows help myBishBash show cards at the right time.</span>
          </div>
          <div className="tw-rows">
            {draftWindowDefs.map((def, idx) => {
              const isNightWrapping = def.start > def.end || (def.id === "night" && def.start >= 22);
              return (
                <div key={def.id} className="tw-row" data-testid={`tw-row-${def.id}`}>
                  <span className="tw-label">{def.label || def.id}</span>
                  <label className="tw-time-label">
                    <span className="tw-time-hint">from</span>
                    <input
                      type="time"
                      step="3600"
                      className="tw-time-input settings-input"
                      value={hourToTimeString(def.start)}
                      data-testid={`tw-start-${def.id}`}
                      onChange={(e) => {
                        const h = timeStringToHour(e.target.value);
                        if (h === null) return;
                        const next = draftWindowDefs.map((d, i) =>
                          i === idx ? { ...d, start: h } : d,
                        );
                        setDraftWindowDefs(next);
                        setWindowSaveStatus(null);
                      }}
                    />
                  </label>
                  <label className="tw-time-label">
                    <span className="tw-time-hint">to</span>
                    <input
                      type="time"
                      step="3600"
                      className="tw-time-input settings-input"
                      value={hourToTimeString(def.end)}
                      data-testid={`tw-end-${def.id}`}
                      onChange={(e) => {
                        const h = timeStringToHour(e.target.value);
                        if (h === null) return;
                        const next = draftWindowDefs.map((d, i) =>
                          i === idx ? { ...d, end: h } : d,
                        );
                        setDraftWindowDefs(next);
                        setWindowSaveStatus(null);
                      }}
                    />
                  </label>
                  {isNightWrapping && (
                    <span className="tw-wraps-hint">wraps midnight</span>
                  )}
                </div>
              );
            })}
          </div>
          {windowSaveStatus && typeof windowSaveStatus === "object" && windowSaveStatus.error ? (
            <p className="tw-error" role="alert" data-testid="tw-error">{windowSaveStatus.error}</p>
          ) : null}
          {windowSaveStatus === "saved" ? (
            <p className="tw-saved" data-testid="tw-saved">Saved.</p>
          ) : null}
          <div className="tw-actions">
            <button
              type="button"
              className="settings-save-btn"
              data-testid="tw-save-btn"
              onClick={() => {
                const { valid, error } = validateWindowDefsGapFree(draftWindowDefs);
                if (!valid) {
                  setWindowSaveStatus({ error });
                  return;
                }
                onSaveTimingWindowsPrefs?.(draftWindowDefs);
                setWindowSaveStatus("saved");
                setTimeout(() => setWindowSaveStatus(null), 2500);
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="tw-reset-btn"
              data-testid="tw-reset-btn"
              onClick={() => {
                setDraftWindowDefs(DEFAULT_WINDOW_DEFS);
                setWindowSaveStatus(null);
              }}
            >
              Reset to defaults
            </button>
          </div>
        </div>
        <div className="settings-card settings-compact">
          <button
            type="button"
            className="settings-toggle"
            onClick={() => setIsOpen((current) => !current)}
            aria-expanded={isOpen}
          >
            <span>How cards are chosen</span>
            <span>{isOpen ? "−" : "+"}</span>
          </button>
          {isOpen ? (
            <div className="settings-dropdown">
              <p>Each time the app opens, it chooses one eligible myBishBash from everything you have created or activated.</p>
              <ul className="settings-list">
                <li>it is not paused</li>
                <li>it has not already been marked done</li>
                <li>it is ready to appear again</li>
                <li>the current time matches its selected part of the day</li>
              </ul>
            </div>
          ) : null}
        </div>
        <div className="settings-card">
          <div className="settings-version-heading">
            <p>Restore deleted cards</p>
            <span>Bring back action cards you previously deleted.</span>
          </div>
          <button type="button" className="pack-button secondary" onClick={() => setIsRestoreModalOpen(true)}>
            View deleted cards
          </button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-apps-access-heading">
        <div className="settings-version-heading">
          <h3 id="settings-apps-access-heading">Apps / Access</h3>
          <span>{supportedShortcutNames ? `App prompts are available for ${supportedShortcutNames}.` : "App prompts can be managed from Apps."}</span>
        </div>
        <div className="settings-card settings-action-row">
          <a className="pack-button secondary" href={`${BASE_PATH}/apps`}>
            Manage apps
          </a>
          <a className="pack-button secondary" href={`${BASE_PATH}/access`}>
            Access options
          </a>
        </div>
        <div className="settings-card settings-compact">
          <div className="settings-version-heading">
            <p>Update app</p>
            <span>Reload the latest myBishBash without deleting your account, cards or preferences.</span>
          </div>
          <button type="button" className="pack-button secondary" onClick={onRefreshAppShell}>
            Refresh app
          </button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-help-heading">
        <div className="settings-version-heading">
          <h3 id="settings-help-heading">Help</h3>
          <span>Find product information, privacy details and support guidance.</span>
        </div>
        <div className="settings-card settings-action-row">
          <a className="pack-button secondary" href={`${BASE_PATH}/about`}>
            Help
          </a>
        </div>
      </section>

      {isTester ? (
        <TesterToolsSettingsCard
          session={session}
          onRefreshSession={onRefreshSession}
          onResetSharedState={onResetSharedState}
          morningSummaryDebug={morningSummaryDebug}
          onShowMorningSummaryNow={onShowMorningSummaryNow}
          onGenerateMorningSummaryForToday={onGenerateMorningSummaryForToday}
          onGenerateMorningSummaryForYesterday={onGenerateMorningSummaryForYesterday}
        />
      ) : null}

      <section className="settings-section" aria-labelledby="settings-sign-out-heading">
        <div className="settings-version-heading">
          <h3 id="settings-sign-out-heading">Sign out</h3>
          <span>Leave this myBishBash account on this device.</span>
        </div>
        <div className="settings-card settings-compact">
          <button type="button" className="pack-button secondary" onClick={onLogOut}>
            Sign out
          </button>
        </div>
      </section>

      {isRestoreModalOpen ? (
        <RestoreActionCardsModal
          actionCards={actionCards}
          onRestore={onRestoreActionCards}
          onClose={() => setIsRestoreModalOpen(false)}
        />
      ) : null}
      {isDeleteAccountModalOpen ? (
        <DeleteAccountModal
          email={session?.user?.email ?? ""}
          onDelete={onDeleteAccount}
          onClose={() => setIsDeleteAccountModalOpen(false)}
        />
      ) : null}
    </section>
  );
}
