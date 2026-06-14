import { useMemo, useState } from "react";
import "./landing.css";
import { ContentEditProvider, EditPanel } from "./editing/ContentEditContext";
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

const EVERYDAY_REMINDERS = DEFAULT_PERSONAL_CARD_TEXTS.slice(0, 3);
const PERSONAL_GROWTH = DEFAULT_PERSONAL_CARD_TEXTS.slice(3);
const APP_PRIORITY = ["instagram", "safari", "youtube", "whatsapp", "chrome"];

const FALLBACK_AVAILABLE_LAUNCHERS = [
  { id: "instagram", displayName: "Instagram", name: "Instagram", category: "social", iconSrc: "/icons/instagram-cover.jpg" },
  { id: "safari", displayName: "Safari", name: "Safari", category: "browser", iconSrc: "/safari-touch-icon.png" },
  { id: "youtube", displayName: "YouTube", name: "YouTube", category: "video", iconSrc: "/icons/youtube-cover.png" },
  { id: "whatsapp", displayName: "WhatsApp", name: "WhatsApp", category: "messaging" },
  { id: "chrome", displayName: "Chrome", name: "Chrome", category: "browser" },
];

function createChoice(text, selected = true) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    text,
    selected,
  };
}

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

function normalizeAvailableApps(availableLaunchers) {
  const source = availableLaunchers?.length ? availableLaunchers : FALLBACK_AVAILABLE_LAUNCHERS;
  const unique = new Map();
  source.forEach((launcher) => {
    if (!launcher?.id || launcher.available === false || launcher.enabled === false) return;
    unique.set(launcher.id, launcher);
  });
  return Array.from(unique.values()).sort((left, right) => {
    const leftRank = APP_PRIORITY.includes(left.id) ? APP_PRIORITY.indexOf(left.id) : APP_PRIORITY.length;
    const rightRank = APP_PRIORITY.includes(right.id) ? APP_PRIORITY.indexOf(right.id) : APP_PRIORITY.length;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return getLauncherName(left).localeCompare(getLauncherName(right));
  });
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

function OnboardingContent({ onSavePersonalSetup, onTryLauncher, onGoHome, onSkip, availableLaunchers = null }) {
  const apps = useMemo(() => normalizeAvailableApps(availableLaunchers), [availableLaunchers]);
  const [stepIndex, setStepIndex] = useState(0);
  const [personalDemoAnswered, setPersonalDemoAnswered] = useState(false);
  const [commitmentDemoAnswered, setCommitmentDemoAnswered] = useState(false);
  const [selectedLauncherId, setSelectedLauncherId] = useState(() => apps[0]?.id ?? "instagram");
  const [savedLauncherId, setSavedLauncherId] = useState(null);
  const [personalCards, setPersonalCards] = useState(() => DEFAULT_PERSONAL_CARD_TEXTS.map((text) => createChoice(text, true)));

  const selectedLauncher = apps.find((launcher) => launcher.id === selectedLauncherId) ?? apps[0] ?? FALLBACK_AVAILABLE_LAUNCHERS[0];
  const selectedAppName = getLauncherName(selectedLauncher);
  const canGoBack = stepIndex > 0;

  function goNext() {
    setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
  }

  function goBack() {
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function selectedTexts() {
    return personalCards
      .filter((choice) => choice.selected && choice.text.trim())
      .map((choice) => choice.text.trim());
  }

  function updateChoice(id, updates) {
    setPersonalCards((current) => current.map((choice) => (choice.id === id ? { ...choice, ...updates } : choice)));
  }

  function addChoice() {
    setPersonalCards((current) => [...current, createChoice("Write your own reminder", true)]);
  }

  function saveSetup() {
    const launcherId = selectedLauncher?.id ?? "instagram";
    setSavedLauncherId(launcherId);
    onSavePersonalSetup({
      personalCards: selectedTexts(),
      launcherId,
      appContext: {
        id: launcherId,
        label: selectedAppName,
        launcherId,
      },
    });
    return launcherId;
  }

  function finishToSuccess() {
    saveSetup();
    goNext();
  }

  function openShortcut() {
    const launcherId = savedLauncherId ?? saveSetup();
    onTryLauncher(launcherId);
  }

  function goHome() {
    if (!savedLauncherId) saveSetup();
    onGoHome();
  }

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
              title="The best thing that's ever happened to your phone."
              body="MyBishBash helps you use your favourite apps more intentionally."
              primaryLabel="Show me how it works"
              onPrimary={goNext}
              secondaryLabel="Skip and set it up myself"
              onSecondary={onSkip}
            >
              <p className="tiny-note" style={{ textAlign: "center" }}>
                Before you start, you can read the{" "}
                <a href={`${import.meta.env.BASE_URL}privacy-policy.md`} target="_blank" rel="noreferrer">
                  Privacy Policy
                </a>{" "}and{" "}
                <a href={`${import.meta.env.BASE_URL}terms-of-use.md`} target="_blank" rel="noreferrer">
                  Terms of Use
                </a>.
              </p>
            </OnboardingStep>
          ) : null}

          {stepIndex === 1 ? (
            <OnboardingStep
              title="Use your phone like someone who's building their life on purpose."
              body="Most people open apps automatically. MyBishBash helps you remember what's important before you disappear into the next app."
              primaryLabel="Show me"
              onPrimary={goNext}
              canGoBack={canGoBack}
              onBack={goBack}
            />
          ) : null}

          {stepIndex === 2 ? (
            <OnboardingStep
              title={personalDemoAnswered ? "This is a Personal Card." : "A little reminder from yourself."}
              body={personalDemoAnswered
                ? "Personal Cards are little reminders from yourself. You create them once. MyBishBash brings them back when they matter."
                : "Try this one."}
              primaryLabel={personalDemoAnswered ? "Continue" : null}
              onPrimary={personalDemoAnswered ? goNext : undefined}
              secondaryLabel={personalDemoAnswered ? "Skip tour" : null}
              onSecondary={personalDemoAnswered ? () => setStepIndex(7) : undefined}
              hidePrimary={!personalDemoAnswered}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <DemoCard title="Have you taken your vitamins today?">
                <div className="onboarding-demo-actions">
                  <button type="button" onClick={() => setPersonalDemoAnswered(true)}>Done</button>
                  <button type="button" onClick={() => setPersonalDemoAnswered(true)}>Not yet</button>
                </div>
              </DemoCard>
            </OnboardingStep>
          ) : null}

          {stepIndex === 3 ? (
            <OnboardingStep
              title={commitmentDemoAnswered ? "Commitments are optional." : "Today's Commitment"}
              body={commitmentDemoAnswered
                ? "Many people never use them. They help you make promises to yourself and check in later."
                : "I will read for 10 minutes tonight."}
              primaryLabel={commitmentDemoAnswered ? "Continue" : null}
              onPrimary={commitmentDemoAnswered ? goNext : undefined}
              hidePrimary={!commitmentDemoAnswered}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <DemoCard kicker="TODAY'S COMMITMENT" title="I will read for 10 minutes tonight.">
                <div className="onboarding-demo-actions">
                  <button type="button" onClick={() => setCommitmentDemoAnswered(true)}>I will commit</button>
                  <button type="button" onClick={() => setCommitmentDemoAnswered(true)}>Not this time</button>
                </div>
              </DemoCard>
            </OnboardingStep>
          ) : null}

          {stepIndex === 4 ? (
            <OnboardingStep
              title="What is inside MyBishBash"
              body="The MyBishBash app is where you create, manage and discover everything."
              primaryLabel="Continue"
              onPrimary={goNext}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <FlowDiagram items={["MyBishBash", "Personal Cards", "Commitments", "Explore", "Apps"]} />
            </OnboardingStep>
          ) : null}

          {stepIndex === 5 ? (
            <OnboardingStep
              title="How apps work"
              body="You can connect your favourite apps to MyBishBash. When you open a shortcut, MyBishBash can show reminders, commitments or intentional moments before continuing."
              primaryLabel="Continue"
              onPrimary={goNext}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <FlowDiagram items={["Instagram", "Instagram Shortcut", "MyBishBash", "Instagram"]} />
            </OnboardingStep>
          ) : null}

          {stepIndex === 6 ? (
            <OnboardingStep
              title="Add MyBishBash to your Home Screen"
              body="Install MyBishBash first. The first time you use a shortcut you may need to log in again."
              primaryLabel="I've added MyBishBash"
              onPrimary={goNext}
              secondaryLabel="I'll do this later"
              onSecondary={goNext}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <div className="onboarding-install-card">
                <img src={`${import.meta.env.BASE_URL}icons/apple-touch-icon.png`} alt="MyBishBash icon" />
                <ol className="onboarding-install-steps">
                  <li>Tap Share</li>
                  <li>Add to Home Screen</li>
                  <li>Tap Add</li>
                </ol>
              </div>
            </OnboardingStep>
          ) : null}

          {stepIndex === 7 ? (
            <OnboardingStep
              title="Choose your first app"
              body="Pick one favourite app to try with MyBishBash first."
              primaryLabel="Continue"
              onPrimary={goNext}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <div className="onboarding-app-options" role="radiogroup" aria-label="Choose your first app">
                {apps.map((launcher) => (
                  <button
                    key={launcher.id}
                    type="button"
                    className={`onboarding-app-option ${selectedLauncherId === launcher.id ? "selected" : ""}`}
                    onClick={() => setSelectedLauncherId(launcher.id)}
                    role="radio"
                    aria-checked={selectedLauncherId === launcher.id}
                  >
                    <img src={getLauncherIcon(launcher)} alt="" />
                    <span>{getLauncherName(launcher)}</span>
                  </button>
                ))}
              </div>
            </OnboardingStep>
          ) : null}

          {stepIndex === 8 ? (
            <OnboardingStep
              title="Starter content"
              body="Start with a few Personal Cards. You can change these any time."
              primaryLabel="Continue"
              onPrimary={finishToSuccess}
              canGoBack={canGoBack}
              onBack={goBack}
            >
              <ChoiceSection title="Everyday Reminders" choices={personalCards.filter((choice) => EVERYDAY_REMINDERS.includes(choice.text))} onToggle={updateChoice} />
              <ChoiceSection title="Personal Growth" choices={personalCards.filter((choice) => PERSONAL_GROWTH.includes(choice.text))} onToggle={updateChoice} />
              <div className="onboarding-choice-list">
                {personalCards.filter((choice) => !DEFAULT_PERSONAL_CARD_TEXTS.includes(choice.text)).map((choice) => (
                  <EditableChoice key={choice.id} choice={choice} onToggle={updateChoice} onEdit={updateChoice} />
                ))}
              </div>
              <button type="button" className="onboarding-add-card" onClick={addChoice}>
                Add my own card
              </button>
            </OnboardingStep>
          ) : null}

          {stepIndex === 9 ? (
            <OnboardingStep
              title="You're ready."
              body="Open your shortcut and see MyBishBash in action."
              primaryLabel={`Open ${selectedAppName} Shortcut`}
              onPrimary={openShortcut}
              secondaryLabel="Go to MyBishBash"
              onSecondary={goHome}
              canGoBack={canGoBack}
              onBack={goBack}
            />
          ) : null}
        </section>
      </div>
      <EditPanel />
    </div>
  );
}

