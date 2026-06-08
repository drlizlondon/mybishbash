import { useMemo, useState } from "react";
import "./landing.css";
import { ContentEditProvider, EditableText, EditPanel, useContentEdit } from "./editing/ContentEditContext";
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

function OnboardingContent({ onSaveSetup, onSavePersonalSetup, onTryLauncher, onGoHome }) {
  const { content } = useContentEdit();
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
      personalCards: selectedTexts(personalCards),
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
    setStep("personal-cards");
  }

  function getPreviousStep() {
    if (step === "route") return "welcome";
    if (step === "personal-cards") return "route";
    if (step === "context") return "personal-cards";
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
          <EditableText as="h1" path="brand" />
        </header>

        <section className="onboarding-flow-card" aria-live="polite">
          <StepIndicator currentStep={step} />

          {step === "welcome" ? (
            <OnboardingStep
              title={<EditableText path="welcome.title" />}
              body={<EditableText path="welcome.body" />}
              primaryLabel={<EditableText path="welcome.primary" />}
              onPrimary={() => setStep("route")}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
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

          {step === "route" ? (
            <OnboardingStep
              title={<EditableText path="route.title" />}
              body={<EditableText path="route.body" />}
              hidePrimary
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            >
              <div className="onboarding-route-options">
                <button type="button" className="onboarding-route-card" onClick={() => chooseRoute("frequent")}>
                  <EditableText as="strong" path="route.frequent.title" />
                  <EditableText as="span" path="route.frequent.body" />
                  <EditableText as="em" path="route.frequent.meta" />
                </button>
                <button type="button" className="onboarding-route-card" onClick={() => chooseRoute("pause")}>
                  <EditableText as="strong" path="route.pause.title" />
                  <EditableText as="span" path="route.pause.body" />
                  <EditableText as="em" path="route.pause.meta" />
                </button>
              </div>
            </OnboardingStep>
          ) : null}

          {step === "personal-cards" ? (
            <OnboardingStep
              title={<EditableText path="personalCards.title" />}
              body={<EditableText path="personalCards.body" />}
              primaryLabel={<EditableText path="personalCards.primary" />}
              onPrimary={() => setStep(route === "frequent" ? "safari-launcher" : "context")}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            >
              <ChoiceCardList
                choices={personalCards}
                onToggle={(id, selected) => updateChoice(setPersonalCards, id, { selected })}
                onEdit={(id, text) => updateChoice(setPersonalCards, id, { text })}
                onAdd={() => addChoice(setPersonalCards, "Write your own reminder")}
                addLabel={<EditableText path="personalCards.add" />}
              />
            </OnboardingStep>
          ) : null}

          {step === "safari-launcher" ? (
            <OnboardingStep
              title={<EditableText path="safariLauncher.title" />}
              body={<EditableText path="safariLauncher.body" />}
              primaryLabel={<EditableText path="safariLauncher.primary" />}
              onPrimary={() => setStep("safari-install")}
              quietLabel={<EditableText path="safariLauncher.quiet" />}
              onQuiet={saveFrequentUseSetup}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            >
              <EditableText as="p" className="onboarding-supporting-copy" path="safariLauncher.supporting" />
            </OnboardingStep>
          ) : null}

          {step === "safari-install" ? (
            <InstallStep
              appName="Safari"
              body={<EditableText path="install.safariBody" />}
              onDone={saveFrequentUseSetup}
              onSkip={saveFrequentUseSetup}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            />
          ) : null}

          {step === "context" ? (
            <OnboardingStep
              title={<EditableText path="context.title" />}
              body={<EditableText path="context.body" />}
              primaryLabel={<EditableText path="context.primary" />}
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
              title={<EditableText path="interrupters.title" />}
              body={<EditableText path="interrupters.body" />}
              primaryLabel={<EditableText path="interrupters.primary" />}
              onPrimary={() => setStep("actions")}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            >
              <ChoiceCardList
                choices={interrupterCards}
                onToggle={(id, selected) => updateChoice(setInterrupterCards, id, { selected })}
                onEdit={(id, text) => updateChoice(setInterrupterCards, id, { text })}
                onAdd={() => addChoice(setInterrupterCards, "Write your own interrupter card")}
                addLabel={<EditableText path="interrupters.add" />}
              />
            </OnboardingStep>
          ) : null}

          {step === "actions" ? (
            <OnboardingStep
              title={<EditableText path="actions.title" />}
              body={<EditableText path="actions.body" />}
              primaryLabel={<EditableText path="actions.primary" />}
              onPrimary={() => setStep("launcher")}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            >
              <ChoiceCardList
                choices={actionCards}
                onToggle={(id, selected) => updateChoice(setActionCards, id, { selected })}
                onEdit={(id, text) => updateChoice(setActionCards, id, { text })}
                onAdd={() => addChoice(setActionCards, "Write your own action")}
                addLabel={<EditableText path="actions.add" />}
              />
            </OnboardingStep>
          ) : null}

          {step === "launcher" ? (
            <OnboardingStep
              title={<EditableText path="launcher.title" />}
              body={<>{content.launcher.bodyPrefix} {selectedLauncher?.label ?? "Instagram"}. {content.launcher.bodySuffix}</>}
              primaryLabel={<>{content.launcher.primaryPrefix} {selectedLauncher?.label ?? "Instagram"}</>}
              onPrimary={() => setStep("install")}
              quietLabel={<>{content.launcher.quietPrefix} {selectedLauncher?.label ?? "Instagram"} {content.launcher.quietSuffix}</>}
              onQuiet={() => savePauseSetup(selectedLauncher)}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            />
          ) : null}

          {step === "install" ? (
            <InstallStep
              appName={selectedLauncher?.label ?? "Instagram"}
              body={<>{content.install.pauseBodyPrefix} {selectedLauncher?.label ?? "Instagram"}.</>}
              onDone={() => savePauseSetup(selectedLauncher)}
              onSkip={() => savePauseSetup(selectedLauncher)}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            />
          ) : null}

          {step === "done" ? (
            <OnboardingStep
              title={route === "frequent" ? <EditableText path="done.frequentTitle" /> : <EditableText path="done.pauseTitle" />}
              body={route === "frequent" ? <EditableText path="done.frequentBody" /> : <EditableText path="done.pauseBody" />}
              primaryLabel={<EditableText path="done.primary" />}
              onPrimary={() => onTryLauncher(savedLauncherId)}
              secondaryLabel={<EditableText path="done.secondary" />}
              onSecondary={onGoHome}
              canGoBack={Boolean(previousStep)}
              onBack={goBack}
            >
              <p className="onboarding-supporting-copy">
                {route === "frequent"
                  ? <EditableText path="done.frequentSupporting" />
                  : <EditableText path="done.pauseSupporting" />}
              </p>
            </OnboardingStep>
          ) : null}
        </section>
      </div>
      <EditPanel />
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
  const { content } = useContentEdit();
  const isSafari = appName === "Safari";

  return (
    <OnboardingStep
      title={<>{content.install.titlePrefix} {appName} {content.install.titleSuffix}</>}
      body={body}
      primaryLabel={<EditableText path="install.primary" />}
      onPrimary={onDone}
      quietLabel={<EditableText path="install.quiet" />}
      onQuiet={onSkip}
      canGoBack={canGoBack}
      onBack={onBack}
    >
      <ol className="onboarding-install-steps">
        <li><EditableText path="install.steps.0" /></li>
        <li><EditableText path="install.steps.1" /></li>
        <li><EditableText path="install.steps.2" /> {isSafari ? "MyBishBash Safari" : appName}</li>
        <li>{appName === "Safari" ? <EditableText path="install.steps.3" /> : <EditableText path="install.steps.4" />}</li>
      </ol>
      {isSafari ? (
        <div className="onboarding-safari-tip">
          <img src={`${import.meta.env.BASE_URL}safari-touch-icon.png`} alt="MyBishBash Safari shortcut icon" />
          <EditableText as="p" path="install.safariTip" />
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
  const { content } = useContentEdit();
  return (
    <div className="onboarding-step">
      {canGoBack ? (
        <button type="button" className="onboarding-back-button" onClick={onBack} aria-label="Go back">
          <EditableText path="back" />
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
