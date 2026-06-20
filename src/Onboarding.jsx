import { useEffect, useRef, useState } from "react";
import "./landing.css";
import { ContentEditProvider, EditableText, EditPanel, useContentEdit } from "./editing/ContentEditContext";
import { onboardingContent } from "./content/onboardingContent";
import { getGreeting } from "./utils";

const ONBOARDING_DEMO_CTA_UNLOCK_MS = 5400;

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
  "Have you drunk a glass of water today?",
  "Have you put your phone away for bedtime?",
  "Have you checked what time you need to leave?",
  "Have you messaged a friend today?",
  "Do you actually want to open this app right now?",
];

export const STRATEGY_AREA_OPTIONS = [
  { id: "health-basics", label: "Health Basics" },
  { id: "sleep", label: "Sleep" },
  { id: "fitness", label: "Fitness" },
  { id: "punctuality", label: "Punctuality" },
  { id: "relationships", label: "Relationships" },
  { id: "confidence", label: "Confidence" },
  { id: "faith-reflection", label: "Faith or Reflection" },
  { id: "phone-use", label: "Phone Use" },
  { id: "being-present", label: "Being More Present" },
  { id: "put-together", label: "Feeling Put Together" },
];

const PERSONAL_CARD_GROUPS = {
  "health-basics": [
    "Have you drunk a glass of water today?",
    "Have you eaten vegetables today?",
    "Have you taken your vitamins today?",
    "Have you taken your medication today?",
    "Have you eaten something that will actually fuel you?",
    "Have you been outside today?",
  ],
  sleep: [
    "Have you put your phone away for bedtime?",
    "Have you started winding down?",
    "Have you brushed your teeth before getting too tired?",
    "Have you set your alarm for tomorrow?",
    "Have you charged your phone away from the bed?",
    "Have you got into bed on time?",
  ],
  fitness: [
    "Have you been for a walk today?",
    "Have you moved your body today?",
    "Have you stretched today?",
    "Have you done your steps today?",
    "Have you done your workout today?",
    "Have you done your physio exercises today?",
  ],
  punctuality: [
    "Have you checked what time you need to leave?",
    "Have you packed your bag for tomorrow?",
    "Have you put your keys somewhere obvious?",
    "Have you chosen what you are wearing?",
    "Have you left 10 minutes earlier than usual?",
    "Have you checked the route before leaving?",
  ],
  relationships: [
    "Have you told your partner you love them today?",
    "Have you hugged your partner today?",
    "Have you messaged a friend today?",
    "Have you replied to someone who matters to you?",
    "Have you called your mum today?",
    "Have you checked in on someone you care about?",
  ],
  confidence: [
    "Have you stood up straight today?",
    "Have you spoken clearly today?",
    "Have you worn something that makes you feel good?",
    "Have you said what you actually think?",
    "Have you stopped apologising for something reasonable?",
    "Have you done one small brave thing today?",
  ],
  "faith-reflection": [
    "Have you prayed today?",
    "Have you read your Bible today?",
    "Have you had a quiet moment today?",
    "Have you written down one thing you are grateful for?",
    "Have you listened to something uplifting today?",
    "Have you reflected before reacting?",
  ],
  "phone-use": [
    "Do you actually want to open this app right now?",
    "Are you opening this app for a reason?",
    "Is this helping what you meant to do?",
    "Could this wait until later?",
    "Are you choosing this, or did your thumb just take you here?",
    "Have you used your phone for something useful today?",
  ],
  "being-present": [
    "Have you put your phone down during dinner?",
    "Have you given someone your full attention today?",
    "Have you sat quietly without scrolling today?",
    "Have you looked around instead of looking down?",
    "Have you played with your child without checking your phone?",
    "Have you had a proper conversation today?",
  ],
  "put-together": [
    "Have you washed your face today?",
    "Have you moisturised today?",
    "Have you put SPF on today?",
    "Have you done your skincare today?",
    "Have you flossed today?",
    "Have you put on something that makes you feel good?",
  ],
};