const STEPS = ["welcome", "why", "personal", "commitment", "inside", "apps", "install", "choose", "starter", "success"];

function ChoiceSection({ title, choices, onToggle }) {
  return (
    <section className="onboarding-choice-section">
      <h3>{title}</h3>
      <div className="onboarding-choice-list">
        {choices.map((choice) => (
          <EditableChoice key={choice.id} choice={choice} onToggle={onToggle} onEdit={onToggle} readOnly />
        ))}
      </div>
    </section>
  );
}

function EditableChoice({ choice, onToggle, onEdit, readOnly = false }) {
  return (
    <label className={`onboarding-choice-card ${choice.selected ? "selected" : ""}`}>
      <input
        type="checkbox"
        checked={choice.selected}
        onChange={(event) => onToggle(choice.id, { selected: event.target.checked })}
      />
      <span className="choice-check" aria-hidden="true" />
      {readOnly ? (
        <span className="onboarding-choice-text">{choice.text}</span>
      ) : (
        <textarea
          value={choice.text}
          onChange={(event) => onEdit(choice.id, { text: event.target.value })}
          rows={2}
          aria-label="Card text"
        />
      )}
    </label>
  );
}

function DemoCard({ kicker, title, children }) {
  return (
    <article className="onboarding-demo-card">
      {kicker ? <p>{kicker}</p> : null}
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function FlowDiagram({ items }) {
  return (
    <div className="onboarding-flow-diagram">
      {items.map((item, index) => (
        <div key={`${item}:${index}`} className="onboarding-flow-item">
          <span>{item}</span>
          {index < items.length - 1 ? <strong aria-hidden="true">↓</strong> : null}
        </div>
      ))}
    </div>
  );
}

function OnboardingStep({
  title,
  body,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  hidePrimary = false,
  canGoBack = false,
  onBack,
}) {
  return (
    <div className="onboarding-step">
      {canGoBack ? (
        <button type="button" className="onboarding-back-button" onClick={onBack} aria-label="Go back">
          Back
        </button>
      ) : null}
      <div className="onboarding-step-copy">
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      {children ? <div className="onboarding-step-body">{children}</div> : null}
      {!hidePrimary ? (
        <div className="onboarding-actions">
          {primaryLabel ? (
            <button type="button" className="save-button" onClick={onPrimary}>
              {primaryLabel}
            </button>
          ) : null}
          {secondaryLabel ? (
            <button type="button" className="secondary-button" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StepIndicator({ currentIndex, total }) {
  return (
    <div className="onboarding-step-indicator" aria-label={`Step ${currentIndex + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, index) => (
        <span
          key={index}
          className={index <= currentIndex ? "active" : ""}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
