import { useEffect, useRef, useState } from "react";
import "./landing.css";
import { ContentEditProvider } from "./editing/ContentEditContext";
import { onboardingContent } from "./content/onboardingContent";

export const DEFAULT_INTERRUPTER_CARDS = [
  "Do I actually want to open Instagram right now?",
  "Pause for a second.",
  "Small choices shape days.",
];

export const DEFAULT_ACTION_CARD_TITLES = [
  "Drink water",
  "Back to work",
  "Stretch",
];

export const DEFAULT_PERSONAL_CARD_TEXTS = [
  "Have you taken your vitamins today?",
  "Have you drunk enough water today?",
  "Go outside for five minutes",
  "Read one page",
  "What matters most today?",
  "What's one thing Future You would thank you for?",
];

const PERSONAL_CARD_OPTIONS = [
  {
    id: "vitamins",
    text: "Have you taken your vitamins today?",
  },
  {
    id: "water",
    text: "Have you drunk enough water today?",
  },
  {
    id: "sunscreen",
    text: "Put your sunscreen on.",
  },
  {
    id: "text-mum",
    text: "Text Mum back.",
  },
  {
    id: "outside",
    text: "Take five minutes outside.",
  },
  {
    id: "avoiding",
    text: "Have you done something you’ve been avoiding?",
  },
  {
    id: "stretch",
    text: "Stand up and stretch.",
  },
  {
    id: "eaten",
    text: "Have you eaten properly today?",
  },
];

const HOME_ONBOARDING_LOCATION_ID = "mybishbash_home";
const DEFAULT_ONBOARDING_TIMING_WINDOWS = ["day"];
const PROTECTED_APP_SETUP_PENDING_KEY = "mybishbash.onboarding-protected-app-setup-pending.v1";

const FALLBACK_AVAILABLE_LAUNCHERS = [
  { id: "instagram", displayName: "Instagram", name: "Instagram", category: "social", iconSrc: "/icons/instagram-cover.jpg" },
  { id: "safari", displayName: "Safari", name: "Safari", category: "browser", iconSrc: "/safari-touch-icon.png" },
  { id: "youtube", displayName: "YouTube", name: "YouTube", category: "video", iconSrc: "/icons/youtube-cover.png" },
  { id: "whatsapp", displayName: "WhatsApp", name: "WhatsApp", category: "messaging", iconSrc: "/icons/whatsapp-cover.jpeg" },
  { id: "chrome", displayName: "Chrome", name: "Chrome", category: "browser" },
];
const FIRST_PROTECTED_APP_IDS = ["instagram", "safari", "youtube", "whatsapp", "chrome"];
const APP_INTERRUPTION_DEMOS = {
  instagram: {
    title: "Why Instagram?",
    body: "Watch your own life, not someone else’s.",
  },
  safari: {
    title: "What are you here to do?",
    body: "Open Safari with a reason, not a rabbit hole.",
  },
  youtube: {
    title: "Are you choosing this?",
    body: "Watch with intention, not by accident.",
  },
  whatsapp: {
    title: "Quick check",
    body: "Is this message important right now?",
  },
};

function getLauncherName(launcher) {
  return launcher?.realAppLabel || launcher?.displayName || launcher?.name || launcher?.label || launcher?.id || "App";
}

function getLauncherIcon(launcher) {
  const basePath = getAppBasePath();
  if (!launcher) return `${basePath}/icons/mybishbash-cover.png`;
  const src = launcher.iconSrc || launcher.icon || launcher.customIconSrc || "";
  if (src && (src.startsWith("/mybishbash/") || src.startsWith("/mybishbash-preview/"))) {
    const rebasedPath = src.replace(/^\/mybishbash-preview|^\/mybishbash/, "");
    return `${basePath}${rebasedPath}`;
  }
  if (src && src.startsWith("/")) return `${basePath}${src}`;
  if (src) return src;
  return `${basePath}/icons/mybishbash-cover.png`;
}

function hasLauncherLogo(launcher) {
  return Boolean(launcher?.iconSrc || launcher?.icon || launcher?.customIconSrc);
}

function getFirstProtectedApps(availableLaunchers = []) {
  const availableById = new Map(FALLBACK_AVAILABLE_LAUNCHERS.map((launcher) => [launcher.id, launcher]));
  availableLaunchers
    .filter((launcher) => launcher?.id)
    .forEach((launcher) => {
      availableById.set(launcher.id, {
        ...(availableById.get(launcher.id) ?? {}),
        ...launcher,
        iconSrc: launcher.iconSrc || availableById.get(launcher.id)?.iconSrc,
        icon: launcher.icon || availableById.get(launcher.id)?.icon,
        customIconSrc: launcher.customIconSrc || availableById.get(launcher.id)?.customIconSrc,
      });
    });
  return FIRST_PROTECTED_APP_IDS
    .map((id) => availableById.get(id))
    .filter((launcher) => launcher && hasLauncherLogo(launcher));
}

