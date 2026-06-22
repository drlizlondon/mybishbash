import { useEffect, useRef, useState } from "react";
import "./landing.css";
import { ContentEditProvider, EditableText, EditPanel, useContentEdit } from "./editing/ContentEditContext";
import { onboardingContent } from "./content/onboardingContent";
import { getGreeting } from "./utils";
import { BrandMark } from "./components/BrandMark";

const ONBOARDING_DEMO_CTA_UNLOCK_MS = 11000;

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
  "Have you done something that counts towards your fitness today?",
  "Have you reflected on a moment you are grateful for?",
  "Have you got your bag ready for tomorrow?",
  "Have you taken your vitamins?",
  "Have you done your face routine?",
  "Have you watered the plants?",
  "Have you read your Bible?",
  "Have you taken your antihistamine?",
];

const STARTER_PERSONAL_CARD_TEXTS = [
  "Have you done something that counts towards your fitness today?",
  "Have you taken your vitamins?",
  "Have you drunk enough water?",
  "Have you reflected on something you’re grateful for?",
  "Have you got your bag ready for tomorrow?",
  "Have you messaged someone you care about?",
  "Have you stretched today?",
  "Have you taken your medication?",
  "Have you read something today?",
  "Have you eaten something nourishing today?",
  "Have you done one small thing for your home today?",
];

