import { useMemo, useState } from "react";

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

const OPTIONAL_ACTION_CARD_TITLES = [
  "Text someone back",
  "Go for a walk",
  "Sleep instead",
  "Tidy one thing",
  "Read one page",
];

const FALLBACK_APPS = [
  { id: "safari", label: "Safari", launcherId: "safari" },
  { id: "youtube", label: "YouTube", launcherId: "youtube" },
  { id: "tiktok", label: "TikTok" },
  { id: "x", label: "X" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "custom", label: "Custom app" },
];

function createChoice(text, selected = true) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    text,
    selected,
  };
}

export default function Onboarding({ onSaveSetup, onTryLauncher, onGoHome }) {
  const [step, setStep] = useState("welcome");
  const [interrupterCards, setInterrupterCards] = useState(() =>
    DEFAULT_INTERRUPTER_CARDS.map((text) => createChoice(text, true)),
  );
  const [actionCards, setActionCards] = useState(() => [
    ...DEFAULT_ACTION_CARD_TITLES.map((text) => createChoice(text, true)),
    ...OPTIONAL_ACTION_CARD_TITLES.map((text) => createChoice(text, false)),
  ]);
  const [selectedAppId, setSelectedAppId] = useState("safari");
  const [customAppName, setCustomAppName] = useState("");
  const [savedLauncherId, setSavedLauncherId] = useState("instagram");

  const selectedFallbackApp = useMemo(
    () => FALLBACK_APPS.find((app) => app.id === selectedAppId) ?? FALLBACK_APPS[0],
    [selectedAppId],
  );

  function selectedTexts(choices) {
    return choices
      .filter((choice) => choice.selected && choice.text.trim())
      .map((choice) => choice.text.trim());
  }

  function updateChoice(setter, id, updates) {
    setter((current) => current.map((choice) => (choice.id === id ? { ...choice, ...updates } : choice)));
  }

  function addChoice(setter, text) {
    setter((current) => [...current, createChoice(text, true)]);
  }

  function saveSetup(launcher) {
    const fallbackLabel = selectedAppId === "custom"
      ? customAppName.trim() || "Custom app"
      : selectedFallbackApp.label;
    const launcherId = launcher?.launcherId ?? launcher?.id ?? "instagram";
    const appContext = launcher ?? { id: selectedAppId, label: fallbackLabel, launcherId: selectedFallbackApp.launcherId ?? null };

    setSavedLauncherId(launcherId || "instagram");
    onSaveSetup({
      interrupterCards: selectedTexts(interrupterCards),
      actionCards: selectedTexts(actionCards),
      launcherId: launcherId || "instagram",
      appContext,
    });
    setStep("done");
  }

  function saveFallbackApp() {
    saveSetup({
      id: selectedAppId,
      label: selectedAppId === "custom" ? customAppName.trim() || "Custom app" : selectedFallbackApp.label,
      launcherId: selectedFallbackApp.launcherId ?? null,
    });
  }

  return (
    <div className="overlay-screen onboarding-screen">
      <div className="onboarding-shell">
        <header className="onboarding-brand">
          <span className="onboarding-heart" aria-hidden="true">
            <HeartGlyph />
          </span>
          <h1>MyBishBash</h1>
        </header>

        <section className="onboarding-flow-card" aria-live="polite">
          <StepIndicator currentStep={step} />

          {step === "welcome" ? (
            <OnboardingStep
              title="Build your interruption layer."
              body="Choose what you want to see before opening an app, then choose what you could do instead."
              primaryLabel="Start setup"
              onPrimary={() => setStep("interrupters")}
            />
          ) : null}

          {step === "interrupters" ? (
            <OnboardingStep
              title="Choose 3 interrupter cards"
              body="These are the messages you’ll see before opening your launcher."
              primaryLabel="Continue"
              onPrimary={() => setStep("actions")}
            >
              <ChoiceCardList
                choices={interrupterCards}
                onToggle={(id, selected) => updateChoice(setInterrupterCards, id, { selected })}
                onEdit={(id, text) => updateChoice(setInterrupterCards, id, { text })}
                onAdd={() => addChoice(setInterrupterCards, "Write your own interrupter card")}
              />
            </OnboardingStep>
          ) : null}

          {step === "actions" ? (
            <OnboardingStep
              title="Choose 3 action cards"
              body="If you choose ‘Do something else’, these quick actions will appear."
              primaryLabel="Continue"
              onPrimary={() => setStep("launcher")}
            >
              <ChoiceCardList
                choices={actionCards}
                onToggle={(id, selected) => updateChoice(setActionCards, id, { selected })}
                onEdit={(id, text) => updateChoice(setActionCards, id, { text })}
                onAdd={() => addChoice(setActionCards, "Write your own action")}
              />
            </OnboardingStep>
          ) : null}

          {step === "launcher" ? (
            <OnboardingStep
              title="Set up your first launcher"
              body="Start with Instagram. You can add YouTube, Safari and more later."
              primaryLabel="Set up Instagram"
              onPrimary={() => setStep("install")}
              quietLabel="Skip Instagram setup"
              onQuiet={() => setStep("fallback-app")}
            />
          ) : null}

          {step === "install" ? (
            <OnboardingStep
              title="Add your Instagram launcher"
              body="This creates a home-screen shortcut that helps you pause before opening Instagram."
              primaryLabel="I’ve added it"
              onPrimary={() => saveSetup({ id: "instagram", label: "Instagram", launcherId: "instagram" })}
              quietLabel="Skip this for now"
              onQuiet={() => setStep("fallback-app")}
            >
              <ol className="onboarding-install-steps">
                <li>Tap Share</li>
                <li>Tap Add to Home Screen</li>
                <li>Name it Instagram</li>
                <li>Open it when you’re about to scroll</li>
              </ol>
            </OnboardingStep>
          ) : null}

          {step === "fallback-app" ? (
            <OnboardingStep
              title="Choose an app you use often"
              body="MyBishBash works best when it starts with an app you open without thinking."
              primaryLabel="Use this app"
              onPrimary={saveFallbackApp}
            >
              <div className="onboarding-app-options" role="radiogroup" aria-label="Choose an app">
                {FALLBACK_APPS.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    className={`onboarding-app-option ${selectedAppId === app.id ? "selected" : ""}`}
                    onClick={() => setSelectedAppId(app.id)}
                    role="radio"
                    aria-checked={selectedAppId === app.id}
                  >
                    {app.label}
                  </button>
                ))}
              </div>
              {selectedAppId === "custom" ? (
                <label className="onboarding-custom-app">
                  <span>App name</span>
                  <input
                    type="text"
                    value={customAppName}
                    onChange={(event) => setCustomAppName(event.target.value)}
                    placeholder="App name"
                  />
                </label>
              ) : null}
            </OnboardingStep>
          ) : null}

          {step === "done" ? (
            <OnboardingStep
              title="Your interruption layer is ready"
              body="Next time you tap your launcher, you’ll see one of your interrupter cards. Choose ‘Do something else’ to see your action cards, or continue to the app."
              primaryLabel="Try it now"
              onPrimary={() => onTryLauncher(savedLauncherId)}
              secondaryLabel="Go to home"
              onSecondary={onGoHome}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ChoiceCardList({ choices, onToggle, onEdit, onAdd }) {
  return (
    <div className="onboarding-choice-list">
      {choices.map((choice) => (
        <label key={choice.id} className={`onboarding-choice-card ${choice.selected ? "selected" : ""}`}>
          <input
            type="checkbox"
            checked={choice.selected}
            onChange={(event) => onToggle(choice.id, event.target.checked)}
          />
          <span className="choice-check" aria-hidden="true" />
          <textarea
            value={choice.text}
            onChange={(event) => onEdit(choice.id, event.target.value)}
            rows={2}
            aria-label="Card text"
          />
        </label>
      ))}
      <button type="button" className="onboarding-add-card" onClick={onAdd}>
        Add my own card
      </button>
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
  quietLabel,
  onQuiet,
}) {
  return (
    <div className="onboarding-step">
      <div className="onboarding-step-copy">
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      {children ? <div className="onboarding-step-body">{children}</div> : null}
      <div className="onboarding-actions">
        <button type="button" className="save-button" onClick={onPrimary}>
          {primaryLabel}
        </button>
        {secondaryLabel ? (
          <button type="button" className="secondary-button" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        ) : null}
      </div>
      {quietLabel ? (
        <button type="button" className="onboarding-quiet-link" onClick={onQuiet}>
          {quietLabel}
        </button>
      ) : null}
    </div>
  );
}

function StepIndicator({ currentStep }) {
  const steps = ["welcome", "interrupters", "actions", "launcher", "install", "done"];
  const activeIndex = currentStep === "fallback-app" ? 4 : steps.indexOf(currentStep);

  return (
    <div className="onboarding-step-indicator" aria-label={`Step ${Math.max(activeIndex, 0) + 1} of ${steps.length}`}>
      {steps.map((step, index) => (
        <span
          key={step}
          className={index <= activeIndex ? "active" : ""}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function HeartGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="heart-glyph" aria-hidden="true">
      <path d="M16 27s-9-6-12-11c-3-5 0-11 6-11 3 0 5 1 6 4 1-3 3-4 6-4 6 0 9 6 6 11-3 5-12 11-12 11z" />
    </svg>
  );
}
