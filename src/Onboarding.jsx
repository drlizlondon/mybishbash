import { useEffect, useState } from "react";
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
    text: "Have you done the thing you’ve been avoiding?",
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

const FALLBACK_AVAILABLE_LAUNCHERS = [
  { id: "instagram", displayName: "Instagram", name: "Instagram", category: "social", iconSrc: "/icons/instagram-cover.jpg" },
  { id: "safari", displayName: "Safari", name: "Safari", category: "browser", iconSrc: "/safari-touch-icon.png" },
  { id: "youtube", displayName: "YouTube", name: "YouTube", category: "video", iconSrc: "/icons/youtube-cover.png" },
  { id: "whatsapp", displayName: "WhatsApp", name: "WhatsApp", category: "messaging", iconSrc: "/icons/whatsapp-cover.jpeg" },
  { id: "chrome", displayName: "Chrome", name: "Chrome", category: "browser" },
];
const FIRST_PROTECTED_APP_IDS = ["instagram", "safari", "whatsapp"];
const FIRST_PROTECTED_APPS = FIRST_PROTECTED_APP_IDS
  .map((id) => FALLBACK_AVAILABLE_LAUNCHERS.find((launcher) => launcher.id === id))
  .filter(Boolean);

function getLauncherName(launcher) {
  return launcher?.realAppLabel || launcher?.displayName || launcher?.name || launcher?.label || launcher?.id || "App";
}