const PERSONAL_CARD_OPTIONS = STARTER_PERSONAL_CARD_TEXTS.map((text) => ({
  id: `starter-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
  text,
}));

export const DEFAULT_PERSONAL_CARD_TEXTS_LEGACY = [
  "Have you taken your vitamins today?",
  "Drink some water.",
  "Put your sunscreen on.",
  "Text Mum back.",
  "Take five minutes outside.",
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
    title: "Why Instagram right now?",
    body: "Are you choosing this, or did your thumb just take you here?",
  },
  safari: {
    title: "What are you here to do?",
    body: "Search with a reason, not a rabbit hole.",
  },
  youtube: {
    title: "What are you here to watch?",
    body: "One video, or a rabbit hole?",
  },
  whatsapp: {
    title: "Is this message important right now?",
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
  if ((window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && path.endsWith("/")) {
    return new URL(`${path}index.html`, window.location.origin).toString();
  }
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

function writePendingProtectedAppSetup(appId, useInterruptionCard = false, status = "install_started") {
  if (typeof window === "undefined" || !appId) return;
  window.localStorage.setItem(
    PROTECTED_APP_SETUP_PENDING_KEY,
    JSON.stringify({ appId, status, useInterruptionCard, updatedAt: new Date().toISOString() }),
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
      storageKey="mybishbash.onboardingContentDraft.v4"
      saveEndpoint="/__save-onboarding-content"
      saveLabel="src/content/onboardingContent.js"
      isContentCompatible={(value) => Boolean(value?.steps?.learn?.title && value?.done?.primary)}
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
  const { content } = useContentEdit();
  const initialProtectedAppInterruptionPrefs = pendingProtectedAppSetup?.appId
    ? { [pendingProtectedAppSetup.appId]: Boolean(pendingProtectedAppSetup.useInterruptionCard) }
    : {};
  const [stepIndex, setStepIndex] = useState(() => (
    pendingProtectedAppSetup?.status === "confirmed"
      ? STEPS.indexOf("protected-setup")
      : pendingProtectedAppSetup?.status === "install_started" || pendingProtectedAppSetup?.status === "ready"
        ? STEPS.indexOf("protected-setup")
        : 0
  ));
  const [demoComplete, setDemoComplete] = useState(false);
  const [demoReplayKey, setDemoReplayKey] = useState(0);
  const [skipRequested, setSkipRequested] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [customCardText, setCustomCardText] = useState("");
  const [customCardOpen, setCustomCardOpen] = useState(false);
  const [customCards, setCustomCards] = useState([]);
  const [cardSelectionMessage, setCardSelectionMessage] = useState("");
  const protectedAppOptions = getFirstProtectedApps(availableLaunchers);
  const [selectedProtectedAppId, setSelectedProtectedAppId] = useState(pendingProtectedAppSetup?.appId ?? protectedAppOptions[0]?.id ?? "instagram");
  const [protectedAppSetupPhase, setProtectedAppSetupPhase] = useState(
    ["ready", "install_started", "confirmed"].includes(pendingProtectedAppSetup?.status)
      ? pendingProtectedAppSetup.status
      : "ready",
  );
  const [protectedAppInterruptionPrefs, setProtectedAppInterruptionPrefs] = useState(initialProtectedAppInterruptionPrefs);
  const protectedAppInterruptionPrefsRef = useRef(initialProtectedAppInterruptionPrefs);

  const orderedPersonalCardOptions = PERSONAL_CARD_OPTIONS;
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
    const timer = window.setTimeout(() => setDemoComplete(true), ONBOARDING_DEMO_CTA_UNLOCK_MS);
    return () => window.clearTimeout(timer);
  }, [demoReplayKey, stepIndex]);

  function goNext() {
    setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
  }

  function goBack() {
    const previousStepByCurrent = {
      intention: "learn",
      "protected-app": "intention",
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
    setStepIndex(STEPS.indexOf("skip"));
  }

  function toggleSelectedCard(cardId) {
    setSelectedCardIds((current) => {
      if (current.includes(cardId)) return current.filter((id) => id !== cardId);
      if (selectedCardTexts.length >= 5) {
        setCardSelectionMessage(content.steps?.intention?.limitMessage ?? "You can choose up to five.");
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
      setCardSelectionMessage(content.steps?.intention?.deselectMessage ?? "Deselect one card first.");
      return;
    }
    if (text.length > 96) {
      setCardSelectionMessage(content.steps?.intention?.tooLongMessage ?? "Keep it a bit shorter.");
      return;
    }
    const normalizedText = normalizePersonalCardText(text);
    const existingTexts = [
      ...PERSONAL_CARD_OPTIONS.map((option) => option.text),
      ...customCards.map((card) => card.text),
    ].map(normalizePersonalCardText);
    if (existingTexts.includes(normalizedText)) {
      setCardSelectionMessage(content.steps?.intention?.duplicateMessage ?? "That card is already selected.");
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
      selectedStrategyAreaIds: [],
      personalCards: selectedCardTexts,
      selectedStarterPackId: "",
      starterCommitment: null,
      launcherId: HOME_ONBOARDING_LOCATION_ID,
      selectedLauncherIds: [],
      shortcutSetup: null,
      appContext: {
        id: HOME_ONBOARDING_LOCATION_ID,
        label: "myBishBash Home",
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
    onCommitmentDemoComplete?.({ skipped: true });
    setStepIndex(STEPS.indexOf("protected-app"));
  }

  function continueToProtectedAppSetup() {
    saveProtectedAppInterruptionPreference(selectedProtectedAppId, getSelectedProtectedAppInterruptionEnabled());
    writePendingProtectedAppSetup(selectedProtectedApp?.id, getSelectedProtectedAppInterruptionEnabled(), "ready");
    setProtectedAppSetupPhase("ready");
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
    writePendingProtectedAppSetup(selectedProtectedApp?.id, getSelectedProtectedAppInterruptionEnabled(), "install_started");
    setProtectedAppSetupPhase("install_started");
    window.location.assign(installUrl);
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
          <BrandMark className="onboarding-logo" alt="myBishBash logo" />
          <h1>myBishBash</h1>
        </header>

        <section className="onboarding-flow-card" aria-live="polite">
          <StepIndicator currentIndex={stepIndex} total={STEPS.length} />

          {currentStep === "learn" ? (
            <OnboardingStep
              className="onboarding-learn-step"
              titlePath="steps.learn.title"
              title="Start with your Personal Cards"
              bodyPath="steps.learn.body"
              body="You already open your favourite apps every day. myBishBash uses those moments to bring up Personal Cards for the things you genuinely mean to do."
              primaryPath="steps.learn.primary"
              primaryLabel="Set up my Personal Cards"
              onPrimary={goNext}
              primaryDisabled={!demoComplete}
              secondaryPath="steps.learn.secondary"
              secondaryLabel="I’ll do this later"
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
              titlePath="steps.intention.title"
              title="Let’s start with a few things you’d like to remember more often."
              bodyPath="steps.intention.body"
              body="Choose up to 5. You can edit them or write your own."
              primaryPath="steps.intention.primary"
              primaryLabel="Continue"
              onPrimary={saveAndContinue}
              primaryDisabled={selectedCardTexts.length === 0}
              secondaryPath="steps.intention.secondary"
              secondaryLabel="Skip reminders"
              onSecondary={showSkipSummary}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <ReminderIdeaGrid
                options={orderedPersonalCardOptions}
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
                selectedLabel={content.steps?.intention?.selectedLabel ?? "selected"}
                writeOwnLabel={content.steps?.intention?.writeOwn ?? "Write my own"}
                customPlaceholder={content.steps?.intention?.customPlaceholder ?? "Write your own reminder…"}
                addCustomLabel={content.steps?.intention?.addCustom ?? "Add"}
              />
            </OnboardingStep>
          ) : null}

          {currentStep === "protected-app" ? (
            <OnboardingStep
              titlePath="steps.protectedApp.title"
              title="Where should myBishBash appear first?"
              bodyPath="steps.protectedApp.body"
              body="Choose one app you open often. You can add more later."
              primaryPath="steps.protectedApp.primary"
              primaryLabel="Continue"
              onPrimary={() => setStepIndex(STEPS.indexOf("protected-demo"))}
              secondaryPath="steps.protectedApp.secondary"
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
              title={<><EditableText path="steps.protectedDemo.titlePrefix">Add an extra</EditableText> {selectedProtectedAppName} <EditableText path="steps.protectedDemo.titleSuffix">prompt?</EditableText></>}
              body={<><EditableText path="steps.protectedDemo.bodyPrefix">App Prompts add one extra question before</EditableText> {selectedProtectedAppName} <EditableText path="steps.protectedDemo.bodySuffix">opens.</EditableText></>}
              primaryLabel={<EditableText path="steps.protectedDemo.primaryPrefix">Continue</EditableText>}
              onPrimary={continueToProtectedAppSetup}
              secondaryPath="steps.protectedDemo.secondary"
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
              title={
                protectedAppSetupPhase === "confirmed"
                  ? <EditableText path="steps.protectedSetup.confirmedTitle">You’re set up</EditableText>
                  : <>Add {selectedProtectedAppName} to your Home Screen</>
              }
              body={
                protectedAppSetupPhase === "confirmed"
                  ? (content.steps?.protectedSetup?.confirmedBody ?? "Use your new {appName} icon when you want myBishBash to appear before {appName}. You can change this later in Apps.").replaceAll("{appName}", selectedProtectedAppName)
                  : "Add this version to your Home Screen. Use it instead of the original app icon when you want myBishBash to appear first."
              }
              primaryLabel={
                protectedAppSetupPhase === "confirmed"
                  ? <EditableText path="steps.protectedSetup.continueHome">Go to Home</EditableText>
                  : "Open install page"
              }
              onPrimary={() => {
                if (protectedAppSetupPhase === "confirmed") {
                  finishProtectedAppSetup({ completed: true });
                  return;
                }
                openProtectedAppInstall();
              }}
              secondaryLabel={protectedAppSetupPhase === "confirmed" ? null : "I’ll do this later"}
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
              titlePath="steps.skip.title"
              title="You can set up your first card later."
              bodyPath="steps.skip.body"
              body="Personal Cards live in myBishBash. When you are ready, create one reminder and let your phone bring you back to what matters."
              primaryPath="steps.skip.primary"
              primaryLabel="Go to Home"
              onPrimary={onSkip}
              canGoBack={!skipRequested}
              onBack={goBack}
            >
              <OnboardingDemoCard text="What matters most today?" timing="When you need the nudge" place="myBishBash Home" />
            </OnboardingStep>
          ) : null}
        </section>
      </div>
      <EditPanel />
    </div>
  );
}

const STEPS = [
  "learn",
  "intention",
  "protected-app",
  "protected-demo",
  "protected-setup",
  "skip",
];

function normalizePersonalCardText(text) {
  return String(text || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

function SingleChoiceGrid({ options, selectedId, onSelect, ariaLabel, getLabel = (option) => option.title }) {
  return (
    <div className="onboarding-reminder-picker">
      <div className="onboarding-idea-grid" role="radiogroup" aria-label={ariaLabel}>
        {options.map((option) => {
          const selected = selectedId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`onboarding-idea-card ${selected ? "selected" : ""}`}
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(option.id)}
            >
              <strong>{getLabel(option)}</strong>
              {selected ? <span className="onboarding-idea-check" aria-hidden="true">✓</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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

function CommitmentTimePassage({
  label = "Great.",
  labelPath,
  body = "We'll check back later.",
  bodyPath,
  nextPath,
  onComplete,
  canGoBack,
  onBack,
}) {
  return (
    <div className="onboarding-step onboarding-commitment-time-step" data-testid="commitment-time-passage">
      <div className="onboarding-step-top">
        {canGoBack ? (
          <button type="button" className="onboarding-back-button" onClick={onBack} aria-label="Go back">
            <EditableText path="common.back">Back</EditableText>
          </button>
        ) : null}
      </div>
      <div className="onboarding-commitment-time">
        <span className="onboarding-time-kicker">Commitment Card</span>
        <h2>{labelPath ? <EditableText path={labelPath}>{label}</EditableText> : label}</h2>
        <p>{bodyPath ? <EditableText path={bodyPath}>{body}</EditableText> : body}</p>
        <button type="button" className="onboarding-time-next" onClick={onComplete}>
          {nextPath ? <EditableText path={nextPath}>Next</EditableText> : "Next"}
        </button>
      </div>
    </div>
  );
}

function ReminderIdeaGrid({
  options,
  selectedIds,
  selectedCount,
  selectedLabel = "selected",
  customCards,
  customCardOpen,
  customCardText,
  message,
  onToggle,
  onToggleCustom,
  onOpenCustom,
  onCustomTextChange,
  onAddCustom,
  writeOwnLabel = "Write my own",
  customPlaceholder = "Write your own reminder…",
  addCustomLabel = "Add",
}) {
  const cleanCustomText = customCardText.trim();
  return (
    <div className="onboarding-reminder-picker">
      <div className="onboarding-selection-count" aria-live="polite">
        <span>{selectedCount} of 5 {selectedLabel}</span>
      </div>
      {message ? <p className="onboarding-selection-message" aria-live="polite">{message}</p> : null}
      <div className="onboarding-idea-grid onboarding-personal-card-grid" role="group" aria-label="Choose Personal Cards">
        {options.map((option) => {
          const selected = selectedIds.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              className={`onboarding-idea-card onboarding-personal-card-suggestion ${selected ? "selected" : ""}`}
              onClick={() => onToggle(option.id)}
              aria-pressed={selected}
              data-testid="onboarding-personal-card-suggestion"
            >
              <span className="onboarding-idea-check" aria-hidden="true">{selected ? "✓" : ""}</span>
              <strong>{option.text}</strong>
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
            <span className="onboarding-idea-check" aria-hidden="true">✓</span>
            <strong>{card.text}</strong>
          </button>
        ))}
        {customCardOpen ? (
          <div className="onboarding-custom-card">
            <label>
              <span>{writeOwnLabel}</span>
              <input
                type="text"
                value={customCardText}
                onChange={(event) => onCustomTextChange(event.target.value)}
                placeholder={customPlaceholder}
                maxLength={96}
              />
            </label>
            <button type="button" onClick={onAddCustom} disabled={!cleanCustomText}>
              {addCustomLabel}
            </button>
          </div>
        ) : (
          <button type="button" className="onboarding-idea-card onboarding-write-own-card" onClick={onOpenCustom}>
            <span className="onboarding-idea-check" aria-hidden="true" />
            <strong>{writeOwnLabel}</strong>
          </button>
        )}
      </div>
    </div>
  );
}

function ProtectedAppChoiceGrid({ apps, selectedId, onSelect }) {
  const { content } = useContentEdit();
  return (
    <div className="onboarding-protected-app-grid" role="radiogroup" aria-label={content.steps?.protectedApp?.ariaLabel ?? "Choose your first app"}>
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
  const { content } = useContentEdit();
  const appName = getLauncherName(app);
  const demo = APP_INTERRUPTION_DEMOS[app?.id] ?? {
    title: `Before ${appName}`,
    body: "Open with intention.",
  };
  const toggleLabel = (content.steps?.protectedDemo?.toggleLabel ?? "Extra {appName} App Prompt").replaceAll("{appName}", appName);
  return (
    <div className="onboarding-interruption-demo" data-testid="onboarding-interruption-demo">
      <article className="onboarding-interruption-example-card">
        <p className="onboarding-demo-card-greeting">myBishBash</p>
        <span className="onboarding-demo-card-heart" aria-hidden="true">
          <BrandMark />
        </span>
        <h3>{demo.title}</h3>
        <i aria-hidden="true" />
        <p>{demo.body}</p>
        <div className="onboarding-real-card-actions">
          <button type="button"><EditableText path="steps.protectedDemo.continuePrefix">Continue to</EditableText> {appName}</button>
          <button type="button"><EditableText path="steps.protectedDemo.notNow">Not now</EditableText></button>
        </div>
      </article>
      <EditableText as="p" className="onboarding-interruption-demo-note" path="steps.protectedDemo.note">This is an example of an App Prompt.</EditableText>
      <div className="onboarding-interruption-toggle" data-testid="onboarding-interruption-toggle">
        <span>{toggleLabel}</span>
        <div role="group" aria-label="Extra App Prompt">
          <button
            type="button"
            className={enabled ? "selected" : ""}
            aria-pressed={enabled}
            onClick={() => onChange(true)}
          >
            {content.steps?.protectedDemo?.on ?? "On"}
          </button>
          <button
            type="button"
            className={!enabled ? "selected" : ""}
            aria-pressed={!enabled}
            onClick={() => onChange(false)}
          >
            {content.steps?.protectedDemo?.off ?? "Off"}
          </button>
        </div>
        <EditableText as="p" path="steps.protectedDemo.later">You can change this later.</EditableText>
      </div>
    </div>
  );
}

function ProtectedAppSetupCard({ app, phase = "ready" }) {
  const { content } = useContentEdit();
  const appName = getLauncherName(app);
  const isConfirmed = phase === "confirmed";
  const steps = content.steps?.protectedSetup?.steps ?? [
    "iPhone: tap Share, then Add to Home Screen.",
    "Android: open the menu, then Add to Home screen or Install app.",
    "Use the new icon when you want myBishBash to appear first.",
    "Return here and tap I’ve added it.",
  ];
  const moveLauncherSuffix = (
    content.steps?.protectedSetup?.moveLauncherSuffix ??
    "normally sits on your Home Screen. Put the original {appName} app in a folder so you open myBishBash first."
  ).replace("{appName}", appName);
  return (
    <article className="onboarding-protected-setup-card" data-testid="onboarding-protected-app-setup">
      <div className="onboarding-protected-setup-heading">
        <OnboardingAppIcon launcher={app} />
        <div>
          <p>{isConfirmed ? (content.steps?.protectedSetup?.markedSaved ?? "Marked as saved") : (content.steps?.protectedSetup?.homeScreenLauncher ?? "Home Screen launcher")}</p>
          <h3>{appName}</h3>
        </div>
      </div>
      {isConfirmed ? (
        <div className="onboarding-protected-confirmation" data-testid="onboarding-protected-app-confirmation">
          <strong>{content.steps?.protectedSetup?.confirmedTitle ?? "You’re set up"}</strong>
          <p>{(content.steps?.protectedSetup?.confirmedBody ?? "Use your new {appName} icon when you want myBishBash to appear before {appName}. You can change this later in Apps.").replaceAll("{appName}", appName)}</p>
          <p>{content.steps?.protectedSetup?.moveLauncherPrefix ?? "Move the myBishBash"} {appName} {content.steps?.protectedSetup?.moveLauncherMiddle ?? "launcher to where"} {appName} {moveLauncherSuffix}</p>
        </div>
      ) : (
        <>
          <p>{(content.steps?.protectedSetup?.addLauncherBody ?? "Add this version to your Home Screen. Use it instead of the original {appName} icon when you want myBishBash to appear first.").replaceAll("{appName}", appName)}</p>
          <div className="onboarding-install-guidance" data-testid="onboarding-install-guidance">
            <ol className="onboarding-install-steps">
              {steps.map((step, index) => (
                <li key={step}>
                  <span className="onboarding-install-step-marker" aria-hidden="true">{index + 1}</span>
                  <span>{step.replace("{appName}", appName)}</span>
                </li>
              ))}
            </ol>
          </div>
          <EditableText as="p" className="onboarding-install-return-note" path="steps.protectedSetup.returnNote">Once it is added, return to myBishBash to continue.</EditableText>
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

function TutorialDemoIntro({ isComplete = false, onReplay }) {
  const { content } = useContentEdit();
  const instagram = FALLBACK_AVAILABLE_LAUNCHERS.find((launcher) => launcher.id === "instagram");
  const whatsapp = FALLBACK_AVAILABLE_LAUNCHERS.find((launcher) => launcher.id === "whatsapp");
  const safari = FALLBACK_AVAILABLE_LAUNCHERS.find((launcher) => launcher.id === "safari");
  const showFinalLine = content.tutorialDemo?.finalLine !== "";
  return (
    <div className="onboarding-tutorial-demo" data-testid="onboarding-tutorial-demo" aria-label="myBishBash opening demo">
      <div className="onboarding-demo-orbit" aria-hidden="true" />
      <div className="onboarding-demo-phone-screen" aria-hidden="true">
        <span className="onboarding-demo-phone-app onboarding-demo-phone-app-instagram">
          <OnboardingAppIcon launcher={instagram} />
          <EditableText as="span" path="tutorialDemo.instagram">Instagram</EditableText>
        </span>
        <span className="onboarding-demo-phone-app onboarding-demo-phone-app-whatsapp">
          <OnboardingAppIcon launcher={whatsapp} />
          <EditableText as="span" path="tutorialDemo.whatsapp">WhatsApp</EditableText>
        </span>
        <span className="onboarding-demo-phone-app onboarding-demo-phone-app-safari">
          <OnboardingAppIcon launcher={safari} />
          <EditableText as="span" path="tutorialDemo.safari">Safari</EditableText>
        </span>
      </div>
      <div className="onboarding-demo-app onboarding-demo-app-instagram">
        <OnboardingAppIcon launcher={instagram} />
        <EditableText as="span" path="tutorialDemo.openingInstagram">Opening Instagram</EditableText>
      </div>
      <div className="onboarding-demo-app onboarding-demo-app-whatsapp">
        <OnboardingAppIcon launcher={whatsapp} />
        <EditableText as="span" path="tutorialDemo.openingWhatsApp">Opening WhatsApp</EditableText>
      </div>
      <div className="onboarding-demo-cursor" aria-hidden="true" />
      <span className="onboarding-demo-click-ripple" aria-hidden="true" />
      <article className="onboarding-demo-real-card onboarding-demo-real-card-instagram">
        <span className="onboarding-demo-card-heart" aria-hidden="true">
          <BrandMark />
        </span>
        <EditableText as="h3" path="tutorialDemo.vitaminTitle">Have you done something that counts towards your fitness today?</EditableText>
        <i aria-hidden="true" />
        {content.tutorialDemo?.vitaminBody ? <EditableText as="p" path="tutorialDemo.vitaminBody">Before Instagram opens.</EditableText> : null}
        <div className="onboarding-real-card-actions" aria-label="Example card choices">
          <button type="button">{content.tutorialDemo?.done ?? "Done"}</button>
          <button type="button">{content.tutorialDemo?.doNow ?? "I’ll do it now"}</button>
          <button type="button">{content.tutorialDemo?.notDone ?? "Not done"}</button>
        </div>
      </article>
      <article className="onboarding-demo-real-card onboarding-demo-real-card-whatsapp">
        <span className="onboarding-demo-card-heart" aria-hidden="true">
          <BrandMark />
        </span>
        <EditableText as="h3" path="tutorialDemo.sunscreenTitle">Have you put your sunscreen on today?</EditableText>
        <i aria-hidden="true" />
        <EditableText as="p" path="tutorialDemo.sunscreenBody">Your phone becomes a trigger for what you chose.</EditableText>
        <div className="onboarding-real-card-actions" aria-label="Example card choices">
          <button type="button">{content.tutorialDemo?.done ?? "Done"}</button>
          <button type="button">{content.tutorialDemo?.doNow ?? "I’ll do it now"}</button>
          <button type="button">{content.tutorialDemo?.notDone ?? "Not done"}</button>
        </div>
      </article>
      <article className="onboarding-demo-continue-card onboarding-demo-continue-card-instagram">
        <EditableText as="span" path="tutorialDemo.ready">Ready</EditableText>
        <EditableText as="strong" path="tutorialDemo.continueInstagram">Continue to Instagram</EditableText>
      </article>
      <article className="onboarding-demo-continue-card onboarding-demo-continue-card-whatsapp">
        <EditableText as="span" path="tutorialDemo.ready">Ready</EditableText>
        <EditableText as="strong" path="tutorialDemo.continueWhatsApp">Continue to WhatsApp</EditableText>
      </article>
      <div className="onboarding-demo-app-open onboarding-demo-app-open-instagram">
        <OnboardingAppIcon launcher={instagram} />
        <EditableText as="span" path="tutorialDemo.instagramOpens">Instagram opens</EditableText>
      </div>
      <div className="onboarding-demo-app-open onboarding-demo-app-open-whatsapp">
        <OnboardingAppIcon launcher={whatsapp} />
        <EditableText as="span" path="tutorialDemo.whatsappOpens">WhatsApp opens</EditableText>
      </div>
      {showFinalLine ? <EditableText as="p" className="onboarding-demo-final-line" path="tutorialDemo.finalLine">Set up your phone around the standards you want to keep.</EditableText> : null}
      {isComplete ? (
        <button type="button" className="onboarding-demo-replay" onClick={onReplay}>
          {content.tutorialDemo?.replay ?? "Replay demo"}
        </button>
      ) : null}
    </div>
  );
}

function OnboardingDemoCard({ text, timing, place }) {
  const { content } = useContentEdit();
  return (
    <div className="onboarding-demo-stage" aria-label="Personal Card example">
      <article className="onboarding-demo-phone">
        <EditableText as="span" className="onboarding-demo-kicker" path="demoCard.kicker">Personal Card</EditableText>
        <h3>{text}</h3>
        <EditableText as="p" path="demoCard.body">A specific reminder before the next app-opening moment.</EditableText>
        <div className="onboarding-demo-actions" aria-hidden="true">
          <span>{content.demoCard?.done ?? "Done"}</span>
          <span>{content.demoCard?.doNow ?? "I’ll do it now"}</span>
          <span>{content.demoCard?.notDone ?? "Not done"}</span>
        </div>
      </article>
      <div className="onboarding-demo-notes" aria-label="What this card does">
        <span>{content.demoCard?.words ?? "Your words"}</span>
        <span>{timing}</span>
        <span>{place}</span>
      </div>
    </div>
  );
}

function PersonalCardPreview({ text, timing, place, compact = false, highlight = null }) {
  const { content } = useContentEdit();
  return (
    <article className={`onboarding-personal-preview ${compact ? "compact" : ""}`} data-testid="personal-card-onboarding-preview">
      <p>{content.personalPreview?.label ?? "Personal Card"}</p>
      <h3 className={highlight === "text" ? "is-highlighted" : ""}>{text}</h3>
      <dl>
        <div className={highlight === "timing" ? "is-highlighted" : ""}>
          <dt>{content.personalPreview?.when ?? "When"}</dt>
          <dd>{timing}</dd>
        </div>
        <div className={highlight === "place" ? "is-highlighted" : ""}>
          <dt>{content.personalPreview?.where ?? "Where"}</dt>
          <dd>{place}</dd>
        </div>
      </dl>
    </article>
  );
}

function OnboardingStep({
  className = "",
  title,
  titlePath,
  body,
  bodyPath,
  children,
  primaryLabel,
  primaryPath,
  onPrimary,
  secondaryLabel,
  secondaryPath,
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
            <EditableText path="common.back">Back</EditableText>
          </button>
        ) : null}
      </div>
      <div className="onboarding-step-copy">
        <h2>{titlePath ? <EditableText path={titlePath}>{title}</EditableText> : title}</h2>
        {body ? <p>{bodyPath ? <EditableText path={bodyPath}>{body}</EditableText> : body}</p> : null}
      </div>
      {children ? <div className="onboarding-step-body">{children}</div> : null}
      <div className="onboarding-actions">
        {primaryLabel ? (
          <button type="button" className="save-button" onClick={onPrimary} disabled={primaryDisabled}>
            {primaryPath ? <EditableText path={primaryPath}>{primaryLabel}</EditableText> : primaryLabel}
          </button>
        ) : null}
        {secondaryLabel ? (
          <button type="button" className="secondary-button" onClick={onSecondary}>
            {secondaryPath ? <EditableText path={secondaryPath}>{secondaryLabel}</EditableText> : secondaryLabel}
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
