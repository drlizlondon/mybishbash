import { useEffect, useMemo, useRef, useState } from "react";
import { resolveLauncherIconSrc } from "../../lib/launcherRegistry";
import { getVersionOpenHref } from "../../lib/launcherState";
import { getBrowserSafeDestinationHref } from "../../lib/launcherSetupUrl";
import { getGreeting, isCommitmentCard, isCommitmentCheckInCard, isCommitmentEncouragementCard, isCommitmentReviewCard } from "../../utils";
import { getLauncherCardActions } from "./overlayBuilders";
import { normalizeLaunchSession, LAUNCH_PRIMARY_ACTIONS } from "./launchSessionStorage";
import { debugLaunch, getCardOverlayRenderKey } from "./launchDebug";
import { BASE_PATH } from "../../app/router/routes";
import { PremiumCardScreen } from "./CardRevealTemplate";
import CommitmentCardOverlay from "./CommitmentCardOverlay";
import CommitmentMotivationOverlay from "./CommitmentMotivationOverlay";
import CommitmentCheckInOverlay from "./CommitmentCheckInOverlay";
import CommitmentEncouragementOverlay from "./CommitmentEncouragementOverlay";
import CommitmentReviewOverlay from "./CommitmentReviewOverlay";
import ActionCardOverlay from "./ActionCardOverlay";
import ActionCardEmptyOverlay from "./ActionCardEmptyOverlay";
import ActionSuccessOverlay from "./ActionSuccessOverlay";
import FlowConfirmationOverlay from "./FlowConfirmationOverlay";
import CustomPackOverlay from "./CustomPackOverlay";
import InterceptionOverlay from "./InterceptionOverlay";
import ContinueToAppCard from "./ContinueToAppCard";

const LAUNCHER_PREPARING_VISIBLE_DELAY_MS = 180;

