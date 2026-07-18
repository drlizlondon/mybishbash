import { isKnownLauncher } from "../../lib/launcherRegistry";
import { CARD_SELECTION_SURFACES } from "../../lib/cardSelection";
import { normalizeLaunchSession, LAUNCH_PRIMARY_ACTIONS } from "./launchSessionStorage";

const IN_APP_SHORTCUT_SOURCES = new Set([
  "apps_protected_launch",
  "home_fake_launcher_bar",
  "overlay_fake_launcher",
  "settings_fake_launcher",
]);
const INSTALLED_FAKE_LAUNCHER_ENTRY_SOURCES = new Set([
  "route",
  "home_screen_resume",
  "standalone_home_recovery",
]);

export function buildRevealOverlay(cardId, versionId = null) {
  return { type: "reveal", cardId, versionId };
}

export function buildFakeLauncherOverlayContext(versionId, activationKey = null) {
  return {
    versionId,
    activationKey,
    launchSource: "fake_launcher",
    origin: "intercept",
  };
}

export function buildFakeLauncherRevealOverlay(cardId, versionId, activationKey = null) {
  return {
    ...buildRevealOverlay(cardId, versionId),
    ...buildFakeLauncherOverlayContext(versionId, activationKey),
  };
}

export function buildFakeLauncherContinueOverlay(versionId, activationKey = null) {
  return {
    type: "continue-to-app",
    ...buildFakeLauncherOverlayContext(versionId, activationKey),
  };
}

export function buildFakeLauncherEmptyOverlay(versionId, activationKey = null) {
  return {
    ...buildEmptyOverlay(versionId),
    ...buildFakeLauncherOverlayContext(versionId, activationKey),
  };
}

export function buildFakeLauncherPreparingOverlay(versionId) {
  return {
    type: "launcher-preparing",
    ...buildFakeLauncherOverlayContext(versionId, `preparing:${versionId}`),
  };
}

export function getLaunchSessionForOverlay(launchSession, overlay) {
  if (overlay?.launchSource === "fake_launcher" && isKnownLauncher(overlay.versionId)) {
    return normalizeLaunchSession({
      ...launchSession,
      entrySurface: "fake_launcher",
      launcherId: overlay.versionId,
    });
  }
  return normalizeLaunchSession(launchSession);
}

export function isFakeLauncherSession(launchSession) {
  return launchSession?.entrySurface === "fake_launcher";
}

export function isInAppShortcutClick(source) {
  return IN_APP_SHORTCUT_SOURCES.has(source);
}

export function isInstalledFakeLauncherEntry(source) {
  return INSTALLED_FAKE_LAUNCHER_ENTRY_SOURCES.has(source);
}

export function getVisibleDestinationChips(launchSession, versions) {
  const normalizedSession = normalizeLaunchSession(launchSession);
  if (normalizedSession.entrySurface !== "fake_launcher") return [];
  const byId = new Map((versions ?? []).map((version) => [version.id, version]));
  return normalizedSession.allowedDestinationIds
    .map((destinationId) => byId.get(destinationId))
    .filter((version) => Boolean(version?.realAppLabel));
}

export function getLauncherCardActions({ launchSession, cardType }) {
  const normalizedSession = normalizeLaunchSession(launchSession);

  if (cardType === "pack") {
    return {
      actions: [
        { id: "really_like_pack_card", label: "I really like this one", variant: "secondary" },
        {
          id: normalizedSession.primaryAction,
          label: normalizedSession.primaryAction === LAUNCH_PRIMARY_ACTIONS.CONTINUE_TO_APP ? "Continue" : "Back to home",
          variant: "primary",
        },
      ],
    };
  }

  return {
    actions: [
      { id: "done", label: "Done", variant: "primary" },
      { id: "do_now", label: "I’ll do it now", variant: "secondary" },
      { id: "not_done", label: "Not done", variant: "secondary" },
    ],
  };
}

export function getCardSelectionSurfaceForOverlay(overlay) {
  if (overlay?.launchSource === "fake_launcher" || overlay?.versionId) return CARD_SELECTION_SURFACES.SHELL;
  return CARD_SELECTION_SURFACES.HOME;
}

export function getActiveFakeLauncherReturnContext(route, overlay, interceptActivation, installedShellId = null) {
  const isInterceptRoute = route?.kind === "intercept";
  const isFakeLauncherOverlay = overlay?.launchSource === "fake_launcher" || !!overlay?.versionId;
  const isStandaloneShell = !!installedShellId;

  if (!isInterceptRoute && !isFakeLauncherOverlay && !isStandaloneShell) {
    return null;
  }

  const versionId =
    route?.versionId ||
    overlay?.versionId ||
    interceptActivation?.versionId ||
    installedShellId ||
    null;

  const activationKey =
    overlay?.activationKey ||
    interceptActivation?.activationKey ||
    null;

  if (!versionId) return null;

  return {
    versionId,
    activationKey,
    launchSource: "fake_launcher",
  };
}

export function buildEmptyOverlay(versionId = null) {
  return { type: "empty", versionId };
}

export function buildActionCardOverlay(versionId = null) {
  return { type: "action-card", versionId };
}

export function buildActionCardEmptyOverlay(versionId = null) {
  return { type: "action-card-empty", versionId };
}

export function buildActionSuccessOverlay(versionId = null) {
  return { type: "action-success", versionId };
}

export function buildFlowConfirmationOverlay(versionId = null, message = "Thanks for the update.", activationKey = null, actionLabel = "Continue") {
  return {
    type: "flow-confirmation",
    versionId,
    message,
    actionLabel,
    ...(versionId ? buildFakeLauncherOverlayContext(versionId, activationKey) : {}),
  };
}

export function buildCommitmentMotivationOverlay(cardId, versionId = null, activationKey = null) {
  return {
    type: "commitment-motivation",
    cardId,
    versionId,
    ...(versionId ? buildFakeLauncherOverlayContext(versionId, activationKey) : {}),
  };
}

export function stripCommitmentPrefix(value = "") {
  return String(value ?? "").trim().replace(/^I\s+will\b[\s:,-]*/i, "").trim();
}

export function getCommitmentAcknowledgementMessage({ committed, checkInEnabled }) {
  if (!committed) return "That’s okay.\nAnother day.";
  return checkInEnabled
    ? "Nice choice.\nWe’ll check in later."
    : "Nice choice.\nKeep this in mind today.";
}

export function getCommitmentCheckInOutcomeMessage(response) {
  if (response === "on_track") return "Good.\nKeep going.";
  if (response === "somewhat_on_track") return null;
  return "That’s okay.\nWe’ll leave this for another day.";
}

export function getCommitmentReviewOutcomeMessage(response) {
  if (response === "did_it") return "You did it.\nHold onto that.";
  if (response === "nearly_did_it") return "That still counts.\nYou stayed close to it.";
  return "That’s okay.\nYou can try again another time.";
}