function getLauncherIcon(launcher) {
  if (!launcher) return `${import.meta.env.BASE_URL}icons/mybishbash-logo-mark.png`;
  const src = launcher.iconSrc || launcher.icon || launcher.customIconSrc || "";
  if (src && src.startsWith("/")) return `${import.meta.env.BASE_URL}${src.replace(/^\//, "")}`;
  if (src) return src;
  return `${import.meta.env.BASE_URL}icons/mybishbash-logo-mark.png`;
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

function OnboardingContent({ onSavePersonalSetup, onCommitmentDemoComplete, onCompleteProtectedAppSetup, onGoHome, onSkip }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [demoComplete, setDemoComplete] = useState(false);
  const [demoReplayKey, setDemoReplayKey] = useState(0);
  const [skipRequested, setSkipRequested] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [customCardText, setCustomCardText] = useState("");
  const [customCardOpen, setCustomCardOpen] = useState(false);
  const [customCards, setCustomCards] = useState([]);
  const [cardSelectionMessage, setCardSelectionMessage] = useState("");
  const [selectedProtectedAppId, setSelectedProtectedAppId] = useState(FIRST_PROTECTED_APPS[0]?.id ?? "instagram");
  const [showProtectedAppInstructions, setShowProtectedAppInstructions] = useState(false);

  const selectedCards = PERSONAL_CARD_OPTIONS.filter((option) => selectedCardIds.includes(option.id));
  const selectedCardTexts = [
    ...selectedCards.map((option) => option.text),
    ...customCards.map((card) => card.text),
  ].slice(0, 5);
  const canGoBack = stepIndex > 0;

  useEffect(() => {
    if (stepIndex !== 0) return undefined;
    setDemoComplete(false);
    const timer = window.setTimeout(() => setDemoComplete(true), 26400);
    return () => window.clearTimeout(timer);
  }, [demoReplayKey, stepIndex]);

  function goNext() {
    setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
  }

  function goBack() {
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function showSkipSummary() {
    setSkipRequested(true);
    setStepIndex(STEPS.indexOf("skip"));
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

  function completeCommitmentDemo() {
    onCommitmentDemoComplete?.({ skipped: false });
    setStepIndex(STEPS.indexOf("protected-app"));
  }

  function continueToProtectedAppSetup() {
    setShowProtectedAppInstructions(false);
    setStepIndex(STEPS.indexOf("protected-setup"));
  }

  function finishProtectedAppSetup({ completed }) {
    onCompleteProtectedAppSetup?.({
      appId: selectedProtectedAppId,
      completed,
    });
    onGoHome?.();
  }

  const selectedProtectedApp = FIRST_PROTECTED_APPS.find((app) => app.id === selectedProtectedAppId) ?? FIRST_PROTECTED_APPS[0];
  const selectedProtectedAppName = getLauncherName(selectedProtectedApp);

  return (
    <div className="overlay-screen onboarding-screen">
      <div className="onboarding-shell">
        <header className="onboarding-brand">
          <img className="onboarding-logo" src={`${import.meta.env.BASE_URL}icons/mybishbash-logo-mark.png`} alt="MyBishBash logo" />
          <h1>MyBishBash</h1>
        </header>

        <section className="onboarding-flow-card" aria-live="polite">
          <StepIndicator currentIndex={stepIndex} total={STEPS.length} />

          {stepIndex === 0 ? (
            <OnboardingStep
              title="Before your apps open..."
              body="MyBishBash helps you use your phone differently, by showing personal reminders before the apps you already open."
              primaryLabel="Make your own"
              onPrimary={goNext}
              primaryDisabled={!demoComplete}
              secondaryLabel="Set this up later"
              onSecondary={showSkipSummary}
            >
              <TutorialDemoIntro
                key={demoReplayKey}
                isComplete={demoComplete}
                onReplay={() => setDemoReplayKey((current) => current + 1)}
              />
            </OnboardingStep>
          ) : null}

          {stepIndex === 1 ? (
            <OnboardingStep
              className="onboarding-step-card-selection"
              title="Things I genuinely mean to do, but don’t always remember."
              body="Choose up to five. These will become your first Personal Cards."
              primaryLabel="Continue"
              onPrimary={saveAndContinue}
              secondaryLabel="Set this up later"
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

          {stepIndex === 2 ? (
            <OnboardingStep
              title="There’s another type of card."
              body="Personal Cards remind you. Commitment Cards follow up with you."
              primaryLabel="Show me how it works"
              onPrimary={() => setStepIndex(STEPS.indexOf("commitment-sequence"))}
              secondaryLabel="Skip"
              onSecondary={skipCommitmentDemo}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <CommitmentCardDemoIntro />
            </OnboardingStep>
          ) : null}

          {stepIndex === 3 ? (
            <OnboardingStep
              title="Commitments check in with you later."
              primaryLabel="Continue"
              onPrimary={() => setStepIndex(STEPS.indexOf("commitment-no"))}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <CommitmentCheckInSequence />
            </OnboardingStep>
          ) : null}

          {stepIndex === 4 ? (
            <OnboardingStep
              title="Saying no is allowed too."
              body="MyBishBash can help you notice what gets in the way."
              primaryLabel="Choose my first app"
              onPrimary={completeCommitmentDemo}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <CommitmentDeclineSequence />
            </OnboardingStep>
          ) : null}

          {stepIndex === 5 ? (
            <OnboardingStep
              title="Choose your first app"
              body="Your Personal Cards can appear before the apps you already open."
              primaryLabel="Continue"
              onPrimary={continueToProtectedAppSetup}
              secondaryLabel="I’ll do this later"
              onSecondary={() => finishProtectedAppSetup({ completed: false })}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <ProtectedAppChoiceGrid
                apps={FIRST_PROTECTED_APPS}
                selectedId={selectedProtectedAppId}
                onSelect={setSelectedProtectedAppId}
              />
            </OnboardingStep>
          ) : null}

          {stepIndex === 6 ? (
            <OnboardingStep
              title={`Connect ${selectedProtectedAppName}`}
              body={`Show your Personal Cards before ${selectedProtectedAppName} opens.`}
              primaryLabel={showProtectedAppInstructions ? "I’ve added it" : `Connect ${selectedProtectedAppName}`}
              onPrimary={() => {
                if (!showProtectedAppInstructions) {
                  setShowProtectedAppInstructions(true);
                  return;
                }
                finishProtectedAppSetup({ completed: true });
              }}
              secondaryLabel="I’ll do this later"
              onSecondary={() => finishProtectedAppSetup({ completed: false })}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <ProtectedAppSetupCard app={selectedProtectedApp} showInstructions={showProtectedAppInstructions} />
            </OnboardingStep>
          ) : null}

          {stepIndex === 7 ? (
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

const STEPS = ["learn", "intention", "commitment-intro", "commitment-sequence", "commitment-no", "protected-app", "protected-setup", "skip"];

function CommitmentCardDemoIntro() {
  return (
    <div className="onboarding-commitment-demo-grid" data-testid="commitment-card-demo-intro">
      <article className="onboarding-demo-card-small">
        <span>Personal Card</span>
        <h3>Have you taken your vitamins today?</h3>
        <p>A simple reminder.</p>
      </article>
      <article className="onboarding-demo-card-small commitment">
        <span>Commitment Card</span>
        <h3>I will go to the gym today.</h3>
        <div className="onboarding-demo-card-buttons">
          <button type="button">I’ll do it</button>
          <button type="button">Not this time</button>
        </div>
        <p>A promise to yourself.</p>
      </article>
    </div>
  );
}

function CommitmentCheckInSequence() {
  const steps = [
    { label: "Morning", text: "I will go to the gym today.", action: "I’ll do it" },
    { label: "Later", text: "How is it going?" },
    { label: "Evening", text: "Did you do it?" },
  ];
  return (
    <div className="onboarding-commitment-sequence" data-testid="commitment-check-in-demo">
      {steps.map((step) => (
        <article key={step.label} className="onboarding-commitment-step-card">
          <span>{step.label}</span>
          <h3>{step.text}</h3>
          {step.action ? <button type="button">{step.action}</button> : null}
        </article>
      ))}
    </div>
  );
}

function CommitmentDeclineSequence() {
  const steps = [
    { label: "Choice", text: "I will go to the gym today.", action: "Not this time" },
    { label: "Reflection", text: "What got in the way?" },
  ];
  return (
    <div className="onboarding-commitment-sequence two" data-testid="commitment-decline-demo">
      {steps.map((step) => (
        <article key={step.label} className="onboarding-commitment-step-card">
          <span>{step.label}</span>
          <h3>{step.text}</h3>
          {step.action ? <button type="button">{step.action}</button> : null}
        </article>
      ))}
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
    <div className="onboarding-protected-app-grid" role="radiogroup" aria-label="Choose your first protected app">
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

function ProtectedAppSetupCard({ app, showInstructions }) {
  const appName = getLauncherName(app);
  return (
    <article className="onboarding-protected-setup-card" data-testid="onboarding-protected-app-setup">
      <div className="onboarding-protected-setup-heading">
        <OnboardingAppIcon launcher={app} />
        <div>
          <p>Protected App</p>
          <h3>{appName}</h3>
        </div>
      </div>
      {showInstructions ? (
        <ol className="onboarding-install-steps">
          <li>Open the {appName} setup page from Apps.</li>
          <li>Tap Share.</li>
          <li>Tap Add to Home Screen.</li>
          <li>Keep the suggested name.</li>
          <li>Tap Add, then return to MyBishBash.</li>
        </ol>
      ) : (
        <p>Choose this app now. You can finish the Home Screen step from Apps whenever you are ready.</p>
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
  const safari = FALLBACK_AVAILABLE_LAUNCHERS.find((launcher) => launcher.id === "safari");
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
        <span className="onboarding-demo-phone-app onboarding-demo-phone-app-safari">
          <OnboardingAppIcon launcher={safari} />
          <span>Safari</span>
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
      <div className="onboarding-demo-app onboarding-demo-app-safari">
        <OnboardingAppIcon launcher={safari} />
        <span>Opening Safari</span>
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
          <button type="button">Not done</button>
          <button type="button">I’ll do it now</button>
          <button type="button">Done</button>
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
          <button type="button">Not done</button>
          <button type="button">I’ll do it now</button>
          <button type="button">Done</button>
        </div>
      </article>
      <article className="onboarding-demo-real-card onboarding-demo-real-card-safari">
        <span className="onboarding-demo-card-greeting">Good afternoon</span>
        <span className="onboarding-demo-card-heart" aria-hidden="true">
          <HeartGlyph />
        </span>
        <h3>Have you watered your plants?</h3>
        <i aria-hidden="true" />
        <p>A gentle nudge for the things you genuinely mean to do.</p>
        <div className="onboarding-real-card-actions" aria-label="Example card choices">
          <button type="button">Not done</button>
          <button type="button">I’ll do it now</button>
          <button type="button">Done</button>
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
      <article className="onboarding-demo-continue-card onboarding-demo-continue-card-safari">
        <span>Ready</span>
        <strong>Continue to Safari</strong>
      </article>
      <div className="onboarding-demo-app-open onboarding-demo-app-open-instagram">
        <OnboardingAppIcon launcher={instagram} />
        <span>Instagram opens</span>
      </div>
      <div className="onboarding-demo-app-open onboarding-demo-app-open-whatsapp">
        <OnboardingAppIcon launcher={whatsapp} />
        <span>WhatsApp opens</span>
      </div>
      <div className="onboarding-demo-app-open onboarding-demo-app-open-safari">
        <OnboardingAppIcon launcher={safari} />
        <span>Safari opens</span>
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
          <span>Not done</span>
          <span>I’ll do it now</span>
          <span>Done</span>
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
        <p>{body}</p>
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