export default function Overlay({
  overlay,
  card,
  route,
  launchSession,
  version,
  timezone,
  onClose,
  onDashboard,
  onAction,
  onCommitmentAction,
  onCommitmentCheckInAction,
  onCommitmentEncouragementAction,
  onCommitmentReviewAction,
  onCreateCard,
  onPackContinue,
  onPackLike,
  onChooseElse,
  onLogEvent,
  onLogLauncherEvent,
  actionCards,
  onAcceptActionCard,
  onCreateActionCard,
  fakeLauncherVersions,
  onFakeLauncherLaunch,
  onContinueToApp,
  onPauseApp,
  onManageApp,
  isOffline = false,
  onRetryConnection,
}) {
  // Identify the active launcher app for the pause button.
  // Only surfaces the button when we're inside a fake-launcher flow.
  const launcherAppId = (overlay.launchSource === "fake_launcher" && overlay.versionId) ? overlay.versionId : null;
  const launcherAppName = launcherAppId ? (version?.displayName ?? version?.name ?? launcherAppId) : null;
  const onPauseCurrentApp = (launcherAppId && onPauseApp)
    ? (mins) => onPauseApp(launcherAppId, mins)
    : null;
  const [showLauncherPreparingFallback, setShowLauncherPreparingFallback] = useState(false);
  const launcherPreparingPaintedRef = useRef(false);
  const launcherInterceptionClass = overlay?.launchSource === "fake_launcher" || overlay?.versionId
    ? "launcher-interception-card"
    : "";
  const cardOverlayKey = getCardOverlayRenderKey(overlay, card?.id);
  const directLauncherVersions = useMemo(
    () =>
      (fakeLauncherVersions ?? []).map((launcherVersion) => ({
        ...launcherVersion,
        href: getBrowserSafeDestinationHref(getVersionOpenHref(launcherVersion, { preferDirectAppDestination: true })),
      })),
    [fakeLauncherVersions],
  );
  const handleDirectLauncherLaunch = (versionId, event) => {
    const handled = onContinueToApp?.(versionId, {
      source: "in_card_app_button",
      reason: "user_pressed_real_app_button",
      allowDefaultNavigation: true,
      preferDirectAppDestination: true,
    });
    if (handled !== false) event?.preventDefault?.();
  };

  useEffect(() => {
    if (overlay.type !== "launcher-preparing") {
      setShowLauncherPreparingFallback(false);
      launcherPreparingPaintedRef.current = false;
      return undefined;
    }

    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    launcherPreparingPaintedRef.current = false;
    setShowLauncherPreparingFallback(false);
    debugLaunch("[LAUNCHER_PREPARING_DELAY_STARTED]", {
      currentPath: typeof window === "undefined" ? route?.path : window.location.pathname,
      routeKind: route?.kind,
      routePath: route?.path,
      versionId: overlay.versionId,
      launcherContext: overlay.versionId,
      overlayTypeBefore: overlay.type,
      delayMs: LAUNCHER_PREPARING_VISIBLE_DELAY_MS,
      basePath: BASE_PATH,
    });

    const timeoutId = window.setTimeout(() => {
      launcherPreparingPaintedRef.current = true;
      setShowLauncherPreparingFallback(true);
      const elapsedMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
      debugLaunch("[LAUNCHER_PREPARING_PAINTED]", {
        currentPath: window.location.pathname,
        routeKind: route?.kind,
        routePath: route?.path,
        versionId: overlay.versionId,
        launcherContext: overlay.versionId,
        overlayTypeAfter: overlay.type,
        elapsedMs,
        basePath: BASE_PATH,
      });
    }, LAUNCHER_PREPARING_VISIBLE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      if (!launcherPreparingPaintedRef.current) {
        const elapsedMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
        debugLaunch("[LAUNCHER_PREPARING_CANCELLED_BEFORE_PAINT]", {
          currentPath: typeof window === "undefined" ? route?.path : window.location.pathname,
          routeKind: route?.kind,
          routePath: route?.path,
          versionId: overlay.versionId,
          launcherContext: overlay.versionId,
          elapsedMs,
          basePath: BASE_PATH,
        });
      }
    };
  }, [overlay?.activationKey, overlay.type, overlay.versionId, route?.kind, route?.path]);

  if (overlay.type === "launcher-preparing") {
    if (!showLauncherPreparingFallback) return null;
    return (
      <div
        aria-hidden="true"
        className={`launcher-preparing-placeholder ${launcherInterceptionClass}`.trim()}
        data-testid="launcher-preparing-placeholder"
      />
    );
  }

  if (overlay.type === "continue-to-app") {
    const continueHref = getBrowserSafeDestinationHref(getVersionOpenHref(version, { preferDirectAppDestination: true }));
    const canGoBackHome = normalizeLaunchSession(launchSession).allowBackHome;
    const handleContinue = (event) => {
      const handled = onContinueToApp?.(version?.id, {
        source: "continue_card",
        reason: "user_pressed_continue",
        allowDefaultNavigation: Boolean(continueHref),
        preferDirectAppDestination: true,
      });
      if (handled !== false) event?.preventDefault?.();
    };

    const handleBack = () => {
      void onLogEvent?.({
        event_type: "intercept_continue_to_app_cancelled",
        source_type: "continue_card",
        card_source: "continue_card",
        app_id: version?.id,
        app_name: version?.name,
        launcher_context: version?.id,
        action_taken: "cancelled_continue",
      });
      onClose();
    };

    return (
      <ContinueToAppCard
        appName={version?.name ?? "App"}
        appIcon={resolveLauncherIconSrc(version ?? {})}
        href={continueHref}
        onContinue={handleContinue}
        onBack={canGoBackHome ? handleBack : null}
        onDashboard={onDashboard}
        onManageApp={onManageApp}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseApp}
        className={launcherInterceptionClass}
      />
    );
  }

  if (overlay.type === "empty") {
    const isIntercept = !!overlay.versionId;
    const interceptVersion = isIntercept ? version : null;
    const appName = interceptVersion?.name ?? "App";

    // ── Offline fallback ──────────────────────────────────────────────────────
    // When the device has no network and no eligible cards could be fetched,
    // show a calm offline screen rather than a confusing "all caught up" message.
    if (isOffline) {
      const offlineActions = [
        {
          label: "Try again",
          variant: "primary",
          onClick: () => {
            if (typeof navigator !== "undefined" && navigator.onLine) {
              onRetryConnection?.();
            } else {
              // Trigger a hard reload so the app re-checks connectivity.
              window.location.reload();
            }
          },
        },
      ];
      if (isIntercept && interceptVersion) {
        const continueHref = getBrowserSafeDestinationHref(getVersionOpenHref(interceptVersion, { preferDirectAppDestination: true }));
        offlineActions.push({
          label: `Open ${appName} anyway`,
          variant: "secondary",
          href: continueHref,
          onClick: (event) => {
            const handled = onContinueToApp?.(interceptVersion.id, {
              source: "offline_empty_card",
              reason: "user_pressed_open_anyway_offline",
              allowDefaultNavigation: Boolean(continueHref),
              preferDirectAppDestination: true,
            });
            if (handled !== false) event?.preventDefault?.();
          },
        });
      }
      offlineActions.push({
        label: "Back to myBishBash",
        variant: "secondary",
        onClick: onClose,
      });
      return (
        <PremiumCardScreen
          type="offline"
          greeting={isIntercept ? (interceptVersion?.name ?? "myBishBash") : "myBishBash"}
          icon="heart"
          headline="You appear to be offline."
          subtitle="Cards can't load right now. Take a breath before you open another app."
          actions={offlineActions}
          onDashboard={onDashboard}
          cardOverlayKey={cardOverlayKey}
          className={launcherInterceptionClass}
          launcherAppId={launcherAppId}
          launcherAppName={launcherAppName}
          onManageApp={onManageApp}
        />
      );
    }
    // ── end offline fallback ──────────────────────────────────────────────────
    const canGoBackHome = normalizeLaunchSession(launchSession).allowBackHome;

    const actions = [];
    if (isIntercept && interceptVersion) {
      const continueHref = getBrowserSafeDestinationHref(getVersionOpenHref(interceptVersion, { preferDirectAppDestination: true }));
      actions.push({
        label: `Continue to ${appName}`,
              testId: "card-action-continue-to-app",
        variant: "primary",
        href: continueHref,
        onClick: (event) => {
          const handled = onContinueToApp?.(interceptVersion.id, {
            source: "empty_card",
            reason: "user_pressed_continue_after_no_eligible_cards",
            allowDefaultNavigation: Boolean(continueHref),
            preferDirectAppDestination: true,
          });
          if (handled !== false) event?.preventDefault?.();
        }
      });
      if (canGoBackHome) {
        actions.push({
          label: "Back to myBishBash",
          variant: "secondary",
          onClick: onClose
        });
      }
    } else {
      if (canGoBackHome) {
        actions.push({ label: "Back home", variant: "primary", onClick: onClose });
      }
    }

    return (
      <PremiumCardScreen
        type="empty"
        greeting={isIntercept ? interceptVersion?.name || "myBishBash" : "myBishBash"}
        icon="heart"
        headline={isIntercept ? "You're all caught up." : "You're all caught up for now."}
        subtitle={isIntercept ? "See you later." : ""}
      actions={actions}
      launcherVersions={isIntercept ? [] : directLauncherVersions}
      onLauncherLaunch={handleDirectLauncherLaunch}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={launcherInterceptionClass}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onManageApp={onManageApp}
    />
    );
  }

  if (overlay.type === "intercept-pack") {
    return (
      <InterceptionOverlay
        overlay={overlay}
        version={version}
        onChooseElse={onChooseElse}
        onLogEvent={onLogEvent}
        onLogLauncherEvent={onLogLauncherEvent}
        onContinueToApp={onContinueToApp}
        onFakeLauncherLaunch={onFakeLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseCurrentApp}
        onManageApp={onManageApp}
      />
    );
  }

  if (overlay.type === "custom-pack-preview") {
    return <CustomPackOverlay overlay={overlay} onClose={onClose} onDashboard={onDashboard} />;
  }

  if (overlay.type === "action-card") {
    return (
      <ActionCardOverlay
        overlay={overlay}
        actionCards={actionCards}
        onAccept={onAcceptActionCard}
        onClose={onClose}
        onLogEvent={onLogEvent}
        fakeLauncherVersions={directLauncherVersions}
        onFakeLauncherLaunch={handleDirectLauncherLaunch}
        allowBackHome={normalizeLaunchSession(launchSession).allowBackHome}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={launcherInterceptionClass}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onManageApp={onManageApp}
      />
    );
  }

  if (overlay.type === "action-card-empty") {
    return (
      <ActionCardEmptyOverlay
        overlay={overlay}
        version={version}
        onClose={onClose}
        onLogEvent={onLogEvent}
        onCreateActionCard={onCreateActionCard}
        onContinueToApp={onContinueToApp}
        fakeLauncherVersions={directLauncherVersions}
        onFakeLauncherLaunch={handleDirectLauncherLaunch}
        allowBackHome={normalizeLaunchSession(launchSession).allowBackHome}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={launcherInterceptionClass}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onManageApp={onManageApp}
      />
    );
  }

  if (overlay.type === "action-success") {
    return (
      <ActionSuccessOverlay
        onClose={onClose}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={launcherInterceptionClass}
      />
    );
  }

  if (overlay.type === "flow-confirmation") {
    return (
      <FlowConfirmationOverlay
        overlay={overlay}
        version={version}
        onClose={onClose}
        onContinueToApp={onContinueToApp}
        onChooseElse={onChooseElse}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={launcherInterceptionClass}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onManageApp={onManageApp}
      />
    );
  }

  if (!card) return null;
  const cardType = card.sourcePackId ? "pack" : "personal";

  if (overlay.type === "commitment-motivation" && isCommitmentCard(card)) {
    return (
      <CommitmentMotivationOverlay
        card={card}
        onCommitmentAction={onCommitmentAction}
        launcherVersions={directLauncherVersions}
        onLauncherLaunch={handleDirectLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={launcherInterceptionClass}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseCurrentApp}
        onManageApp={onManageApp}
      />
    );
  }

  if (isCommitmentEncouragementCard(card)) {
    return (
      <CommitmentEncouragementOverlay
        card={card}
        onContinue={onCommitmentEncouragementAction}
        launcherVersions={directLauncherVersions}
        onLauncherLaunch={handleDirectLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={[launcherInterceptionClass, overlay.phase === "dissolving" ? "is-dissolving" : ""].filter(Boolean).join(" ")}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseCurrentApp}
        onManageApp={onManageApp}
      />
    );
  }

  if (isCommitmentReviewCard(card)) {
    return (
      <CommitmentReviewOverlay
        card={card}
        onReviewAction={onCommitmentReviewAction}
        launcherVersions={directLauncherVersions}
        onLauncherLaunch={handleDirectLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={[launcherInterceptionClass, overlay.phase === "dissolving" ? "is-dissolving" : ""].filter(Boolean).join(" ")}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseCurrentApp}
        onManageApp={onManageApp}
      />
    );
  }

  if (isCommitmentCheckInCard(card)) {
    return (
      <CommitmentCheckInOverlay
        card={card}
        onCheckInAction={onCommitmentCheckInAction}
        launcherVersions={directLauncherVersions}
        onLauncherLaunch={handleDirectLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={[launcherInterceptionClass, overlay.phase === "dissolving" ? "is-dissolving" : ""].filter(Boolean).join(" ")}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseCurrentApp}
        onManageApp={onManageApp}
      />
    );
  }

  if (isCommitmentCard(card)) {
    return (
      <CommitmentCardOverlay
        card={card}
        timezone={timezone}
        onCommitmentAction={onCommitmentAction}
        launcherVersions={directLauncherVersions}
        onLauncherLaunch={handleDirectLauncherLaunch}
        onDashboard={onDashboard}
        onCreateCard={onCreateCard}
        cardOverlayKey={cardOverlayKey}
        className={[launcherInterceptionClass, overlay.phase === "dissolving" ? "is-dissolving" : ""].filter(Boolean).join(" ")}
        launcherAppId={launcherAppId}
        launcherAppName={launcherAppName}
        onPauseApp={onPauseCurrentApp}
        onManageApp={onManageApp}
      />
    );
  }

  const cardActionConfig = getLauncherCardActions({ launchSession, cardType });
  const resolvedActions = cardActionConfig.actions.map((action) => {
    if (action.id === "really_like_pack_card") return { ...action, onClick: onPackLike };
    if (action.id === LAUNCH_PRIMARY_ACTIONS.CONTINUE_TO_APP || action.id === LAUNCH_PRIMARY_ACTIONS.BACK_TO_HOME) {
      return { ...action, onClick: onPackContinue };
    }
    if (action.id === "not_done") return { ...action, onClick: () => onAction("later") };
    if (action.id === "do_now") return { ...action, onClick: () => onAction("now") };
    if (action.id === "done") return { ...action, onClick: () => onAction("done") };
    return action;
  });

  return (
    <PremiumCardScreen
      type={cardType}
      greeting={getGreeting(new Date(), timezone)}
      icon="heart"
      headline={card.promptText}
      subtitle={
        card.sourcePackId
          ? card.attribution || card.sourceTitle || "A card from your pack."
          : "A gentle nudge from the version of you that cares."
      }
      actions={resolvedActions}
      launcherVersions={directLauncherVersions}
      onLauncherLaunch={handleDirectLauncherLaunch}
      onDashboard={onDashboard}
      onCreateCard={onCreateCard}
      cardOverlayKey={cardOverlayKey}
      className={[launcherInterceptionClass, overlay.phase === "dissolving" ? "is-dissolving" : ""].filter(Boolean).join(" ")}
      launcherAppId={launcherAppId}
      launcherAppName={launcherAppName}
      onPauseApp={onPauseCurrentApp}
      onManageApp={onManageApp}
    />
  );
}