const PERSONAL_CARD_OPTIONS = Object.entries(PERSONAL_CARD_GROUPS).flatMap(([areaId, cards]) =>
  cards.map((text) => ({ id: `${areaId}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, areaId, text })),
);

const STARTER_PACK_OPTIONS = [
  { id: "healthier-daily-basics", areaIds: ["health-basics", "fitness"], title: "Healthier Daily Basics" },
  { id: "better-bedtime", areaIds: ["sleep"], title: "Better Bedtime" },
  { id: "stop-being-late", areaIds: ["punctuality"], title: "Stop Being Late" },
  { id: "more-present-with-my-people", areaIds: ["relationships", "being-present"], title: "More Present With My People" },
  { id: "be-more-confident", areaIds: ["confidence"], title: "Be More Confident" },
  { id: "faith-and-steadiness", areaIds: ["faith-reflection"], title: "Faith and Steadiness" },
  { id: "feel-more-put-together", areaIds: ["put-together"], title: "Feel More Put Together" },
  { id: "phone-use-reality-check", areaIds: ["phone-use"], title: "Phone Use Reality Check" },
];

const STARTER_COMMITMENT_OPTIONS = [
  { id: "water-before-coffee", text: "drink water before my next coffee", label: "I will drink water before my next coffee.", areaIds: ["health-basics"], defaults: { commitmentTimingMode: "anytime", commitmentCheckInEnabled: false } },
  { id: "walk-today", text: "go for a 10-minute walk today", label: "I will go for a 10-minute walk today.", areaIds: ["fitness", "health-basics"], defaults: { commitmentTimingMode: "day", commitmentCheckInEnabled: false } },
  { id: "phone-away-dinner", text: "put my phone away during dinner", label: "I will put my phone away during dinner.", areaIds: ["being-present", "phone-use", "relationships"], defaults: { commitmentTimingMode: "evening", commitmentCheckInEnabled: true, commitmentCheckInTime: "20:30" } },
  { id: "message-friend", text: "message one friend before 20:00", label: "I will message one friend before 20:00.", areaIds: ["relationships"], defaults: { commitmentTimingMode: "day", commitmentCheckInEnabled: true, commitmentCheckInTime: "20:00" } },
  { id: "pack-bag", text: "pack my bag before bed", label: "I will pack my bag before bed.", areaIds: ["punctuality", "sleep"], defaults: { commitmentTimingMode: "evening", commitmentCheckInEnabled: true, commitmentCheckInTime: "21:30" } },
  { id: "leave-earlier", text: "leave 10 minutes earlier than usual", label: "I will leave 10 minutes earlier than usual.", areaIds: ["punctuality"], defaults: { commitmentTimingMode: "day", commitmentCheckInEnabled: false } },
  { id: "pray-before-sleep", text: "pray before I go to sleep", label: "I will pray before I go to sleep.", areaIds: ["faith-reflection", "sleep"], defaults: { commitmentTimingMode: "evening", commitmentCheckInEnabled: true, commitmentCheckInTime: "21:30" } },
  { id: "wind-down", text: "start winding down by 22:00", label: "I will start winding down by 22:00.", areaIds: ["sleep"], defaults: { commitmentTimingMode: "evening", commitmentCheckInEnabled: true, commitmentCheckInTime: "21:30" } },
];

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
      isContentCompatible={(value) => Boolean(value?.steps?.learn?.title && value?.done?.primary)}
    >
      <OnboardingContent {...props} />
      <EditPanel />
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
      : pendingProtectedAppSetup
        ? STEPS.indexOf("protected-app")
        : 0
  ));
  const [demoComplete, setDemoComplete] = useState(false);
  const [demoReplayKey, setDemoReplayKey] = useState(0);
  const [skipRequested, setSkipRequested] = useState(false);
  const [selectedStrategyAreaIds, setSelectedStrategyAreaIds] = useState([]);
  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [customCardText, setCustomCardText] = useState("");
  const [customCardOpen, setCustomCardOpen] = useState(false);
  const [customCards, setCustomCards] = useState([]);
  const [cardSelectionMessage, setCardSelectionMessage] = useState("");
  const [selectedStarterPackId, setSelectedStarterPackId] = useState("");
  const [selectedStarterCommitmentId, setSelectedStarterCommitmentId] = useState("");
  const protectedAppOptions = getFirstProtectedApps(availableLaunchers);
  const [selectedProtectedAppId, setSelectedProtectedAppId] = useState(pendingProtectedAppSetup?.appId ?? protectedAppOptions[0]?.id ?? "instagram");
  const [protectedAppSetupPhase, setProtectedAppSetupPhase] = useState(pendingProtectedAppSetup?.status === "confirmed" ? "confirmed" : "ready");
  const [protectedAppInterruptionPrefs, setProtectedAppInterruptionPrefs] = useState(initialProtectedAppInterruptionPrefs);
  const protectedAppInterruptionPrefsRef = useRef(initialProtectedAppInterruptionPrefs);

  const orderedPersonalCardOptions = prioritizeByStrategy(PERSONAL_CARD_OPTIONS, selectedStrategyAreaIds);
  const orderedStarterPackOptions = prioritizeByStrategy(STARTER_PACK_OPTIONS, selectedStrategyAreaIds);
  const orderedStarterCommitmentOptions = prioritizeByStrategy(STARTER_COMMITMENT_OPTIONS, selectedStrategyAreaIds);
  const selectedCards = PERSONAL_CARD_OPTIONS.filter((option) => selectedCardIds.includes(option.id));
  const selectedStarterCommitment = STARTER_COMMITMENT_OPTIONS.find((option) => option.id === selectedStarterCommitmentId) ?? null;
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
      intention: "strategy",
      pack: "intention",
      commitment: "pack",
      "protected-app": "commitment",
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

  function toggleStrategyArea(areaId) {
    setSelectedStrategyAreaIds((current) => {
      if (current.includes(areaId)) return current.filter((id) => id !== areaId);
      if (current.length >= 3) return current;
      return [...current, areaId];
    });
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
      selectedStrategyAreaIds,
      personalCards: selectedCardTexts,
      selectedStarterPackId,
      starterCommitment: selectedStarterCommitment
        ? {
            id: selectedStarterCommitment.id,
            promptText: selectedStarterCommitment.text,
            label: selectedStarterCommitment.label,
            defaults: selectedStarterCommitment.defaults,
          }
        : null,
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
    setStepIndex(STEPS.indexOf("pack"));
  }

  function continueFromPack() {
    setStepIndex(STEPS.indexOf("commitment"));
  }

  function continueFromCommitment() {
    savePersonalCard();
    onCommitmentDemoComplete?.({ skipped: !selectedStarterCommitment });
    setStepIndex(STEPS.indexOf("protected-app"));
  }

  function continueToProtectedAppInstall() {
    clearPendingProtectedAppSetup();
    saveProtectedAppInterruptionPreference(selectedProtectedAppId, getSelectedProtectedAppInterruptionEnabled());
    openProtectedAppInstall();
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
              titlePath="steps.learn.title"
              title="Build your phone strategy"
              bodyPath="steps.learn.body"
              body="MyBishBash helps you use your phone as a cue system for the habits, standards and commitments you want to keep. Choose what you want your phone to help you reinforce, then connect those reminders to the apps you already open every day."
              primaryPath="steps.learn.primary"
              primaryLabel="Start setting it up"
              onPrimary={goNext}
              primaryDisabled={!demoComplete}
              secondaryPath="steps.learn.secondary"
              secondaryLabel="Skip setup for now"
              onSecondary={showSkipSummary}
            >
              <TutorialDemoIntro
                key={demoReplayKey}
                isComplete={demoComplete}
                onReplay={() => setDemoReplayKey((current) => current + 1)}
              />
            </OnboardingStep>
          ) : null}

          {currentStep === "strategy" ? (
            <OnboardingStep
              className="onboarding-step-card-selection"
              titlePath="steps.strategy.title"
              title="What do you want to reinforce?"
              bodyPath="steps.strategy.body"
              body="Choose a few areas where a small reminder at the right moment would help."
              primaryPath="steps.strategy.primary"
              primaryLabel="Continue"
              onPrimary={goNext}
              primaryDisabled={selectedStrategyAreaIds.length === 0}
              secondaryPath="steps.strategy.secondary"
              secondaryLabel="Skip setup for now"
              onSecondary={showSkipSummary}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <StrategyAreaGrid
                options={STRATEGY_AREA_OPTIONS}
                selectedIds={selectedStrategyAreaIds}
                onToggle={toggleStrategyArea}
              />
            </OnboardingStep>
          ) : null}

          {currentStep === "intention" ? (
            <OnboardingStep
              className="onboarding-step-card-selection"
              titlePath="steps.intention.title"
              title="Choose your first reminders"
              bodyPath="steps.intention.body"
              body="Good cards are specific. You should know exactly what they mean the moment you see them."
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

          {currentStep === "pack" ? (
            <OnboardingStep
              className="onboarding-step-card-selection"
              titlePath="steps.pack.title"
              title="Add a strategy pack"
              bodyPath="steps.pack.body"
              body="Packs are ready-made sets of cards for a specific shift."
              primaryPath="steps.pack.primary"
              primaryLabel="Continue"
              onPrimary={continueFromPack}
              secondaryPath="steps.pack.secondary"
              secondaryLabel="Skip pack"
              onSecondary={continueFromPack}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <SingleChoiceGrid
                ariaLabel="Choose a starter strategy pack"
                options={orderedStarterPackOptions}
                selectedId={selectedStarterPackId}
                onSelect={(id) => setSelectedStarterPackId((current) => current === id ? "" : id)}
              />
            </OnboardingStep>
          ) : null}

          {currentStep === "commitment" ? (
            <OnboardingStep
              className="onboarding-step-card-selection"
              titlePath="steps.commitment.title"
              title="Make one commitment"
              bodyPath="steps.commitment.body"
              body="Reminders keep things in mind. Commitments help you make a clear decision for today."
              primaryPath="steps.commitment.primary"
              primaryLabel="Continue"
              onPrimary={continueFromCommitment}
              secondaryPath="steps.commitment.secondary"
              secondaryLabel="Skip commitment"
              onSecondary={continueFromCommitment}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <SingleChoiceGrid
                ariaLabel="Choose one starter commitment"
                options={orderedStarterCommitmentOptions}
                selectedId={selectedStarterCommitmentId}
                onSelect={(id) => setSelectedStarterCommitmentId((current) => current === id ? "" : id)}
                getLabel={(option) => option.label}
              />
            </OnboardingStep>
          ) : null}

          {currentStep === "protected-app" ? (
            <OnboardingStep
              titlePath="steps.protectedApp.title"
              title="Choose your first phone trigger"
              bodyPath="steps.protectedApp.body"
              body="Pick an app you open often. MyBishBash will use that moment to bring your strategy back to mind."
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
              title={<><EditableText path="steps.protectedDemo.titlePrefix">What should appear before</EditableText> {selectedProtectedAppName}?</>}
              body={<><EditableText path="steps.protectedDemo.bodyPrefix">App Prompts are optional. They add an extra pause before</EditableText> {selectedProtectedAppName} <EditableText path="steps.protectedDemo.bodySuffix">opens.</EditableText></>}
              primaryLabel={<><EditableText path="steps.protectedDemo.primaryPrefix">Continue to install</EditableText></>}
              onPrimary={continueToProtectedAppInstall}
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
              title={protectedAppSetupPhase === "confirmed"
                ? <EditableText path="steps.protectedSetup.confirmedTitle">You’re in.</EditableText>
                : <><EditableText path="steps.protectedSetup.installPrefix">Install</EditableText> {selectedProtectedAppName} <EditableText path="steps.protectedSetup.installSuffix">Launcher</EditableText></>}
              body={protectedAppSetupPhase === "confirmed"
                ? (content.steps?.protectedSetup?.confirmedBody ?? "Open your new {appName} icon from your Home Screen to see MyBishBash before {appName} opens.").replaceAll("{appName}", selectedProtectedAppName)
                : <><EditableText path="steps.protectedSetup.installBodyPrefix">See your Personal Cards before opening</EditableText> {selectedProtectedAppName}<EditableText path="steps.protectedSetup.installBodySuffix">.</EditableText></>}
              primaryLabel={protectedAppSetupPhase === "confirmed"
                ? <EditableText path="steps.protectedSetup.continueHome">Continue to Home</EditableText>
                : protectedAppSetupPhase === "install_started"
                  ? <EditableText path="steps.protectedSetup.saved">I’ve saved it</EditableText>
                  : <><EditableText path="steps.protectedSetup.addPrefix">Add</EditableText> {selectedProtectedAppName} <EditableText path="steps.protectedSetup.addSuffix">Launcher</EditableText></>}
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
              secondaryLabel={protectedAppSetupPhase === "confirmed" ? null : <EditableText path="steps.protectedSetup.secondary">Choose an app later</EditableText>}
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
              body="Personal Cards live in MyBishBash. When you are ready, create one reminder and let your phone bring you back to what matters."
              primaryPath="steps.skip.primary"
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
  "strategy",
  "intention",
  "pack",
  "commitment",
  "protected-app",
  "protected-demo",
  "protected-setup",
  "skip",
];

function prioritizeByStrategy(options, selectedAreaIds) {
  if (!selectedAreaIds.length) return options;
  const selected = new Set(selectedAreaIds);
  return [...options].sort((left, right) => {
    const leftMatch = left.areaIds?.some((id) => selected.has(id)) || selected.has(left.areaId);
    const rightMatch = right.areaIds?.some((id) => selected.has(id)) || selected.has(right.areaId);
    if (leftMatch === rightMatch) return 0;
    return leftMatch ? -1 : 1;
  });
}

function StrategyAreaGrid({ options, selectedIds, onToggle }) {
  return (
    <div className="onboarding-reminder-picker">
      <div className="onboarding-selection-count" aria-live="polite">
        <span>{selectedIds.length} of 3 selected</span>
      </div>
      <div className="onboarding-idea-grid" role="group" aria-label="Choose strategy areas">
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
              <strong>{option.label}</strong>
              {selected ? <span className="onboarding-idea-check" aria-hidden="true">✓</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
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
              <span>{writeOwnLabel}</span>
              <input
                type="text"
                value={customCardText}
                onChange={(event) => onCustomTextChange(event.target.value)}
                placeholder={customPlaceholder}
                maxLength={140}
              />
            </label>
            <button type="button" onClick={onAddCustom} disabled={!cleanCustomText}>
              {addCustomLabel}
            </button>
          </div>
        ) : (
          <button type="button" className="onboarding-idea-card onboarding-write-own-card" onClick={onOpenCustom}>
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
  return (
    <div className="onboarding-interruption-demo" data-testid="onboarding-interruption-demo">
      <article className="onboarding-interruption-example-card">
        <p className="onboarding-demo-card-greeting">MyBishBash</p>
        <span className="onboarding-demo-card-heart" aria-hidden="true">
          <HeartGlyph />
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
        <EditableText as="span" path="steps.protectedDemo.personalLabel">Personal reminders: On</EditableText>
        <EditableText as="span" path="steps.protectedDemo.toggleLabel">App-specific check-ins</EditableText>
        <div role="group" aria-label="App-specific check-ins">
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
    `Tap Add ${appName} Launcher.`,
    "Tap Share.",
    "Tap Add to Home Screen.",
    "Keep the suggested name.",
    "Return to MyBishBash to continue.",
  ];
  const moveLauncherSuffix = (
    content.steps?.protectedSetup?.moveLauncherSuffix ??
    "normally sits on your Home Screen. Put the original {appName} app in a folder so you open MyBishBash first."
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
          <strong>{content.steps?.protectedSetup?.confirmedTitle ?? "You’re in."}</strong>
          <p>{(content.steps?.protectedSetup?.confirmedBody ?? "Open your new {appName} icon from your Home Screen to see MyBishBash before {appName} opens.").replaceAll("{appName}", appName)}</p>
          <p>{content.steps?.protectedSetup?.moveLauncherPrefix ?? "Move the MyBishBash"} {appName} {content.steps?.protectedSetup?.moveLauncherMiddle ?? "launcher to where"} {appName} {moveLauncherSuffix}</p>
        </div>
      ) : (
        <>
          <p>{(content.steps?.protectedSetup?.addLauncherBody ?? "Add this version to your Home Screen. Use it instead of the original {appName} icon when you want MyBishBash to appear first.").replaceAll("{appName}", appName)}</p>
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
          <EditableText as="p" className="onboarding-install-return-note" path="steps.protectedSetup.returnNote">Once it is saved, return to MyBishBash to continue.</EditableText>
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
  const { content } = useContentEdit();
  const instagram = FALLBACK_AVAILABLE_LAUNCHERS.find((launcher) => launcher.id === "instagram");
  const whatsapp = FALLBACK_AVAILABLE_LAUNCHERS.find((launcher) => launcher.id === "whatsapp");
  const safari = FALLBACK_AVAILABLE_LAUNCHERS.find((launcher) => launcher.id === "safari");
  const demoGreeting = getGreeting(new Date());
  return (
    <div className="onboarding-tutorial-demo" data-testid="onboarding-tutorial-demo" aria-label="MyBishBash opening demo">
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
        <span className="onboarding-demo-card-greeting">{demoGreeting}</span>
        <span className="onboarding-demo-card-heart" aria-hidden="true">
          <HeartGlyph />
        </span>
        <EditableText as="h3" path="tutorialDemo.vitaminTitle">Have you taken your vitamins today?</EditableText>
        <i aria-hidden="true" />
        <EditableText as="p" path="tutorialDemo.vitaminBody">A clear cue before the next app-opening moment.</EditableText>
        <div className="onboarding-real-card-actions" aria-label="Example card choices">
          <button type="button">{content.tutorialDemo?.done ?? "Done"}</button>
          <button type="button">{content.tutorialDemo?.doNow ?? "I’ll do it now"}</button>
          <button type="button">{content.tutorialDemo?.notDone ?? "Not done"}</button>
        </div>
      </article>
      <article className="onboarding-demo-real-card onboarding-demo-real-card-whatsapp">
        <span className="onboarding-demo-card-greeting">{demoGreeting}</span>
        <span className="onboarding-demo-card-heart" aria-hidden="true">
          <HeartGlyph />
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
      <EditableText as="p" className="onboarding-demo-final-line" path="tutorialDemo.finalLine">Set up your phone around the standards you want to keep.</EditableText>
      {isComplete ? (
        <button type="button" className="onboarding-demo-replay" onClick={onReplay}>
          {content.tutorialDemo?.replay ?? "Replay"}
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
