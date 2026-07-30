import { useMemo } from "react";
import { getGreeting } from "../../utils";
import { BASE_PATH } from "../../app/router/routes";
import { PlusGlyph, AppsGlyph } from "../../app/shell/glyphs";
import HomeAppIcon from "./HomeAppIcon";
import HomeProgressRing from "./HomeProgressRing";
import { buildHomeState } from "./homeState";

export default function HomePanel({
  cards = [],
  events = [],
  timezone,
  homeScreenVersions = {},
  pendingOnboardingShortcuts = [],
  onboardingSelectedAppSetup = null,
  activationChecklistItems = [],
  saveConfirmation = "",
  onCreate,
  onOpenDownload,
  onOpenApps,
  onOpenLauncherSetup,
  onOpenTodayCards,
  onOpenCard,
}) {
  const homeState = useMemo(
    () => buildHomeState({ cards, events, timezone, homeScreenVersions }),
    [cards, events, timezone, homeScreenVersions],
  );
  const completed = homeState.completedPersonalCardsToday;
  const total = homeState.totalPersonalCardsToday;
  const progressPercent = total > 0 ? Math.min(100, Math.max(0, (completed / total) * 100)) : 0;
  const personalCardNoun = total === 1 ? "personal card" : "personal cards";
  const progressNumber = total > 0 ? `${completed}/${total}` : "0";
  const progressCopy = total === 0
    ? "No Personal Cards yet."
    : completed === total
      ? `All ${total} ${personalCardNoun} complete today.`
      : `${completed} of ${total} card${total === 1 ? "" : "s"} completed today.`;
  const progressSubcopy = total === 0 ? "Create one when you are ready." : "";
  const canOpenCommitment = Boolean(homeState.activeCommitment?.id);
  const hasLiveCommitment = Boolean(homeState.activeCommitment);
  const liveCommitmentCountLabel = `${homeState.liveCommitmentCount} live commitment${homeState.liveCommitmentCount === 1 ? "" : "s"}`;
  const commitmentLabel = hasLiveCommitment
    ? "Live Commitment"
    : homeState.hasCompletedCommitmentToday
      ? "Commitments complete"
      : "No live commitment";
  const emptyCommitmentTitle = homeState.hasCompletedCommitmentToday ? "You’re clear for now." : "You’re clear for now.";
  const logoSrc = `${BASE_PATH || ""}/icons/mybishbash-cover.png`;
  const greeting = getGreeting(new Date(), timezone);
  const hasMeaningfulSetup =
    activationChecklistItems.length === 0 ||
    cards.length > 0 ||
    pendingOnboardingShortcuts.length > 0 ||
    Boolean(onboardingSelectedAppSetup);

  const openProgressCard = () => {
    onOpenTodayCards?.();
  };

  const openCommitmentCard = () => {
    if (!homeState.activeCommitment?.id) return;
    onOpenCard(homeState.activeCommitment.id);
  };

  const openCommitmentEmptyState = () => {
    onCreate("commitment");
  };

  const handleChecklistAction = (item) => {
    if (item.action === "download") {
      onOpenDownload?.();
      return;
    }
    if (item.action === "create-card") {
      onCreate("personal");
      return;
    }
    if (item.action === "apps") {
      onOpenApps();
    }
  };

  const openOnboardingLauncherSetup = () => {
    if (!onboardingSelectedAppSetup?.id) return;
    onOpenLauncherSetup?.(onboardingSelectedAppSetup.id);
  };

  return (
    <section className="home-dashboard" data-testid="home-panel">
      <div className="home-atmosphere" aria-hidden="true" />
      <div className="home-top-controls" aria-label="Home controls">
        <button
          type="button"
          className="home-floating-button"
          data-testid="create-card-button"
          onClick={onCreate}
          aria-label="Add a myBishBash"
        >
          <PlusGlyph />
        </button>
        <button
          type="button"
          className="home-floating-button"
          data-testid="home-apps-button"
          onClick={onOpenApps}
          aria-label="Open apps"
        >
          <AppsGlyph />
        </button>
      </div>

      <div className="home-content">
        <header className="home-brand-hero">
          <img className="home-brand-logo" src={logoSrc} alt="myBishBash" />
          <h1>{greeting}</h1>
          <p>{hasMeaningfulSetup ? `Day ${homeState.usageDays || 1} with myBishBash` : "Welcome to myBishBash"}</p>
        </header>

        <div className="home-card-stack" data-testid="home-dashboard-summary">
          {activationChecklistItems.length > 0 ? (
            <section className="home-activation-checklist" data-testid="home-activation-checklist" aria-labelledby="home-activation-title">
              <h2 id="home-activation-title">Your next step</h2>
              <div className="home-activation-items">
                {activationChecklistItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="home-activation-item"
                    onClick={() => handleChecklistAction(item)}
                  >
                    <span />
                    <strong>{item.label}</strong>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {pendingOnboardingShortcuts.length > 0 ? (
            <button
              type="button"
              className="home-setup-reminder"
              data-testid="home-shortcut-setup-reminder"
              onClick={onOpenApps}
            >
              <span className="home-card-label">Pending setup</span>
              <strong>{pendingOnboardingShortcuts.length} app{pendingOnboardingShortcuts.length === 1 ? "" : "s"} waiting in Apps</strong>
              <span>Finish setup when you are ready.</span>
            </button>
          ) : null}

          {onboardingSelectedAppSetup ? (
            <section className="home-onboarding-setup-card" data-testid="home-onboarding-setup-card" aria-labelledby="home-onboarding-setup-title">
              {onboardingSelectedAppSetup.iconSrc ? (
                <img src={onboardingSelectedAppSetup.iconSrc} alt="" className="home-screen-version-icon" />
              ) : (
                <span className="home-screen-version-icon" aria-hidden="true" />
              )}
              <span className="home-card-label">First app</span>
              <h2 id="home-onboarding-setup-title">Set up {onboardingSelectedAppSetup.label} with myBishBash</h2>
              <p>You picked {onboardingSelectedAppSetup.label} during onboarding. Open its setup page to finish setup.</p>
              <button
                type="button"
                className="pack-button"
                data-testid={`home-onboarding-setup-${onboardingSelectedAppSetup.id}`}
                onClick={openOnboardingLauncherSetup}
              >
                Open setup page
              </button>
            </section>
          ) : null}

          <button
            type="button"
            className="home-progress-card"
            data-testid="home-progress-card"
            onClick={openProgressCard}
            aria-label="Open today’s Personal Cards"
          >
            <HomeProgressRing percent={progressPercent} />
            <span className="home-progress-copy">
              <span className="home-card-label">Today</span>
              <span className="home-progress-number">{progressNumber}</span>
              <span className="home-card-body">{progressCopy}</span>
              {progressSubcopy ? <span className="home-card-subbody">{progressSubcopy}</span> : null}
            </span>
          </button>

          {hasLiveCommitment ? (
            <button
              type="button"
              className="home-commitment-card"
              data-testid="home-live-commitment-card"
              onClick={openCommitmentCard}
              aria-label="Open active commitment"
            >
            <span className="home-commitment-header">
              <span className="home-card-label">{commitmentLabel}</span>
              <span className="home-commitment-count">
                <span className="home-live-dot" aria-hidden="true" />
                {liveCommitmentCountLabel}
              </span>
            </span>
            <span className="home-commitment-title">
              {homeState.activeCommitment.title}
            </span>
            {homeState.activeCommitment?.appName ? (
              <span className="home-app-pill">
                <HomeAppIcon src={homeState.activeCommitment.appIconUrl} />
                <span>{homeState.activeCommitment.appName}</span>
              </span>
            ) : null}
            {homeState.activeCommitment?.metadataText ? (
              <span className="home-commitment-meta">{homeState.activeCommitment.metadataText}</span>
            ) : null}
            {typeof homeState.activeCommitment?.progressPercentage === "number" ? (
              <span className="home-commitment-track" aria-hidden="true">
                <span style={{ width: `${homeState.activeCommitment.progressPercentage}%` }} />
              </span>
            ) : null}
            </button>
          ) : null}
        </div>
        {saveConfirmation ? (
          <p className="home-save-confirmation" role="status">
            Saved “{saveConfirmation}”.
          </p>
        ) : null}
      </div>
    </section>
  );
}
