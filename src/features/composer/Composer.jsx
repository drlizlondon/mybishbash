import { useRef, useState } from "react";
import { isUnlimited } from "../../lib/accessCapabilities";
import { BrandMark } from "../../components/BrandMark";
import CardIcon from "../../components/CardIcon";
import {
  THEMES,
  ICON_OPTIONS,
  FREQUENCY_OPTIONS,
  TIME_WINDOWS,
  COMMITMENT_TIMING_OPTIONS,
  getThemeClass,
  isCommitmentCard,
  resolveTheme,
  getCommitmentTimingConfig,
  getCommitmentTimingOptionId,
  getGreeting,
} from "../../utils";

export function parseBulkCards(text) {
  const lines = text.split(/\r?\n/);
  const cards = [];
  const seen = new Set();

  for (const line of lines) {
    let clean = line.trim();
    if (!clean) continue;

    clean = clean.replace(/^[-•*]\s+/, "");
    clean = clean.replace(/^\d+[.)]\s+/, "");
    clean = clean.trim();

    if (clean && !seen.has(clean)) {
      seen.add(clean);
      cards.push(clean);
    }
  }

  return cards;
}

export default function Composer({ initialCard, initialKind = "personal", initialDraft = null, personalCardCount = 0, maxPersonalCards = null, onClose, onSave }) {
  const commitmentInputRef = useRef(null);
  const isEditingExisting = Boolean(initialCard);
  const initialCardKind = initialCard ? (isCommitmentCard(initialCard) ? "commitment" : "personal") : initialKind;
  const [cardKind, setCardKind] = useState(initialCardKind);
  const [promptText, setPromptText] = useState(initialCard?.promptText ?? initialDraft?.promptText ?? "");
  const [commitmentReason, setCommitmentReason] = useState(initialCard?.commitmentReason ?? initialDraft?.commitmentReason ?? "");
  const [commitmentTimingMode, setCommitmentTimingMode] = useState(initialCard ? getCommitmentTimingOptionId(initialCard) : initialDraft?.commitmentTimingMode ?? "anytime");
  const [commitmentCustomStartTime, setCommitmentCustomStartTime] = useState(initialCard?.commitmentCustomStartTime ?? initialDraft?.commitmentCustomStartTime ?? "09:00");
  const [commitmentCustomEndTime, setCommitmentCustomEndTime] = useState(initialCard?.commitmentCustomEndTime ?? initialDraft?.commitmentCustomEndTime ?? "17:00");
  const [commitmentCheckInEnabled, setCommitmentCheckInEnabled] = useState(initialCard ? Boolean(initialCard.commitmentCheckInEnabled) : Boolean(initialDraft?.commitmentCheckInEnabled));
  const [commitmentCheckInTime, setCommitmentCheckInTime] = useState(initialCard?.commitmentCheckInTime ?? initialDraft?.commitmentCheckInTime ?? "20:00");
  const [bulkText, setBulkText] = useState("");
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [theme, setTheme] = useState(resolveTheme(initialCard?.theme ?? initialDraft?.theme));
  const [icon, setIcon] = useState(initialCard?.icon ?? initialDraft?.icon ?? "heart");
  const [frequency, setFrequency] = useState(initialCard?.frequency ?? "once_daily");
  const [timingWindows, setTimingWindows] = useState(initialCard?.timingWindows ?? ["morning", "day", "evening"]);
  const [showValidation, setShowValidation] = useState(false);

  const bulkCardsCount = isBulkMode ? parseBulkCards(bulkText).length : 0;
  const trimmedCommitment = promptText.trim();
  const isCommitmentMode = cardKind === "commitment";
  // Free-tier personal-card cap. Only applies to NEW personal cards (never to
  // edits or commitments). null = unlimited.
  const personalCardsAdding = isCommitmentMode ? 0 : isBulkMode ? Math.max(bulkCardsCount, 1) : 1;
  const personalLimitReached =
    !isEditingExisting &&
    !isCommitmentMode &&
    !isUnlimited(maxPersonalCards) &&
    personalCardCount + personalCardsAdding > maxPersonalCards;
  const commitmentTimingConfig = getCommitmentTimingConfig(commitmentTimingMode);
  const commitmentCustomTimeMissing = commitmentTimingMode === "custom" && (!commitmentCustomStartTime || !commitmentCustomEndTime);
  const commitmentCheckInTimeMissing = commitmentCheckInEnabled && !commitmentCheckInTime;
  const canSaveCommitment = Boolean(trimmedCommitment) && !commitmentCustomTimeMissing && !commitmentCheckInTimeMissing;

  function handleSubmit(event) {
    event.preventDefault();
    if (isCommitmentMode) {
      if (!canSaveCommitment) {
        setShowValidation(true);
        return;
      }
      onSave({
        cardKind: "commitment",
        promptText,
        commitmentReason,
        commitmentTimingMode,
        commitmentCustomStartTime: commitmentTimingMode === "custom" ? commitmentCustomStartTime : "",
        commitmentCustomEndTime: commitmentTimingMode === "custom" ? commitmentCustomEndTime : "",
        commitmentCheckInEnabled,
        commitmentCheckInTime: commitmentCheckInEnabled ? commitmentCheckInTime : "",
        theme,
        icon,
        frequency: "once_daily",
        timingWindows: commitmentTimingConfig.timingWindows,
      });
      return;
    }

    if (personalLimitReached) {
      setShowValidation(true);
      return;
    }

    if (isBulkMode) {
      const parsed = parseBulkCards(bulkText);
      if (parsed.length === 0) {
        setShowValidation(true);
        return;
      }
      onSave({ bulkTexts: parsed, theme, icon: "heart", frequency: "once_daily", timingWindows: ["day"] });
    } else {
      const trimmed = promptText.trim();
      if (!trimmed) {
        setShowValidation(true);
        return;
      }

      onSave({ promptText: trimmed, theme, icon, frequency, timingWindows });
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="composer" data-testid="card-composer" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="composer-heading">
          <p className="eyebrow">{initialCard ? "Edit your myBishBash" : "Make a myBishBash"}</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        {!initialCard ? (
          <div className="field" style={{ marginBottom: "24px" }}>
            <div className="frequency-grid">
              <button
                type="button"
                className={`frequency-option ${cardKind === "personal" ? "selected" : ""}`}
                onClick={() => {
                  setCardKind("personal");
                  setIsBulkMode(false);
                }}
              >
                Personal Card
              </button>
              <button
                type="button"
                className={`frequency-option ${cardKind === "commitment" ? "selected" : ""}`}
                onClick={() => {
                  setCardKind("commitment");
                  setIsBulkMode(false);
                }}
              >
                Commitment Card
              </button>
            </div>
          </div>
        ) : null}
        {!initialCard && !isCommitmentMode ? (
          <div className="field" style={{ marginBottom: "24px" }}>
            <div className="frequency-grid">
              <button
                type="button"
                className={`frequency-option ${!isBulkMode ? "selected" : ""}`}
                onClick={() => setIsBulkMode(false)}
              >
                Single card
              </button>
              <button
                type="button"
                className={`frequency-option ${isBulkMode ? "selected" : ""}`}
                onClick={() => setIsBulkMode(true)}
              >
                Multiple cards
              </button>
            </div>
          </div>
        ) : null}
        {isCommitmentMode ? (
          <>
            <label className="field">
              <span>What are you committing to?</span>
              <textarea
                data-testid="commitment-text-input"
                ref={commitmentInputRef}
                value={promptText}
                onChange={(event) => {
                  setPromptText(event.target.value);
                  if (showValidation && event.target.value.trim()) {
                    setShowValidation(false);
                  }
                }}
                placeholder="not have a cigarette today"
                rows={4}
              />
              <span className="field-hint">Write something that makes sense after “I will...”</span>
              <span className="field-hint">Examples: not have a cigarette today · not eat snacks after dinner · avoid cheese · read my Bible · go for a walk · be patient with the children</span>
              {showValidation ? (
                <span className="field-hint">
                  {trimmedCommitment ? "Finish the selected timing details before saving." : "Add the exact commitment text before saving."}
                </span>
              ) : null}
            </label>
            <label className="field">
              <span>Why is this important?</span>
              <textarea
                data-testid="commitment-reason-input"
                value={commitmentReason}
                onChange={(event) => setCommitmentReason(event.target.value)}
                placeholder="Write the message you want to see if this feels hard today."
                rows={4}
              />
            </label>
            <label className="field">
              <span>When should this card appear?</span>
              <select
                className="settings-input"
                data-testid="commitment-window-select"
                value={commitmentTimingMode}
                onChange={(event) => setCommitmentTimingMode(event.target.value)}
              >
                {COMMITMENT_TIMING_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {commitmentTimingMode === "custom" ? (
              <div className="commitment-custom-time-grid">
                <label className="field">
                  <span>Start time</span>
                  <input
                    className="settings-input"
                    data-testid="commitment-start-time-input"
                    type="time"
                    value={commitmentCustomStartTime}
                    onChange={(event) => setCommitmentCustomStartTime(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>End time</span>
                  <input
                    className="settings-input"
                    data-testid="commitment-end-time-input"
                    type="time"
                    value={commitmentCustomEndTime}
                    onChange={(event) => setCommitmentCustomEndTime(event.target.value)}
                  />
                </label>
              </div>
            ) : null}
            <div className="field">
              <span>Would you like a check-in?</span>
              <div className="frequency-grid" data-testid="commitment-check-in-toggle">
                <button
                  type="button"
                  className={`frequency-option ${!commitmentCheckInEnabled ? "selected" : ""}`}
                  onClick={() => setCommitmentCheckInEnabled(false)}
                >
                  No
                </button>
                <button
                  type="button"
                  className={`frequency-option ${commitmentCheckInEnabled ? "selected" : ""}`}
                  onClick={() => setCommitmentCheckInEnabled(true)}
                >
                  Yes
                </button>
              </div>
            </div>
            {commitmentCheckInEnabled ? (
              <label className="field">
                <span>Check-in time</span>
                <input
                  className="settings-input"
                  data-testid="commitment-check-in-time-input"
                  type="time"
                  value={commitmentCheckInTime}
                  onChange={(event) => setCommitmentCheckInTime(event.target.value)}
                />
              </label>
            ) : null}
            <div className={`composer-preview theme-${getThemeClass(theme)}`} data-testid="commitment-preview">
              <p className="eyebrow">TODAY’S COMMITMENT</p>
              <span className="composer-mini-heart" aria-hidden="true">
                <BrandMark />
              </span>
              <div className="composer-preview-copy commitment-preview-copy">
                <p>I will</p>
                <h3>{promptText || "not have a cigarette today"}</h3>
                <div className="commitment-preview-actions">
                  <button type="button" className="premium-action-button premium-action-button-primary" disabled>
                    I will commit to this
                  </button>
                  <button type="button" className="premium-action-button premium-action-button-secondary" disabled>
                    Not this time
                  </button>
                </div>
              </div>
            </div>
            <div className="field" data-testid="commitment-self-check">
              <span>Does this sound right?</span>
              <div className="frequency-grid">
                <button
                  type="submit"
                  className="frequency-option selected"
                  data-testid="save-commitment-card-button"
                  disabled={!canSaveCommitment}
                >
                  Yes, save
                </button>
                <button
                  type="button"
                  className="frequency-option"
                  onClick={() => commitmentInputRef.current?.focus()}
                >
                  Edit commitment
                </button>
              </div>
            </div>
          </>
        ) : isBulkMode ? (
          <>
            <label className="field">
              <span>Paste one card per line</span>
              <textarea
                value={bulkText}
                onChange={(event) => {
                  setBulkText(event.target.value);
                  if (showValidation && event.target.value.trim()) {
                    setShowValidation(false);
                  }
                }}
                placeholder="Drink some water&#10;Go outside for a minute&#10;Stretch your neck"
                rows={8}
              />
              {bulkCardsCount > 0 ? (
                <span className="field-hint">{bulkCardsCount} {bulkCardsCount === 1 ? "card" : "cards"} ready</span>
              ) : showValidation ? (
                <span className="field-hint">Add at least one myBishBash before saving.</span>
              ) : null}
            </label>
            <button
              type="submit"
              className="save-button"
              disabled={bulkCardsCount === 0}
            >
              Create {bulkCardsCount || "0"} {bulkCardsCount === 1 ? "card" : "cards"}
            </button>
          </>
        ) : (
          <>
            <label className="field">
              <span>What does future-you need nudging towards?</span>
              <textarea
                data-testid="card-prompt-input"
                value={promptText}
                onChange={(event) => {
                  setPromptText(event.target.value);
                  if (showValidation && event.target.value.trim()) {
                    setShowValidation(false);
                  }
                }}
                placeholder="Have you stretched today? Drink some water. Go outside for a minute."
                rows={5}
              />
              {showValidation ? (
                <span className="field-hint">Add one gentle myBishBash before saving.</span>
              ) : null}
            </label>
            <div className="field">
              <span>Choose the mood</span>
              <div className="theme-grid">
                {THEMES.map((themeName) => (
                  <button
                    key={themeName}
                    type="button"
                    className={`theme-option ${themeName === theme ? "selected" : ""} theme-${getThemeClass(themeName)}`}
                    onClick={() => setTheme(themeName)}
                  >
                    {themeName}
                  </button>
                ))}
              </div>
            </div>
            <div className={`composer-preview theme-${getThemeClass(theme)}`}>
              <p className="eyebrow">{getGreeting(new Date())}</p>
              <span className="composer-mini-heart" aria-hidden="true">
                <BrandMark />
              </span>
              <div className="composer-preview-copy">
                <h3>{promptText.trim() || "Have you stretched today?"}</h3>
                <p>a gentle nudge from your future self</p>
              </div>
              <div className="composer-preview-scene" aria-hidden="true">
                <div className="composer-preview-tile">
                  <CardIcon icon={icon} />
                </div>
                <span className="composer-sparkle composer-sparkle-one" />
                <span className="composer-sparkle composer-sparkle-two" />
                <span className="composer-sun" />
                <span className="composer-horizon" />
              </div>
            </div>
            <div className="field">
              <span>Choose an icon</span>
              <div className="icon-grid">
                {ICON_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`icon-option ${icon === option.id ? "selected" : ""}`}
                    onClick={() => setIcon(option.id)}
                  >
                    <CardIcon icon={option.id} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>How often can this show up?</span>
              <div className="frequency-grid">
                {FREQUENCY_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`frequency-option ${frequency === option.id ? "selected" : ""}`}
                    onClick={() => setFrequency(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>When should this myBishBash appear?</span>
              <div className="timing-grid">
                {TIME_WINDOWS.map((windowOption) => (
                  <label key={windowOption.id} className="timing-option">
                    <input
                      type="checkbox"
                      checked={timingWindows.includes(windowOption.id)}
                      onChange={() => {
                        setTimingWindows((current) => {
                          if (current.includes(windowOption.id)) {
                            const next = current.filter((item) => item !== windowOption.id);
                            return next.length === 0 ? current : next;
                          }
                          return [...current, windowOption.id];
                        });
                      }}
                    />
                    <span>{windowOption.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {personalLimitReached ? (
              <p className="composer-hint" data-testid="personal-card-limit-notice" style={{ color: "#b91c1c" }}>
                You’ve reached your plan’s limit of {maxPersonalCards} personal cards. Upgrade to add more.
              </p>
            ) : null}
            <button
              type="submit"
              className="save-button"
              data-testid="save-card-button"
              disabled={personalLimitReached}
            >
              Save myBishBash
            </button>
          </>
        )}
      </form>
    </div>
  );
}

