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

export const DEFAULT_PERSONAL_CARD_TEXTS = [
  "Drink some water.",
  "Stretch your neck.",
  "What matters most right now?",
];

const OPTIONAL_PERSONAL_CARD_TEXTS = [
  "Text someone back.",
  "Read one page.",
  "Take a proper breath.",
  "Tidy one thing.",
  "Step outside for a minute.",
];

const OPTIONAL_ACTION_CARD_TITLES = [
  "Text someone back",
  "Go for a walk",
  "Sleep instead",
  "Tidy one thing",
  "Read one page",
];

const INTERRUPTION_CONTEXTS = {
  social: {
    label: "Social media",
    launchers: [
      { id: "instagram", label: "Instagram", launcherId: "instagram", available: true },
      { id: "tiktok", label: "TikTok", available: false },
    ],
  },
  videos: {
    label: "Videos",
    launchers: [
      { id: "youtube", label: "YouTube", launcherId: "youtube", available: true },
    ],
  },
};

function createChoice(text, selected = true) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    text,
    selected,
  };
}

export default function Onboarding({ onSaveSetup, onSavePersonalSetup, onTryLauncher, onGoHome }) {
  const [step, setStep] = useState("welcome");
  const [route, setRoute] = useState(null);
  const [personalCards, setPersonalCards] = useState(() => [
    ...DEFAULT_PERSONAL_CARD_TEXTS.map((text) => createChoice(text, true)),
    ...OPTIONAL_PERSONAL_CARD_TEXTS.map((text) => createChoice(text, false)),
  ]);
  const [interrupterCards, setInterrupterCards] = useState(() =>
    DEFAULT_INTERRUPTER_CARDS.map((text) => createChoice(text, true)),
  );
  const [actionCards, setActionCards] = useState(() => [
    ...DEFAULT_ACTION_CARD_TITLES.map((text) => createChoice(text, true)),
    ...OPTIONAL_ACTION_CARD_TITLES.map((text) => createChoice(text, false)),
  ]);
  const [interruptionContext, setInterruptionContext] = useState("social");
  const [selectedLauncherId, setSelectedLauncherId] = useState("instagram");
  const [savedLauncherId, setSavedLauncherId] = useState("instagram");

  const contextLaunchers = INTERRUPTION_CONTEXTS[interruptionContext].launchers;
  const selectedLauncher = useMemo(
    () => contextLaunchers.find((launcher) => launcher.id === selectedLauncherId && launcher.available) ?? contextLaunchers.find((launcher) => launcher.available),
    [contextLaunchers, selectedLauncherId],
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

  function savePauseSetup(launcher) {
    const launcherId = launcher?.launcherId ?? launcher?.id ?? selectedLauncher?.launcherId ?? "instagram";
    const appContext = launcher ?? selectedLauncher ?? { id: "instagram", label: "Instagram", launcherId: "instagram" };
    setSavedLauncherId(launcherId || "instagram");
    onSaveSetup({
      interrupterCards: selectedTexts(interrupterCards),
      actionCards: selectedTexts(actionCards),
      launcherId: launcherId || "instagram",
      appContext,
    });
    setStep("done");
  }

  function saveFrequentUseSetup() {
    setSavedLauncherId("safari");
    onSavePersonalSetup({
      personalCards: selectedTexts(personalCards),
      launcherId: "safari",
      appContext: { id: "safari", label: "Safari", launcherId: "safari" },
    });
    setStep("done");
  }

  function chooseRoute(nextRoute) {
    setRoute(nextRoute);
    setStep(nextRoute === "frequent" ? "personal-cards" : "context");
  }

  function getPreviousStep() {
    if (step === "route") return "welcome";
    if (step === "personal-cards" || step === "context") return "route";
    if (step === "safari-launcher") return "personal-cards";
    if (step === "safari-install") return "safari-launcher";
    if (step === "interrupters") return "context";
    if (step === "actions") return "interrupters";
    if (step === "launcher") return "actions";
    if (step === "install") return "launcher";
    if (step === "done") return route === "frequent" ? "safari-install" : "install";
    return null;
  }

  function goBack() {
    const previous = getPreviousStep();
    if (previous) setStep(previous);
  }

  const previousStep = getPreviousStep();

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
              title="Build your first MyBishBash."
              body="Start with one clear setup. You can add more shortcuts and card types later."
              primaryLabel="Start setup"
              onPrimary={() => setStep("route")}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            />
          ) : null}

          {step === "route" ? (
            <OnboardingStep
              title="How do you want to use MyBishBash first?"
              body="This is just your first setup. You can add the other shortcut type later."
              hidePrimary
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            >
              <div className="onboarding-route-options">
                <button type="button" className="onboarding-route-card" onClick={() => chooseRoute("frequent")}>
                  <strong>Reminders during everyday phone use</strong>
                  <span>Surface personal reminders throughout the day while browsing or checking your phone.</span>
                  <em>Recommended shortcut: Safari</em>
                </button>
                <button type="button" className="onboarding-route-card" onClick={() => chooseRoute("pause")}>
                  <strong>Pause before scrolling</strong>
                  <span>Create a small intentional moment before social media or video apps open.</span>
                  <em>Popular shortcuts: Instagram, TikTok, YouTube</em>
                </button>
              </div>
            </OnboardingStep>
          ) : null}

          {step === "personal-cards" ? (
            <OnboardingStep
              title="Create your first MyBishBash cards"
              body="What do you want to remember during everyday phone use?"
              primaryLabel="Continue"
              onPrimary={() => setStep("safari-launcher")}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            >
              <ChoiceCardList
                choices={personalCards}
                onToggle={(id, selected) => updateChoice(setPersonalCards, id, { selected })}
                onEdit={(id, text) => updateChoice(setPersonalCards, id, { text })}
                onAdd={() => addChoice(setPersonalCards, "Write your own reminder")}
                addLabel="Create my own"
              />
            </OnboardingStep>
          ) : null}

          {step === "safari-launcher" ? (
            <OnboardingStep
              title="Set up your Safari shortcut"
              body="This lets your reminders appear during everyday phone use."
              primaryLabel="Set up Safari"
              onPrimary={() => setStep("safari-install")}
              quietLabel="Skip Safari setup"
              onQuiet={saveFrequentUseSetup}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            >
              <p className="onboarding-supporting-copy">You can add social-media pause shortcuts later.</p>
            </OnboardingStep>
          ) : null}

          {step === "safari-install" ? (
            <InstallStep
              appName="Safari"
              body="This creates a home-screen shortcut for everyday browsing and phone checks."
              onDone={saveFrequentUseSetup}
              onSkip={saveFrequentUseSetup}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            />
          ) : null}

          {step === "context" ? (
            <OnboardingStep
              title="Where do you want more intentional pause moments?"
              body="Choose the kind of shortcut you want to set up first."
              primaryLabel="Continue"
              onPrimary={() => setStep("interrupters")}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            >
              <div className="onboarding-context-options" role="radiogroup" aria-label="Choose interruption context">
                {Object.entries(INTERRUPTION_CONTEXTS).map(([id, context]) => (
                  <button
                    key={id}
                    type="button"
                    className={`onboarding-app-option ${interruptionContext === id ? "selected" : ""}`}
                    onClick={() => {
                      setInterruptionContext(id);
                      setSelectedLauncherId(context.launchers.find((launcher) => launcher.available)?.id ?? "instagram");
                    }}
                    role="radio"
                    aria-checked={interruptionContext === id}
                  >
                    {context.label}
                  </button>
                ))}
              </div>
              <div className="onboarding-app-options" role="radiogroup" aria-label="Choose shortcut">
                {contextLaunchers.map((launcher) => (
                  <button
                    key={launcher.id}
                    type="button"
                    className={`onboarding-app-option ${selectedLauncherId === launcher.id ? "selected" : ""}`}
                    onClick={() => launcher.available && setSelectedLauncherId(launcher.id)}
                    role="radio"
                    aria-checked={selectedLauncherId === launcher.id}
                    disabled={!launcher.available}
                  >
                    {launcher.label}
                    {!launcher.available ? <span>Later</span> : null}
                  </button>
                ))}
              </div>
            </OnboardingStep>
          ) : null}

          {step === "interrupters" ? (
            <OnboardingStep
              title="Choose 3 interrupter cards"
              body="These are the messages you’ll see before opening your launcher."
              primaryLabel="Continue"
              onPrimary={() => setStep("actions")}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            >
              <ChoiceCardList
                choices={interrupterCards}
                onToggle={(id, selected) => updateChoice(setInterrupterCards, id, { selected })}
                onEdit={(id, text) => updateChoice(setInterrupterCards, id, { text })}
                onAdd={() => addChoice(setInterrupterCards, "Write your own interrupter card")}
                addLabel="Create my own"
              />
            </OnboardingStep>
          ) : null}

          {step === "actions" ? (
            <OnboardingStep
              title="Choose 3 action cards"
              body="If you choose ‘Do something else’, these quick actions will appear."
              primaryLabel="Continue"
              onPrimary={() => setStep("launcher")}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            >
              <ChoiceCardList
                choices={actionCards}
                onToggle={(id, selected) => updateChoice(setActionCards, id, { selected })}
                onEdit={(id, text) => updateChoice(setActionCards, id, { text })}
                onAdd={() => addChoice(setActionCards, "Write your own action")}
                addLabel="Create my own"
              />
            </OnboardingStep>
          ) : null}

          {step === "launcher" ? (
            <OnboardingStep
              title="Set up your first launcher"
              body={`Start with ${selectedLauncher?.label ?? "Instagram"}. You can add more shortcuts later.`}
              primaryLabel={`Set up ${selectedLauncher?.label ?? "Instagram"}`}
              onPrimary={() => setStep("install")}
              quietLabel={`Skip ${selectedLauncher?.label ?? "Instagram"} setup`}
              onQuiet={() => savePauseSetup(selectedLauncher)}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            />
          ) : null}

          {step === "install" ? (
            <InstallStep
              appName={selectedLauncher?.label ?? "Instagram"}
              body={`This creates a home-screen shortcut that helps you pause before opening ${selectedLauncher?.label ?? "Instagram"}.`}
              onDone={() => savePauseSetup(selectedLauncher)}
              onSkip={() => savePauseSetup(selectedLauncher)}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            />
          ) : null}

          {step === "done" ? (
            <OnboardingStep
              title={route === "frequent" ? "Your Safari reminders are ready" : "Your interruption layer is ready"}
              body={route === "frequent"
                ? "Next time you tap your Safari shortcut, MyBishBash can surface one of your personal reminders during everyday phone use."
                : "Next time you tap your launcher, you’ll see one of your interrupter cards. Choose ‘Do something else’ to see your action cards, or continue to the app."}
              primaryLabel="Try it now"
              onPrimary={() => onTryLauncher(savedLauncherId)}
              secondaryLabel="Go to home"
              onSecondary={onGoHome}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            >
              <p className="onboarding-supporting-copy">
                {route === "frequent"
                  ? "Also available: pause moments before social media and video apps."
                  : "Also available: reminders throughout everyday phone use."}
              </p>
            </OnboardingStep>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ChoiceCardList({ choices, onToggle, onEdit, onAdd, addLabel = "Add my own card" }) {
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
        {addLabel}
      </button>
    </div>
  );
}

function InstallStep({ appName, body, onDone, onSkip, canGoBack, onBack }) {
  const isSafari = appName === "Safari";

  return (
    <OnboardingStep
      title={`Add your ${appName} shortcut`}
      body={body}
      primaryLabel="I’ve added it"
      onPrimary={onDone}
      quietLabel="Skip this for now"
      onQuiet={onSkip}
      canGoBack={canGoBack}
      onBack={onBack}
    >
      <ol className="onboarding-install-steps">
        <li>Tap Share</li>
        <li>Tap Add to Home Screen</li>
        <li>{`Name it ${isSafari ? "MyBishBash Safari" : appName}`}</li>
        <li>{appName === "Safari" ? "Open it when you’re about to browse" : "Open it when you’re about to scroll"}</li>
      </ol>
      {isSafari ? (
        <div className="onboarding-safari-tip">
          <img src={`${import.meta.env.BASE_URL}safari-touch-icon.png`} alt="MyBishBash Safari shortcut icon" />
          <p>Tip: move your Safari app into a folder, then put MyBishBash Safari where Safari used to be.</p>
        </div>
      ) : null}
    </OnboardingStep>
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
          <button type="button" className="save-button" onClick={onPrimary}>
            {primaryLabel}
          </button>
        {secondaryLabel ? (
          <button type="button" className="secondary-button" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        ) : null}
        </div>
      ) : null}
      {quietLabel ? (
        <button type="button" className="onboarding-quiet-link" onClick={onQuiet}>
          {quietLabel}
        </button>
      ) : null}
    </div>
  );
}

function StepIndicator({ currentStep }) {
  const steps = ["welcome", "route", "cards", "launcher", "install", "done"];
  const stepAliases = {
    "personal-cards": "cards",
    context: "cards",
    interrupters: "cards",
    actions: "cards",
    "safari-launcher": "launcher",
    "safari-install": "install",
  };
  const activeIndex = steps.indexOf(stepAliases[currentStep] ?? currentStep);

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