function getAppBasePath() {
  if (typeof window !== "undefined") {
    const [firstPart] = String(window.location.pathname || "").split("/").filter(Boolean);
    if (firstPart === "mybishbash-preview") return "/mybishbash-preview";
    if (firstPart === "mybishbash") return "/mybishbash";
  }
  const base = import.meta.env.BASE_URL || "/";
  const normalized = `/${base.replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "" : normalized;
}

function getLauncherInstallUrl(launcher) {
  const basePath = getAppBasePath() || "/mybishbash";
  const path = launcher?.installPath ?? `${basePath}/install/${launcher?.id ?? "instagram"}/`;
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

function readPendingProtectedAppSetup() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROTECTED_APP_SETUP_PENDING_KEY) || "null");
    return parsed?.appId ? parsed : null;
  } catch {
    return null;
  }
}

function writePendingProtectedAppSetup(appId, useInterruptionCard = false) {
  if (typeof window === "undefined" || !appId) return;
  window.localStorage.setItem(
    PROTECTED_APP_SETUP_PENDING_KEY,
    JSON.stringify({ appId, status: "install_started", useInterruptionCard, updatedAt: new Date().toISOString() }),
  );
}

function clearPendingProtectedAppSetup() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PROTECTED_APP_SETUP_PENDING_KEY);
}

export default function Onboarding(props) {
  return (
    <ContentEditProvider
      initialContent={onboardingContent}
      storageKey="mybishbash.onboardingContentDraft.v1"
      saveEndpoint="/__save-onboarding-content"
      saveLabel="src/content/onboardingContent.js"
      isContentCompatible={(value) => Boolean(value?.welcome?.title && value?.done?.primary)}
    >
      <OnboardingContent {...props} />
    </ContentEditProvider>
  );
}

function OnboardingContent({
  onSavePersonalSetup,
  onCommitmentDemoComplete,
  onCompleteProtectedAppSetup,
  onSaveProtectedAppPreference,
  onGoHome,
  onSkip,
  renderCommitmentDemoCard,
  renderCommitmentMotivationDemoCard,
  renderCommitmentCheckInDemoCard,
  renderCommitmentEncouragementDemoCard,
  renderCommitmentReviewDemoCard,
  availableLaunchers = [],
}) {
  const pendingProtectedAppSetup = readPendingProtectedAppSetup();
  const initialProtectedAppInterruptionPrefs = pendingProtectedAppSetup?.appId
    ? { [pendingProtectedAppSetup.appId]: Boolean(pendingProtectedAppSetup.useInterruptionCard) }
    : {};
  const [stepIndex, setStepIndex] = useState(() => (
    pendingProtectedAppSetup ? STEPS.indexOf("protected-setup") : 0
  ));
  const [demoComplete, setDemoComplete] = useState(false);
  const [demoReplayKey, setDemoReplayKey] = useState(0);
  const [skipRequested, setSkipRequested] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [customCardText, setCustomCardText] = useState("");
  const [customCardOpen, setCustomCardOpen] = useState(false);
  const [customCards, setCustomCards] = useState([]);
  const [cardSelectionMessage, setCardSelectionMessage] = useState("");
  const [commitmentDemoChoice, setCommitmentDemoChoice] = useState(null);
  const protectedAppOptions = getFirstProtectedApps(availableLaunchers);
  const [selectedProtectedAppId, setSelectedProtectedAppId] = useState(pendingProtectedAppSetup?.appId ?? protectedAppOptions[0]?.id ?? "instagram");
  const [protectedAppSetupPhase, setProtectedAppSetupPhase] = useState(pendingProtectedAppSetup?.status === "install_started" ? "install_started" : "ready");
  const [protectedAppInterruptionPrefs, setProtectedAppInterruptionPrefs] = useState(initialProtectedAppInterruptionPrefs);
  const protectedAppInterruptionPrefsRef = useRef(initialProtectedAppInterruptionPrefs);

  const selectedCards = PERSONAL_CARD_OPTIONS.filter((option) => selectedCardIds.includes(option.id));
  const selectedCardTexts = [
    ...selectedCards.map((option) => option.text),
    ...customCards.map((card) => card.text),
  ].slice(0, 5);
  const canGoBack = stepIndex > 0;
  const currentStep = STEPS[stepIndex] ?? STEPS[0];

  useEffect(() => {
    if (stepIndex !== 0) return undefined;
    setDemoComplete(false);
    const timer = window.setTimeout(() => setDemoComplete(true), 15400);
    return () => window.clearTimeout(timer);
  }, [demoReplayKey, stepIndex]);

  function goNext() {
    setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
  }

  function goBack() {
    const previousProtectedAppStep = commitmentDemoChoice === null
      ? "commitment-intro"
      : "commitment-complete";
    const previousStepByCurrent = {
      "commitment-motivation": "commitment-demo",
      "commitment-review-time": commitmentDemoChoice === "accepted" ? "commitment-demo" : "commitment-motivation",
      "commitment-review": "commitment-review-time",
      "commitment-complete": commitmentDemoChoice === "declined" ? "commitment-motivation" : "commitment-review",
      "protected-app": previousProtectedAppStep,
      "protected-demo": "protected-app",
      "protected-setup": "protected-demo",
    };
    const previousStep = previousStepByCurrent[currentStep];
    if (previousStep) {
      setStepIndex(STEPS.indexOf(previousStep));
      return;
    }
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function showSkipSummary() {
    savePersonalCard();
    setStepIndex(STEPS.indexOf("commitment-intro"));
  }

  function toggleSelectedCard(cardId) {
    setSelectedCardIds((current) => {
      if (current.includes(cardId)) return current.filter((id) => id !== cardId);
      if (selectedCardTexts.length >= 5) {
        setCardSelectionMessage("You can choose up to five.");
        return current;
      }
      setCardSelectionMessage("");
      return [...current, cardId];
    });
  }

  function toggleCustomCard(cardId) {
    setCustomCards((current) => current.filter((card) => card.id !== cardId));
    setCardSelectionMessage("");
  }

  function openCustomCardInput() {
    setCustomCardOpen(true);
    setCardSelectionMessage("");
  }

  function addCustomCard() {
    const text = customCardText.trim();
    if (!text) return;
    if (selectedCardTexts.length >= 5) {
      setCardSelectionMessage("Deselect one card first.");
      return;
    }
    setCustomCards((current) => [
      ...current,
      {
        id: globalThis.crypto?.randomUUID?.() ?? `custom-${Date.now()}-${Math.random()}`,
        text,
      },
    ]);
    setCustomCardText("");
    setCustomCardOpen(false);
    setCardSelectionMessage("");
  }

  function savePersonalCard() {
    onSavePersonalSetup({
      personalCards: selectedCardTexts,
      launcherId: HOME_ONBOARDING_LOCATION_ID,
      selectedLauncherIds: [],
      shortcutSetup: null,
      appContext: {
        id: HOME_ONBOARDING_LOCATION_ID,
        label: "MyBishBash Home",
        launcherId: null,
        selectedLauncherIds: [],
        onboardingSection: "personal_cards",
        timingWindows: DEFAULT_ONBOARDING_TIMING_WINDOWS,
        place: "home",
      },
      timingWindows: DEFAULT_ONBOARDING_TIMING_WINDOWS,
    });
  }

  function saveAndContinue() {
    savePersonalCard();
    setStepIndex(STEPS.indexOf("commitment-intro"));
  }

  function skipCommitmentDemo() {
    onCommitmentDemoComplete?.({ skipped: true });
    setStepIndex(STEPS.indexOf("protected-app"));
  }

  function startCommitmentDemo() {
    setCommitmentDemoChoice(null);
    setStepIndex(STEPS.indexOf("commitment-demo"));
  }

  function handleCommitmentDemoAction(action) {
    if (action === "commit" || action === "commit_after_all") {
      setCommitmentDemoChoice("accepted");
      setStepIndex(STEPS.indexOf("commitment-review-time"));
      return;
    }
    if (action === "decline_after_motivation") {
      setCommitmentDemoChoice("declined");
      setStepIndex(STEPS.indexOf("commitment-complete"));
      return;
    }
    setCommitmentDemoChoice("declined");
    setStepIndex(STEPS.indexOf("commitment-motivation"));
  }

  function handleCommitmentReviewAction() {
    setStepIndex(STEPS.indexOf("commitment-complete"));
  }

  function completeCommitmentDemo() {
    onCommitmentDemoComplete?.({ skipped: false });
    setStepIndex(STEPS.indexOf("protected-app"));
  }

  function continueToProtectedAppDemo() {
    clearPendingProtectedAppSetup();
    setProtectedAppSetupPhase("ready");
    setStepIndex(STEPS.indexOf("protected-demo"));
  }

  function continueToProtectedAppSetup() {
    saveProtectedAppInterruptionPreference(selectedProtectedAppId, getSelectedProtectedAppInterruptionEnabled());
    setStepIndex(STEPS.indexOf("protected-setup"));
  }

  function selectProtectedApp(appId) {
    clearPendingProtectedAppSetup();
    setSelectedProtectedAppId(appId);
    setProtectedAppSetupPhase("ready");
  }

  function getSelectedProtectedAppInterruptionEnabled() {
    return protectedAppInterruptionPrefsRef.current[selectedProtectedAppId] ?? false;
  }

  function saveProtectedAppInterruptionPreference(appId, enabled) {
    if (!appId) return;
    protectedAppInterruptionPrefsRef.current = {
      ...protectedAppInterruptionPrefsRef.current,
      [appId]: enabled,
    };
    setProtectedAppInterruptionPrefs((current) => ({ ...current, [appId]: enabled }));
    onSaveProtectedAppPreference?.({
      appId,
      useInterruptionCard: enabled,
    });
  }

  function openProtectedAppInstall() {
    const installUrl = getLauncherInstallUrl(selectedProtectedApp);
    writePendingProtectedAppSetup(selectedProtectedApp?.id, getSelectedProtectedAppInterruptionEnabled());
    setProtectedAppSetupPhase("install_started");
    const opened = window.open(installUrl, "_blank", "noopener,noreferrer");
    if (opened) return;
    window.location.assign(installUrl);
  }

  function confirmProtectedAppSaved() {
    clearPendingProtectedAppSetup();
    setProtectedAppSetupPhase("confirmed");
  }

  function finishProtectedAppSetup({ completed }) {
    clearPendingProtectedAppSetup();
    onCompleteProtectedAppSetup?.({
      appId: selectedProtectedAppId,
      completed,
      useInterruptionCard: getSelectedProtectedAppInterruptionEnabled(),
    });
    onGoHome?.();
  }

  const selectedProtectedApp = protectedAppOptions.find((app) => app.id === selectedProtectedAppId) ?? protectedAppOptions[0];
  const selectedProtectedAppName = getLauncherName(selectedProtectedApp);

  return (
    <div className="overlay-screen onboarding-screen">
      <div className="onboarding-shell">
        <header className="onboarding-brand">
          <img className="onboarding-logo" src={`${import.meta.env.BASE_URL}icons/mybishbash-cover.png`} alt="MyBishBash logo" />
          <h1>MyBishBash</h1>
        </header>

        <section className="onboarding-flow-card" aria-live="polite">
          <StepIndicator currentIndex={stepIndex} total={STEPS.length} />

          {currentStep === "learn" ? (
            <OnboardingStep
              title="Before your apps open"
              body="MyBishBash shows a personal reminder before selected apps, so your phone can bring you back to what you meant to do."
              primaryLabel="Create your first card"
              onPrimary={goNext}
              primaryDisabled={!demoComplete}
              secondaryLabel="Skip Personal Cards for now"
              onSecondary={showSkipSummary}
            >
              <TutorialDemoIntro
                key={demoReplayKey}
                isComplete={demoComplete}
                onReplay={() => setDemoReplayKey((current) => current + 1)}
              />
            </OnboardingStep>
          ) : null}

          {currentStep === "intention" ? (
            <OnboardingStep
              className="onboarding-step-card-selection"
              title="Things I genuinely mean to do, but don’t always remember."
              body="Choose up to five. These will become your first Personal Cards."
              primaryLabel="Continue"
              onPrimary={saveAndContinue}
              secondaryLabel="Skip Personal Cards for now"
              onSecondary={showSkipSummary}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <ReminderIdeaGrid
                options={PERSONAL_CARD_OPTIONS}
                selectedIds={selectedCardIds}
                selectedCount={selectedCardTexts.length}
                customCards={customCards}
                customCardOpen={customCardOpen}
                customCardText={customCardText}
                message={cardSelectionMessage}
                onToggle={toggleSelectedCard}
                onToggleCustom={toggleCustomCard}
                onOpenCustom={openCustomCardInput}
                onCustomTextChange={setCustomCardText}
                onAddCustom={addCustomCard}
              />
            </OnboardingStep>
          ) : null}

          {currentStep === "commitment-intro" ? (
            <OnboardingStep
              className="onboarding-commitment-intro-step"
              title="Make plans. Not just reminders."
              primaryLabel="Show me"
              onPrimary={startCommitmentDemo}
              secondaryLabel="Skip Commitment Cards for now"
              onSecondary={skipCommitmentDemo}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <div className="onboarding-commitment-intro-copy">
                <p>Personal Cards help you remember.</p>
                <p>Commitment Cards help you follow through.</p>
                <p>When you accept a commitment, MyBishBash checks back later and asks how it went.</p>
              </div>
            </OnboardingStep>
          ) : null}

          {currentStep === "commitment-demo" ? (
            <OnboardingCommitmentDemoStage
              canGoBack={canGoBack}
              onBack={goBack}
              dataTestId="commitment-card-demo"
            >
              {renderCommitmentDemoCard?.({ onCommitmentAction: handleCommitmentDemoAction })}
            </OnboardingCommitmentDemoStage>
          ) : null}

          {currentStep === "commitment-motivation" ? (
            <OnboardingCommitmentDemoStage
              canGoBack={canGoBack}
              onBack={goBack}
              dataTestId="commitment-motivation-demo"
            >
              {renderCommitmentMotivationDemoCard?.({ onCommitmentAction: handleCommitmentDemoAction })}
            </OnboardingCommitmentDemoStage>
          ) : null}

          {currentStep === "commitment-review-time" ? (
            <CommitmentTimePassage
              label="Later..."
              body="At the end, MyBishBash helps you reflect."
              onComplete={() => setStepIndex(STEPS.indexOf("commitment-review"))}
              canGoBack={canGoBack}
              onBack={goBack}
            />
          ) : null}

          {currentStep === "commitment-review" ? (
            <OnboardingCommitmentDemoStage
              canGoBack={canGoBack}
              onBack={goBack}
              dataTestId="commitment-review-demo"
            >
              {renderCommitmentReviewDemoCard?.({ onReviewAction: handleCommitmentReviewAction })}
            </OnboardingCommitmentDemoStage>
          ) : null}

          {currentStep === "commitment-complete" ? (
            <OnboardingStep
              className="onboarding-commitment-complete-step"
              title="Commitment Cards help you follow through on the things that matter to you."
              body="You won’t create any Commitment Cards during setup. You can create them later when you’re using MyBishBash."
              primaryLabel="Continue"
              onPrimary={completeCommitmentDemo}
              canGoBack={canGoBack && commitmentDemoChoice !== "accepted"}
              onBack={goBack}
            />
          ) : null}

          {currentStep === "protected-app" ? (
            <OnboardingStep
              title="Install Your First MyBishBash App"
              body="Choose an app you use regularly."
              primaryLabel="Continue"
              onPrimary={continueToProtectedAppDemo}
              secondaryLabel={protectedAppSetupPhase === "confirmed" ? null : "Choose an app later"}
              onSecondary={() => finishProtectedAppSetup({ completed: false })}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <ProtectedAppChoiceGrid
                apps={protectedAppOptions}
                selectedId={selectedProtectedAppId}
                onSelect={selectProtectedApp}
              />
            </OnboardingStep>
          ) : null}

          {currentStep === "protected-demo" ? (
            <OnboardingStep
              title={`Before ${selectedProtectedAppName} opens`}
              body={`Would you like to enable an interruption card before ${selectedProtectedAppName} opens?`}
              primaryLabel={`Install ${selectedProtectedAppName} Launcher`}
              onPrimary={continueToProtectedAppSetup}
              secondaryLabel="Choose an app later"
              onSecondary={() => finishProtectedAppSetup({ completed: false })}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <ProtectedAppInterruptionDemo
                app={selectedProtectedApp}
                enabled={getSelectedProtectedAppInterruptionEnabled()}
                onChange={(enabled) => saveProtectedAppInterruptionPreference(selectedProtectedAppId, enabled)}
              />
            </OnboardingStep>
          ) : null}

          {currentStep === "protected-setup" ? (
            <OnboardingStep
              className="onboarding-protected-setup-step"
              title={protectedAppSetupPhase === "confirmed" ? `${selectedProtectedAppName} Launcher Ready` : `Install ${selectedProtectedAppName} Launcher`}
              body={protectedAppSetupPhase === "confirmed"
                ? `${selectedProtectedAppName} is now ready to use with MyBishBash.`
                : `See your Personal Cards before opening ${selectedProtectedAppName}.`}
              primaryLabel={protectedAppSetupPhase === "confirmed"
                ? "Continue to Home"
                : protectedAppSetupPhase === "install_started"
                  ? "I’ve saved it"
                  : `Add ${selectedProtectedAppName} Launcher`}
              onPrimary={() => {
                if (protectedAppSetupPhase === "confirmed") {
                  finishProtectedAppSetup({ completed: true });
                  return;
                }
                if (protectedAppSetupPhase === "install_started") {
                  confirmProtectedAppSaved();
                  return;
                }
                openProtectedAppInstall();
              }}
              secondaryLabel={protectedAppSetupPhase === "confirmed" ? null : "Choose an app later"}
              onSecondary={() => finishProtectedAppSetup({ completed: false })}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <ProtectedAppSetupCard
                app={selectedProtectedApp}
                phase={protectedAppSetupPhase}
              />
            </OnboardingStep>
          ) : null}

          {currentStep === "skip" ? (
            <OnboardingStep
              title="You can set up your first card later."
              body="Personal Cards live in MyBishBash. When you are ready, create one reminder and let your phone bring you back to what matters."
              primaryLabel="Go to Home"
              onPrimary={onSkip}
              canGoBack={!skipRequested}
              onBack={goBack}
            >
              <OnboardingDemoCard text="What matters most today?" timing="When you need the nudge" place="MyBishBash Home" />
            </OnboardingStep>
          ) : null}
        </section>
      </div>
    </div>
  );
}

const STEPS = [
  "learn",
  "intention",
  "commitment-intro",
  "commitment-demo",
  "commitment-motivation",
  "commitment-review-time",
  "commitment-review",
  "commitment-complete",
  "protected-app",
  "protected-demo",
  "protected-setup",
  "skip",
];

function OnboardingCommitmentDemoStage({ children, canGoBack, onBack, dataTestId }) {
  return (
    <div className="onboarding-step onboarding-commitment-real-step" data-testid={dataTestId}>
      <div className="onboarding-step-top">
        {canGoBack ? (
          <button type="button" className="onboarding-back-button" onClick={onBack} aria-label="Go back">
            Back
          </button>
        ) : null}
      </div>
      <div className="onboarding-commitment-real-stage">
        {children}
      </div>
    </div>
  );
}

function CommitmentTimePassage({ label = "Great.", body = "We'll check back later.", onComplete, canGoBack, onBack }) {
  return (
    <div className="onboarding-step onboarding-commitment-time-step" data-testid="commitment-time-passage">
      <div className="onboarding-step-top">
        {canGoBack ? (
          <button type="button" className="onboarding-back-button" onClick={onBack} aria-label="Go back">
            Back
          </button>
        ) : null}
      </div>
      <div className="onboarding-commitment-time">
        <div className="onboarding-time-ring" aria-hidden="true">
          <span />
        </div>
        <h2>{label}</h2>
        <p>{body}</p>
        <button type="button" className="onboarding-time-next" onClick={onComplete}>
          Next
        </button>
      </div>
    </div>
  );
}

function ReminderIdeaGrid({
  options,
  selectedIds,
  selectedCount,
  customCards,
  customCardOpen,
  customCardText,
  message,
  onToggle,
  onToggleCustom,
  onOpenCustom,
  onCustomTextChange,
  onAddCustom,
}) {
  const cleanCustomText = customCardText.trim();
  return (
    <div className="onboarding-reminder-picker">
      <div className="onboarding-selection-count" aria-live="polite">
        <span>{selectedCount} of 5 selected</span>
      </div>
      {message ? <p className="onboarding-selection-message" aria-live="polite">{message}</p> : null}
      <div className="onboarding-idea-grid" role="group" aria-label="Choose Personal Cards">
        {options.map((option) => {
          const selected = selectedIds.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              className={`onboarding-idea-card ${selected ? "selected" : ""}`}
              onClick={() => onToggle(option.id)}
              aria-pressed={selected}
            >
              <strong>{option.text}</strong>
              {selected ? <span className="onboarding-idea-check" aria-hidden="true">✓</span> : null}
            </button>
          );
        })}
        {customCards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="onboarding-idea-card selected"
            onClick={() => onToggleCustom(card.id)}
            aria-pressed="true"
          >
            <strong>{card.text}</strong>
            <span className="onboarding-idea-check" aria-hidden="true">✓</span>
          </button>
        ))}
        {customCardOpen ? (
          <div className="onboarding-custom-card">
            <label>
              <span>Write my own</span>
              <input
                type="text"
                value={customCardText}
                onChange={(event) => onCustomTextChange(event.target.value)}
                placeholder="Write your own reminder…"
                maxLength={140}
              />
            </label>
            <button type="button" onClick={onAddCustom} disabled={!cleanCustomText}>
              Add
            </button>
          </div>
        ) : (
          <button type="button" className="onboarding-idea-card onboarding-write-own-card" onClick={onOpenCustom}>
            <strong>Write my own</strong>
          </button>
        )}
      </div>
    </div>
  );
}

function ProtectedAppChoiceGrid({ apps, selectedId, onSelect }) {
  return (
    <div className="onboarding-protected-app-grid" role="radiogroup" aria-label="Choose your first app">
      {apps.map((app) => {
        const selected = app.id === selectedId;
        return (
          <button
            key={app.id}
            type="button"
            className={`onboarding-protected-app-card ${selected ? "selected" : ""}`}
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(app.id)}
          >
            <OnboardingAppIcon launcher={app} />
            <strong>{getLauncherName(app)}</strong>
          </button>
        );
      })}
    </div>
  );
}

function ProtectedAppInterruptionDemo({ app, enabled, onChange }) {
  const appName = getLauncherName(app);
  const demo = APP_INTERRUPTION_DEMOS[app?.id] ?? {
    title: `Before ${appName}`,
    body: "Open with intention.",
  };
  return (
    <div className="onboarding-interruption-demo" data-testid="onboarding-interruption-demo">
      <article className="onboarding-interruption-example-card">
        <p className="onboarding-demo-card-greeting">MYBISHBASH</p>
        <span className="onboarding-demo-card-heart" aria-hidden="true">
          <HeartGlyph />
        </span>
        <h3>{demo.title}</h3>
        <i aria-hidden="true" />
        <p>{demo.body}</p>
        <div className="onboarding-real-card-actions">
          <button type="button">Continue to {appName}</button>
          <button type="button">Not now</button>
        </div>
      </article>
      <p className="onboarding-interruption-demo-note">This is an example of an interruption card.</p>
      <div className="onboarding-interruption-toggle" data-testid="onboarding-interruption-toggle">
        <span>Interruption card</span>
        <div role="group" aria-label="Interruption card">
          <button
            type="button"
            className={enabled ? "selected" : ""}
            aria-pressed={enabled}
            onClick={() => onChange(true)}
          >
            On
          </button>
          <button
            type="button"
            className={!enabled ? "selected" : ""}
            aria-pressed={!enabled}
            onClick={() => onChange(false)}
          >
            Off
          </button>
        </div>
        <p>You can change this later.</p>
      </div>
    </div>
  );
}

function ProtectedAppSetupCard({ app, phase = "ready" }) {
  const appName = getLauncherName(app);
  const isConfirmed = phase === "confirmed";
  const steps = [
    `Tap Add ${appName} Launcher.`,
    "Tap Share.",
    "Tap Add to Home Screen.",
    "Keep the suggested name.",
    "Return to MyBishBash to continue.",
  ];
  return (
    <article className="onboarding-protected-setup-card" data-testid="onboarding-protected-app-setup">
      <div className="onboarding-protected-setup-heading">
        <OnboardingAppIcon launcher={app} />
        <div>
          <p>{isConfirmed ? "Marked as saved" : "Home Screen launcher"}</p>
          <h3>{appName}</h3>
        </div>
      </div>
      {isConfirmed ? (
        <div className="onboarding-protected-confirmation" data-testid="onboarding-protected-app-confirmation">
          <strong>{appName} launcher ready</strong>
          <p>{appName} is now ready to use with MyBishBash.</p>
          <p>Move the MyBishBash {appName} launcher to where {appName} normally sits on your Home Screen. Put the original {appName} app in a folder so you open MyBishBash first.</p>
        </div>
      ) : (
        <>
          <p>Add the {appName} launcher to your Home Screen.</p>
          <div className="onboarding-install-guidance" data-testid="onboarding-install-guidance">
            <ol className="onboarding-install-steps">
              {steps.map((step, index) => (
                <li key={step}>
                  <span className="onboarding-install-step-marker" aria-hidden="true">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="onboarding-install-return-note">
            Once it is saved, return to MyBishBash to continue.
          </p>
        </>
      )}
    </article>
  );
}

function OnboardingAppIcon({ launcher, className = "" }) {
  const [failed, setFailed] = useState(false);
  const label = getLauncherName(launcher);
  const hasIcon = Boolean(launcher?.iconSrc || launcher?.icon || launcher?.customIconSrc);
  if (failed || !hasIcon) {
    return (
      <span className={`onboarding-app-icon-fallback ${className}`.trim()} aria-hidden="true">
        {label.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className={className}
      src={getLauncherIcon(launcher)}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

function HeartGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20s-6.6-4.18-8.48-8.26C2.1 8.66 3.78 5.5 6.8 5.5c1.75 0 3.12.9 4.02 2.18C11.72 6.4 13.1 5.5 14.85 5.5c3.02 0 4.7 3.16 3.28 6.24C16.25 15.82 12 20 12 20Z" />
    </svg>
  );
}

function TutorialDemoIntro({ isComplete = false, onReplay }) {
  const instagram = FALLBACK_AVAILABLE_LAUNCHERS.find((launcher) => launcher.id === "instagram");
  const whatsapp = FALLBACK_AVAILABLE_LAUNCHERS.find((launcher) => launcher.id === "whatsapp");
  return (
    <div className="onboarding-tutorial-demo" data-testid="onboarding-tutorial-demo" aria-label="MyBishBash opening demo">
      <div className="onboarding-demo-orbit" aria-hidden="true" />
      <div className="onboarding-demo-phone-screen" aria-hidden="true">
        <span className="onboarding-demo-phone-app onboarding-demo-phone-app-instagram">
          <OnboardingAppIcon launcher={instagram} />
          <span>Instagram</span>
        </span>
        <span className="onboarding-demo-phone-app onboarding-demo-phone-app-whatsapp">
          <OnboardingAppIcon launcher={whatsapp} />
          <span>WhatsApp</span>
        </span>
      </div>
      <div className="onboarding-demo-app onboarding-demo-app-instagram">
        <OnboardingAppIcon launcher={instagram} />
        <span>Opening Instagram</span>
      </div>
      <div className="onboarding-demo-app onboarding-demo-app-whatsapp">
        <OnboardingAppIcon launcher={whatsapp} />
        <span>Opening WhatsApp</span>
      </div>
      <div className="onboarding-demo-cursor" aria-hidden="true" />
      <span className="onboarding-demo-click-ripple" aria-hidden="true" />
      <article className="onboarding-demo-real-card onboarding-demo-real-card-instagram">
        <span className="onboarding-demo-card-greeting">Good afternoon</span>
        <span className="onboarding-demo-card-heart" aria-hidden="true">
          <HeartGlyph />
        </span>
        <h3>Have you taken your vitamins today?</h3>
        <i aria-hidden="true" />
        <p>A gentle nudge from the version of you that cares.</p>
        <div className="onboarding-real-card-actions" aria-label="Example card choices">
          <button type="button">Done</button>
          <button type="button">I’ll do it now</button>
          <button type="button">Not done</button>
        </div>
      </article>
      <article className="onboarding-demo-real-card onboarding-demo-real-card-whatsapp">
        <span className="onboarding-demo-card-greeting">Good afternoon</span>
        <span className="onboarding-demo-card-heart" aria-hidden="true">
          <HeartGlyph />
        </span>
        <h3>Have you put your sunscreen on today?</h3>
        <i aria-hidden="true" />
        <p>A small reminder before the next thing takes over.</p>
        <div className="onboarding-real-card-actions" aria-label="Example card choices">
          <button type="button">Done</button>
          <button type="button">I’ll do it now</button>
          <button type="button">Not done</button>
        </div>
      </article>
      <article className="onboarding-demo-continue-card onboarding-demo-continue-card-instagram">
        <span>Ready</span>
        <strong>Continue to Instagram</strong>
      </article>
      <article className="onboarding-demo-continue-card onboarding-demo-continue-card-whatsapp">
        <span>Ready</span>
        <strong>Continue to WhatsApp</strong>
      </article>
      <div className="onboarding-demo-app-open onboarding-demo-app-open-instagram">
        <OnboardingAppIcon launcher={instagram} />
        <span>Instagram opens</span>
      </div>
      <div className="onboarding-demo-app-open onboarding-demo-app-open-whatsapp">
        <OnboardingAppIcon launcher={whatsapp} />
        <span>WhatsApp opens</span>
      </div>
      <p className="onboarding-demo-final-line">For the things you genuinely mean to do.</p>
      {isComplete ? (
        <button type="button" className="onboarding-demo-replay" onClick={onReplay}>
          Replay
        </button>
      ) : null}
    </div>
  );
}

function OnboardingDemoCard({ text, timing, place }) {
  return (
    <div className="onboarding-demo-stage" aria-label="Personal Card example">
      <article className="onboarding-demo-phone">
        <span className="onboarding-demo-kicker">Personal Card</span>
        <h3>{text}</h3>
        <p>A gentle interruption before the next automatic moment.</p>
        <div className="onboarding-demo-actions" aria-hidden="true">
          <span>Done</span>
          <span>I’ll do it now</span>
          <span>Not done</span>
        </div>
      </article>
      <div className="onboarding-demo-notes" aria-label="What this card does">
        <span>Your words</span>
        <span>{timing}</span>
        <span>{place}</span>
      </div>
    </div>
  );
}

function PersonalCardPreview({ text, timing, place, compact = false, highlight = null }) {
  return (
    <article className={`onboarding-personal-preview ${compact ? "compact" : ""}`} data-testid="personal-card-onboarding-preview">
      <p>Personal Card</p>
      <h3 className={highlight === "text" ? "is-highlighted" : ""}>{text}</h3>
      <dl>
        <div className={highlight === "timing" ? "is-highlighted" : ""}>
          <dt>When</dt>
          <dd>{timing}</dd>
        </div>
        <div className={highlight === "place" ? "is-highlighted" : ""}>
          <dt>Where</dt>
          <dd>{place}</dd>
        </div>
      </dl>
    </article>
  );
}

function OnboardingStep({
  className = "",
  title,
  body,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  canGoBack = false,
  onBack,
  primaryDisabled = false,
}) {
  return (
    <div className={`onboarding-step ${className}`.trim()}>
      <div className="onboarding-step-top">
        {canGoBack ? (
          <button type="button" className="onboarding-back-button" onClick={onBack} aria-label="Go back">
            Back
          </button>
        ) : null}
      </div>
      <div className="onboarding-step-copy">
        <h2>{title}</h2>
        {body ? <p>{body}</p> : null}
      </div>
      {children ? <div className="onboarding-step-body">{children}</div> : null}
      <div className="onboarding-actions">
        {primaryLabel ? (
          <button type="button" className="save-button" onClick={onPrimary} disabled={primaryDisabled}>
            {primaryLabel}
          </button>
        ) : null}
        {secondaryLabel ? (
          <button type="button" className="secondary-button" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StepIndicator({ currentIndex, total }) {
  return (
    <div
      className="onboarding-step-indicator"
      aria-label={`Step ${currentIndex + 1} of ${total}`}
      style={{ "--onboarding-step": currentIndex + 1, "--onboarding-total": total }}
    >
      {Array.from({ length: total }).map((_, index) => (
        <span key={index} className={index === currentIndex ? "active" : ""} />
      ))}
    </div>
  );
}
