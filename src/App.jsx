import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadCards,
  loadMood,
  loadProfile,
  loadSetupComplete,
  saveCards,
  saveMood,
  saveProfile,
  saveSetupComplete,
} from "./storage";
import {
  PACKS,
  FREQUENCY_OPTIONS,
  ICON_OPTIONS,
  THEMES,
  TIME_WINDOWS,
  applyCardAction,
  buildCardsFromPack,
  createId,
  getGreeting,
  getStatusMeta,
  getThemeClass,
  isEligible,
  normalizeCards,
} from "./utils";

function pickRandomHomeCardForDisplay(currentCards, timezone) {
  const normalized = normalizeCards(currentCards, new Date(), timezone);
  const singles = normalized
    .filter((card) => !card.sourcePackId && isEligible(card, new Date(), timezone))
    .map((card) => ({ type: "single", card }));

  const packMap = new Map();
  normalized.forEach((card) => {
    if (!card.sourcePackId || !isEligible(card, new Date(), timezone)) return;
    if (!packMap.has(card.sourcePackId)) {
      packMap.set(card.sourcePackId, []);
    }
    packMap.get(card.sourcePackId).push(card);
  });

  const packs = Array.from(packMap.values()).map((packCards) => ({
    type: "pack",
    packCards,
  }));

  const pool = [...singles, ...packs];
  if (pool.length === 0) {
    return { normalized, selected: null };
  }

  const chosen = pool[Math.floor(Math.random() * pool.length)];
  if (chosen.type === "single") {
    return { normalized, selected: chosen.card };
  }

  const selected = chosen.packCards[Math.floor(Math.random() * chosen.packCards.length)];
  return { normalized, selected };
}

function buildInitialState() {
  const profile = loadProfile();
  const setupComplete = loadSetupComplete();
  const mood = loadMood();
  const cards = normalizeCards(loadCards(), new Date(), profile.timezone);

  if (!setupComplete) {
    return {
      cards,
      mood,
      profile,
      setupComplete,
      screen: "onboarding",
      overlay: null,
    };
  }

  const { normalized, selected } = pickRandomHomeCardForDisplay(cards, profile.timezone);

  if (!selected) {
    return {
      cards: normalized,
      mood,
      profile,
      setupComplete,
      screen: "interruption",
      overlay: { type: "empty" },
    };
  }

  const nextCards = normalized.map((card) =>
    card.id === selected.id
      ? { ...card, lastShownAt: new Date().toISOString() }
      : card,
  );

  return {
    cards: nextCards,
    mood,
    profile,
    setupComplete,
    screen: "interruption",
    overlay: {
      type: "reveal",
      cardId: selected.id,
      phase: "visible",
    },
  };
}

function getHomeCardTitle(card) {
  return card.dashboardTitle ?? card.promptText?.trim() ?? "";
}

function App() {
  const initialState = useMemo(() => buildInitialState(), []);
  const [cards, setCards] = useState(initialState.cards);
  const [mood, setMood] = useState(initialState.mood);
  const [profile, setProfile] = useState(initialState.profile);
  const [setupComplete, setSetupComplete] = useState(initialState.setupComplete);
  const [screen, setScreen] = useState(initialState.screen);
  const [activeTab, setActiveTab] = useState("home");
  const [overlay, setOverlay] = useState(initialState.overlay);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingPackId, setEditingPackId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const transitionTimerRef = useRef(null);
  const hasMountedRef = useRef(false);
  const skipNextAutoOpenRef = useRef(false);
  const hiddenAtRef = useRef(null);
  const setupCompleteRef = useRef(setupComplete);
  const overlayRef = useRef(overlay);
  const composerOpenRef = useRef(isComposerOpen);

  useEffect(() => {
    setupCompleteRef.current = setupComplete;
  }, [setupComplete]);

  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  useEffect(() => {
    composerOpenRef.current = isComposerOpen;
  }, [isComposerOpen]);

  useEffect(() => {
    saveCards(cards);
  }, [cards]);

  useEffect(() => {
    saveSetupComplete(setupComplete);
  }, [setupComplete]);

  useEffect(() => {
    saveMood(mood);
  }, [mood]);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    const normalized = normalizeCards(cards, new Date(), profile.timezone);
    if (JSON.stringify(normalized) !== JSON.stringify(cards)) {
      setCards(normalized);
    }
  }, []);

  useEffect(() => {
    let timer = null;

    if (setupComplete && hasMountedRef.current) {
      if (skipNextAutoOpenRef.current) {
        skipNextAutoOpenRef.current = false;
      } else {
        timer = window.setTimeout(() => {
          openRandomReveal();
        }, 150);
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }

      if (document.visibilityState === "visible") {
        setCards((current) => normalizeCards(current, new Date(), profile.timezone));
        const hiddenFor = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
        hiddenAtRef.current = null;
        if (
          hasMountedRef.current &&
          setupCompleteRef.current &&
          !overlayRef.current &&
          !composerOpenRef.current &&
          hiddenFor > 4000
        ) {
          window.setTimeout(() => {
            openRandomReveal();
          }, 120);
        }
      }
    };

    hasMountedRef.current = true;
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, [setupComplete, profile.timezone]);

  useEffect(() => {
    if (screen === "library") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [screen, activeTab]);

  function updateCards(updater) {
    setCards((current) =>
      normalizeCards(typeof updater === "function" ? updater(current) : updater, new Date(), profile.timezone),
    );
  }

  function openRandomReveal() {
    let nextOverlay = { type: "empty" };

    updateCards((current) => {
      const { normalized, selected } = pickRandomHomeCardForDisplay(current, profile.timezone);

      if (!selected) {
        return normalized;
      }

      nextOverlay = {
        type: "reveal",
        cardId: selected.id,
        phase: "visible",
      };

      return normalized.map((card) =>
        card.id === selected.id
          ? { ...card, lastShownAt: new Date().toISOString() }
          : card,
      );
    });

    setScreen("interruption");
    setOverlay(nextOverlay);
  }

  function openSpecificReveal(cardId) {
    const selected = cards.find((card) => card.id === cardId);
    if (!selected) return;

    updateCards((current) =>
      current.map((card) =>
        card.id === cardId
          ? { ...card, lastShownAt: new Date().toISOString() }
          : card,
      ),
    );

    setScreen("interruption");
    setOverlay({
      type: "reveal",
      cardId,
      phase: "visible",
    });
  }

  function openPackReveal(packId) {
    const packCards = cards.filter((card) => card.sourcePackId === packId);
    if (packCards.length === 0) return;

    const eligiblePackCards = packCards.filter((card) => isEligible(card, new Date(), profile.timezone));
    const source = eligiblePackCards.length > 0 ? eligiblePackCards : packCards;
    const selected = source[Math.floor(Math.random() * source.length)];
    openSpecificReveal(selected.id);
  }

  function handleAction(action) {
    if (!overlay || overlay.type !== "reveal") return;

    const activeCard = cards.find((card) => card.id === overlay.cardId);
    if (!activeCard) {
      setOverlay(null);
      return;
    }

    const updatedCard = applyCardAction(activeCard, action, new Date(), profile.timezone);
    updateCards((current) =>
      current.map((card) => (card.id === updatedCard.id ? updatedCard : card)),
    );

    setOverlay((currentOverlay) =>
      currentOverlay ? { ...currentOverlay, phase: "dissolving", action } : currentOverlay,
    );

    transitionTimerRef.current = window.setTimeout(() => {
      setOverlay(null);
      setScreen("library");
    }, 720);
  }

  function handlePackReaction(reaction) {
    if (!overlay?.cardId) return;

    const activeCard = cards.find((card) => card.id === overlay.cardId);
    if (!activeCard) return;

    if (reaction === "dislike") {
      updateCards((current) =>
        current.map((card) =>
          card.id === activeCard.id ? { ...card, paused: true } : card,
        ),
      );
    } else {
      const updatedCard = applyCardAction(activeCard, "done", new Date(), profile.timezone);
      updateCards((current) =>
        current.map((card) => (card.id === updatedCard.id ? updatedCard : card)),
      );
    }

    setOverlay((currentOverlay) =>
      currentOverlay ? { ...currentOverlay, phase: "dissolving", action: reaction } : currentOverlay,
    );

    transitionTimerRef.current = window.setTimeout(() => {
      setOverlay(null);
      setScreen("library");
    }, 720);
  }

  function handleSaveCard(formData) {
    const trimmedText = formData.promptText.trim();
    if (!trimmedText) return;

    const isFirstCard = !setupComplete && !editingId;

    if (editingId) {
      updateCards((current) =>
        current.map((card) =>
          card.id === editingId
            ? {
                ...card,
                promptText: trimmedText,
                theme: formData.theme,
                icon: formData.icon,
                frequency: formData.frequency,
                timingWindows: formData.timingWindows,
              }
            : card,
        ),
      );
    } else {
      updateCards((current) => [
        {
          id: createId(),
          promptText: trimmedText,
          theme: formData.theme,
          icon: formData.icon,
          statusToday: "fresh",
          createdAt: new Date().toISOString(),
          lastShownAt: null,
          notYetUntil: null,
          doneDate: null,
          frequency: formData.frequency,
          timingWindows: formData.timingWindows,
          paused: false,
        },
        ...current,
      ]);
    }

    setEditingId(null);
    setIsComposerOpen(false);

    if (isFirstCard) {
      skipNextAutoOpenRef.current = true;
      setSetupComplete(true);
      setActiveTab("home");
      setScreen("library");
      return;
    }

    setActiveTab("home");
    setScreen("library");
  }

  function handleDeleteCard(cardId) {
    updateCards((current) => current.filter((card) => card.id !== cardId));
    setMenuOpenId(null);
  }

  function handleResetItem(item) {
    updateCards((current) =>
      current.map((card) => {
        const matches =
          item.type === "pack"
            ? card.sourcePackId === item.id
            : card.id === item.id;

        if (!matches) return card;

        return {
          ...card,
          statusToday: "fresh",
          doneDate: null,
          notYetUntil: null,
          lastShownAt: null,
          paused: false,
        };
      }),
    );
    setMenuOpenId(null);
  }

  function handleTogglePause(item) {
    updateCards((current) =>
      current.map((card) => {
        const matches =
          item.type === "pack"
            ? card.sourcePackId === item.id
            : card.id === item.id;

        if (!matches) return card;

        return {
          ...card,
          paused: !card.paused,
        };
      }),
    );
    setMenuOpenId(null);
  }

  function openEditor(cardId) {
    setEditingId(cardId);
    setIsComposerOpen(true);
    setMenuOpenId(null);
  }

  function openPackEditor(packId) {
    setEditingPackId(packId);
    setMenuOpenId(null);
  }

  function handleSavePackSettings(packId, formData) {
    updateCards((current) =>
      current.map((card) =>
        card.sourcePackId === packId
          ? {
              ...card,
              frequency: formData.frequency,
              timingWindows: formData.timingWindows,
            }
          : card,
      ),
    );
    setEditingPackId(null);
  }

  function isPackActive(packId) {
    return cards.some((card) => card.sourcePackId === packId);
  }

  function activatePack(packId) {
    const pack = PACKS.find((item) => item.id === packId);
    if (!pack || isPackActive(packId)) return;

    updateCards((current) => [...buildCardsFromPack(pack), ...current]);
    setActiveTab("home");
    setScreen("library");
  }

  function deactivatePack(packId) {
    updateCards((current) => current.filter((card) => card.sourcePackId !== packId));
  }

  const editingCard = useMemo(
    () => cards.find((card) => card.id === editingId) ?? null,
    [cards, editingId],
  );

  const editingPackCard = useMemo(
    () => cards.find((card) => card.sourcePackId === editingPackId) ?? null,
    [cards, editingPackId],
  );

  const activeRevealCard = overlay?.cardId
    ? cards.find((card) => card.id === overlay.cardId)
    : null;

  const homeItems = useMemo(() => {
    const grouped = new Map();

    cards.forEach((card) => {
      if (card.sourcePackId) {
        if (!grouped.has(card.sourcePackId)) {
          grouped.set(card.sourcePackId, {
            type: "pack",
            id: card.sourcePackId,
            representative: card,
          });
        }
        return;
      }

      grouped.set(card.id, {
        type: "single",
        id: card.id,
        representative: card,
      });
    });

    return Array.from(grouped.values());
  }, [cards]);
  const eligibleHomeCount = useMemo(() => {
    let count = 0;
    const seenPackIds = new Set();

    cards.forEach((card) => {
      if (card.sourcePackId) {
        if (seenPackIds.has(card.sourcePackId)) return;
        const packHasEligible = cards.some(
          (candidate) =>
            candidate.sourcePackId === card.sourcePackId &&
            isEligible(candidate, new Date(), profile.timezone),
        );
        if (packHasEligible) {
          seenPackIds.add(card.sourcePackId);
          count += 1;
        }
        return;
      }

      if (isEligible(card, new Date(), profile.timezone)) {
        count += 1;
      }
    });

    return count;
  }, [cards, profile.timezone]);

  return (
    <>
      <div className="grain" />

      {screen === "library" ? (
        <div className={`app-shell app-mood theme-${getThemeClass(mood)}`}>
          <div className="app-inner">
            <header className="hero">
              <div className="hero-copy">
                <div className="hero-mark" aria-hidden="true">
                  <HeartGlyph />
                </div>
                <p className="wordmark">BishBash</p>
                <h1>private little messages from your earlier self</h1>
                <span className="hero-dot" aria-hidden="true" />
              </div>
              <button
                type="button"
                className="add-button"
                onClick={() => {
                  setEditingId(null);
                  setIsComposerOpen(true);
                }}
                aria-label="Create a BishBash"
              >
                +
              </button>
            </header>

            <main className="content">
              {activeTab === "home" ? (
                <section className="library">
                <div className="section-heading">
                  <div>
                    <h2>Your BishBash list</h2>
                    <p>little notes waiting for future you</p>
                  </div>
                </div>

                <div className="card-stack">
                  {homeItems.map((item) => {
                    const status = getStatusMeta(item.representative, new Date(), profile.timezone);
                    return (
                      <article
                        key={item.id}
                        className={`library-card ${menuOpenId === item.id ? "menu-open" : ""} theme-${getThemeClass(item.representative.theme)}`}
                        onClick={() =>
                          item.type === "pack"
                            ? openPackReveal(item.id)
                            : openSpecificReveal(item.id)
                        }
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            if (item.type === "pack") {
                              openPackReveal(item.id);
                            } else {
                              openSpecificReveal(item.id);
                            }
                          }
                        }}
                      >
                        <div className="tile">
                          <CardIcon
                            theme={item.representative.theme}
                            icon={item.representative.icon}
                            sourcePackId={item.representative.sourcePackId}
                          />
                        </div>
                        <div className="card-copy">
                          <h3>{getHomeCardTitle(item.representative)}</h3>
                        </div>
                        <div className="card-status">
                          <span className="badge">{status.badge}</span>
                        </div>
                        <div className="menu-wrap">
                          <button
                            type="button"
                            className="menu-trigger"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuOpenId((current) => (current === item.id ? null : item.id))
                            }}
                            aria-label="Card menu"
                          >
                            •••
                          </button>
                          {menuOpenId === item.id ? (
                            <div className="menu">
                              <button type="button" onClick={(event) => {
                                event.stopPropagation();
                                if (item.type === "pack") {
                                  openPackEditor(item.id);
                                  return;
                                }
                                openEditor(item.id);
                              }}>
                                {item.type === "pack" ? "Edit pack" : "Edit"}
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleResetItem(item);
                                }}
                              >
                                Reset for today
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleTogglePause(item);
                                }}
                              >
                                {item.representative.paused ? "Unpause" : "Pause"}
                              </button>
                              <button
                                type="button"
                                className="danger-soft"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (item.type === "pack") {
                                    deactivatePack(item.id);
                                    return;
                                  }
                                  handleDeleteCard(item.id);
                                }}
                              >
                                {item.type === "pack" ? "Remove pack" : "Delete"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
                </section>
              ) : null}

              {activeTab === "library" ? (
                <LibraryPanel
                  cards={cards}
                  onActivate={activatePack}
                  onDeactivate={deactivatePack}
                />
              ) : null}

              {activeTab === "theme" ? <MoodPanel mood={mood} onSelectMood={setMood} /> : null}
              {activeTab === "settings" ? <SettingsPanel profile={profile} onSaveProfile={setProfile} /> : null}
            </main>
          </div>

          <nav className="bottom-nav" aria-label="Primary">
            <button type="button" className={`nav-item ${activeTab === "home" ? "active" : ""}`} onClick={() => setActiveTab("home")}>
              <HomeGlyph />
              <span>Home</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "library" ? "active" : ""}`} onClick={() => setActiveTab("library")}>
              <BookGlyph />
              <span>Library</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "theme" ? "active" : ""}`} onClick={() => setActiveTab("theme")}>
              <ThemeGlyph />
              <span>Mood</span>
            </button>
            <button type="button" className={`nav-item ${activeTab === "settings" ? "active" : ""}`} onClick={() => setActiveTab("settings")}>
              <SettingsGlyph />
              <span>Settings</span>
            </button>
          </nav>
        </div>
      ) : null}

      {screen === "onboarding" ? (
        <Onboarding
          onCreate={() => {
            setEditingId(null);
            setIsComposerOpen(true);
          }}
        />
      ) : null}

      {isComposerOpen ? (
        <Composer
          key={editingId ?? "new"}
          initialCard={editingCard}
          onClose={() => {
            setEditingId(null);
            setIsComposerOpen(false);
          }}
          onSave={handleSaveCard}
        />
      ) : null}

      {editingPackId && editingPackCard ? (
        <PackEditor
          key={editingPackId}
          packTitle={editingPackCard.dashboardTitle ?? "Pack"}
          initialCard={editingPackCard}
          onClose={() => setEditingPackId(null)}
          onSave={(formData) => handleSavePackSettings(editingPackId, formData)}
        />
      ) : null}

      {overlay ? (
        <Overlay
          overlay={overlay}
          card={activeRevealCard}
          timezone={profile.timezone}
          onClose={() => {
            setOverlay(null);
            setScreen("library");
          }}
          onAction={handleAction}
          onPackReaction={handlePackReaction}
        />
      ) : null}

      <ContinueToSafariButton />
    </>
  );
}

function Composer({ initialCard, onClose, onSave }) {
  const [promptText, setPromptText] = useState(initialCard?.promptText ?? "");
  const [theme, setTheme] = useState(initialCard?.theme ?? THEMES[0]);
  const [icon, setIcon] = useState(initialCard?.icon ?? "heart");
  const [frequency, setFrequency] = useState(initialCard?.frequency ?? "once_daily");
  const [timingWindows, setTimingWindows] = useState(initialCard?.timingWindows ?? ["morning", "day", "evening"]);
  const [showValidation, setShowValidation] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = promptText.trim();
    if (!trimmed) {
      setShowValidation(true);
      return;
    }

    onSave({ promptText: trimmed, theme, icon, frequency, timingWindows });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="composer" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="composer-heading">
          <p className="eyebrow">{initialCard ? "Edit your BishBash" : "Make a BishBash"}</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <label className="field">
          <span>What positive action do you want future-you nudged toward?</span>
          <textarea
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
            <span className="field-hint">Add one gentle BishBash before saving.</span>
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
          <p className="eyebrow">Preview</p>
          <div className="composer-preview-tile">
            <CardIcon icon={icon} />
          </div>
          <h3>{promptText.trim() || "Have you stretched today?"}</h3>
          <p>{theme}</p>
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
          <span>When should this BishBash appear?</span>
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
        <button
          type="submit"
          className="save-button"
        >
          Save BishBash
        </button>
      </form>
    </div>
  );
}

function MoodPanel({ mood, onSelectMood }) {
  return (
    <section className="panel-section">
      <div className="section-heading solo">
        <div>
          <h2>Mood</h2>
          <p>Choose the feeling of BishBash as a whole.</p>
        </div>
      </div>
      <div className="theme-showcase">
        {THEMES.map((theme) => (
          <article
            key={theme}
            className={`theme-showcase-card theme-${getThemeClass(theme)} ${mood === theme ? "selected-mood" : ""}`}
          >
            <p className="eyebrow">{theme}</p>
            <h3>have you stretched today?</h3>
            <button
              type="button"
              className={`pack-button ${mood === theme ? "secondary" : ""}`}
              onClick={() => onSelectMood(theme)}
            >
              {mood === theme ? "Selected" : "Use this mood"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function PackEditor({ packTitle, initialCard, onClose, onSave }) {
  const [frequency, setFrequency] = useState(initialCard?.frequency ?? "once_daily");
  const [timingWindows, setTimingWindows] = useState(initialCard?.timingWindows ?? ["morning", "day", "evening"]);

  function handleSubmit(event) {
    event.preventDefault();
    onSave({ frequency, timingWindows });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="composer pack-editor" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="composer-heading">
          <p className="eyebrow">Edit pack</p>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="field">
          <span>{packTitle}</span>
          <p className="pack-editor-copy">Choose when this pack can appear and how often it can come back.</p>
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
          <span>When should this pack appear?</span>
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
        <button type="submit" className="save-button">
          Save pack
        </button>
      </form>
    </div>
  );
}

function LibraryPanel({ cards, onActivate, onDeactivate }) {
  return (
    <section className="panel-section">
      <div className="section-heading solo">
        <div>
          <h2>Library</h2>
          <p>Activate ready-made BishBash packs that can appear at random through the day.</p>
        </div>
      </div>
      <div className="theme-showcase">
        {PACKS.map((pack) => {
          const activeCount = cards.filter((card) => card.sourcePackId === pack.id).length;
          const active = activeCount > 0;

          return (
            <article key={pack.id} className={`theme-showcase-card theme-${getThemeClass(pack.theme)}`}>
              <p className="eyebrow">{active ? "Active pack" : "Pack"}</p>
              <h3>{pack.title}</h3>
              <p>{pack.description}</p>
              {pack.entries[0] ? (
                <>
                  <p className="pack-sample">{pack.entries[0].promptText}</p>
                  <p className="pack-meta">{pack.entries[0].attribution}</p>
                </>
              ) : (
                <p className="pack-meta">Source-first pack planned. Needs verified archival content.</p>
              )}
              <button
                type="button"
                className={`pack-button ${active ? "secondary" : ""}`}
                disabled={pack.comingSoon}
                onClick={() => (active ? onDeactivate(pack.id) : onActivate(pack.id))}
              >
                {pack.comingSoon ? "Coming soon" : active ? "Deactivate pack" : "Activate pack"}
              </button>
              {active ? <p className="pack-state">Active in your BishBashes</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SettingsPanel({ profile, onSaveProfile }) {
  const [name, setName] = useState(profile.name ?? "");
  const [timezone, setTimezone] = useState(profile.timezone ?? "Europe/London");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setName(profile.name ?? "");
    setTimezone(profile.timezone ?? "Europe/London");
  }, [profile]);

  return (
    <section className="panel-section">
      <div className="section-heading solo">
        <div>
          <h2>Settings</h2>
          <p>Personal touches and a quick peek at how BishBash works.</p>
        </div>
      </div>
      <div className="settings-card settings-compact">
        <button
          type="button"
          className="settings-toggle"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
        >
          <span>How it works</span>
          <span>{isOpen ? "−" : "+"}</span>
        </button>
        {isOpen ? (
          <div className="settings-dropdown">
            <p>Each time the app opens, it picks one random eligible BishBash from everything you&apos;ve created or activated.</p>
            <ul className="settings-list">
              <li>it is not paused</li>
              <li>it has not already been marked done</li>
              <li>it is not cooling down from Not yet or I&apos;ll do it now</li>
              <li>the current time matches its selected windows</li>
            </ul>
          </div>
        ) : null}
      </div>
      <div className="settings-card">
        <p>Personalisation</p>
        <div className="settings-form">
          <label className="field">
            <span>Name</span>
            <input
              className="settings-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
            />
          </label>
          <label className="field">
            <span>Timezone</span>
            <select
              className="settings-input"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              <option value="Europe/London">UK (Europe/London)</option>
              <option value="Europe/Dublin">Ireland (Europe/Dublin)</option>
              <option value="America/New_York">US East (America/New_York)</option>
              <option value="America/Los_Angeles">US West (America/Los_Angeles)</option>
            </select>
          </label>
          <button
            type="button"
            className="pack-button"
            onClick={() => onSaveProfile({ name, timezone })}
          >
            Save personalisation
          </button>
        </div>
      </div>
    </section>
  );
}

function Overlay({ overlay, card, timezone, onClose, onAction, onPackReaction }) {
  if (overlay.type === "empty") {
    return (
      <div className="overlay-screen empty-state" onClick={onClose}>
        <div className="floating floating-heart" />
        <button
          type="button"
          className="overlay-library-button"
          onClick={onClose}
          aria-label="Open library"
        >
          <BookGlyph />
        </button>
        <p className="eyebrow">BishBash</p>
        <h2>You&apos;re all caught up for now.</h2>
        <p>see you later</p>
      </div>
    );
  }

  if (!card) return null;

  return (
    <div
      className={`overlay-screen reveal ${overlay.phase === "dissolving" ? "is-dissolving" : ""} theme-${getThemeClass(card.theme)}`}
    >
      <div className="floating floating-heart" />
      <div className="particle particle-a" />
      <button
        type="button"
        className="overlay-library-button"
        onClick={onClose}
        aria-label="Open library"
      >
        <BookGlyph />
      </button>
      <div className="reveal-copy">
        <p className="eyebrow">{getGreeting(new Date(), timezone)}</p>
        <span className="mini-glyph" aria-hidden="true">
          <HeartGlyph />
        </span>
        <h2>{card.promptText}</h2>
        {card.attribution ? <p className="card-attribution">{card.attribution}</p> : null}
        <p className="tiny-note">a gentle nudge from the version of you that cares</p>
      </div>
      {card.sourcePackId ? (
        <div className="action-row pack-reaction-row">
          <ActionButton label="Dislike" onClick={() => onPackReaction("dislike")} />
          <ActionButton label="Like" tone="solid" onClick={() => onPackReaction("like")} />
        </div>
      ) : (
        <div className="action-row">
          <ActionButton label="Not yet" onClick={() => onAction("later")} />
          <ActionButton label="I'll do it now" onClick={() => onAction("now")} />
          <ActionButton label="Done" tone="solid" onClick={() => onAction("done")} />
        </div>
      )}
    </div>
  );
}

function Onboarding({ onCreate }) {
  return (
    <div className="overlay-screen onboarding-screen">
      <div className="onboarding-shell">
        <div className="onboarding-topbar" aria-hidden="true">
          <span className="mock-time">9:41</span>
          <div className="mock-status">
            <span className="status-signal" />
            <span className="status-wifi" />
            <span className="status-battery" />
          </div>
        </div>

        <header className="onboarding-brand">
          <span className="onboarding-heart" aria-hidden="true">
            <HeartGlyph />
          </span>
          <button type="button" className="onboarding-plus" aria-label="Create BishBash">
            +
          </button>
          <h1>BishBash</h1>
          <p>private little messages from your earlier self</p>
        </header>

        <article className="onboarding-feature-card">
          <p className="eyebrow">Good morning</p>
          <span className="feature-mini-heart" aria-hidden="true">
            <HeartGlyph />
          </span>
          <h2>
            You&apos;ve got this.
            <br />
            One small step
            <br />
            at a time.
          </h2>
          <p className="feature-support">a gentle nudge from your future self</p>
          <div className="feature-scene" aria-hidden="true">
            <span className="feature-star feature-star-one" />
            <span className="feature-star feature-star-two" />
            <span className="feature-star feature-star-three" />
            <span className="feature-sun" />
            <span className="feature-horizon" />
            <span className="feature-reflection" />
            <span className="feature-stone" />
          </div>
        </article>

        <div className="onboarding-pagination" aria-hidden="true">
          <span className="pagination-dot active" />
          <span className="pagination-dot" />
          <span className="pagination-dot" />
          <span className="pagination-dot" />
        </div>

        <div className="onboarding-actions">
          <button type="button" className="save-button" onClick={onCreate}>
            Make your first BishBash
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, tone = "ghost" }) {
  return (
    <button
      type="button"
      className={`action-button ${tone}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ContinueToSafariButton() {
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true);

  const safariHref = isStandalone
    ? "x-safari-https://www.google.com"
    : "https://www.google.com";

  return (
    <a
      className="continue-safari-button"
      href={safariHref}
      target={isStandalone ? undefined : "_blank"}
      rel={isStandalone ? undefined : "noopener noreferrer"}
      aria-label="Continue to Safari"
    >
      <SafariGlyph />
      <span>Safari</span>
    </a>
  );
}

function CardIcon({ icon = "heart", sourcePackId }) {
  if (sourcePackId === "encouraging-bible-verses" || icon === "book") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M12 16h18c6 0 10 4 10 10v24H22c-6 0-10-4-10-10V16z" />
        <path d="M52 16H34c-6 0-10 4-10 10v24h18c6 0 10-4 10-10V16z" />
        <path d="M24 20h12" />
        <path d="M28 28h8" />
      </svg>
    );
  }

  if (sourcePackId === "motivational-quotes" || icon === "quote") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M20 24c0 8-4 14-12 18 1-6 3-10 7-13-5-1-8-4-8-9 0-5 4-9 9-9 5 0 9 4 9 13z" />
        <path d="M48 24c0 8-4 14-12 18 1-6 3-10 7-13-5-1-8-4-8-9 0-5 4-9 9-9 5 0 9 4 9 13z" />
      </svg>
    );
  }

  if (icon === "water") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M22 18h20l-3 32H25l-3-32z" />
        <path d="M24 30c2-2 5-3 8-3s6 1 8 3" />
        <path d="M28 13c0-3 2-5 4-5s4 2 4 5" />
      </svg>
    );
  }

  if (icon === "moon") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M37 10c-9 3-15 12-15 22 0 14 11 24 25 24 4 0 7-1 10-2-4 4-10 6-16 6-14 0-26-11-26-26 0-11 7-21 17-24 2-1 4-1 5 0z" />
        <path d="M46 17l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
        <path d="M52 27l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
      </svg>
    );
  }

  if (icon === "leaf") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration earthy" aria-hidden="true">
        <path d="M32 50V23" />
        <path d="M32 31c-7 0-12-4-12-11 7 0 12 4 12 11z" />
        <path d="M32 36c7 0 12-4 12-11-7 0-12 4-12 11z" />
        <path d="M32 44c-5 0-9 4-9 9 5 0 9-4 9-9z" />
      </svg>
    );
  }

  if (icon === "flower") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration bloom" aria-hidden="true">
        <circle cx="32" cy="28" r="4" />
        <path d="M32 51V32" />
        <path d="M32 24c0-7 5-12 12-12 0 7-5 12-12 12z" />
        <path d="M32 24c0-7-5-12-12-12 0 7 5 12 12 12z" />
        <path d="M28 28c-7 0-12-5-12-12 7 0 12 5 12 12z" />
        <path d="M36 28c7 0 12-5 12-12-7 0-12 5-12 12z" />
        <path d="M32 42c-5 0-9 4-9 9 5 0 9-4 9-9z" />
        <path d="M32 42c5 0 9 4 9 9-5 0-9-4-9-9z" />
      </svg>
    );
  }

  if (icon === "star") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M32 10l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" />
      </svg>
    );
  }

  if (icon === "heart") {
    return (
      <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
        <path d="M20 18c0-4 3-7 7-7 2 0 4 1 5 3 1-2 3-3 5-3 4 0 7 3 7 7 0 10-12 16-12 16s-12-6-12-16z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className="icon-illustration" aria-hidden="true">
      <path d="M20 18c0-4 3-7 7-7 2 0 4 1 5 3 1-2 3-3 5-3 4 0 7 3 7 7 0 10-12 16-12 16s-12-6-12-16z" />
    </svg>
  );
}

function HeartGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="heart-glyph" aria-hidden="true">
      <path d="M16 27s-9-6-12-11c-3-5 0-11 6-11 3 0 5 1 6 4 1-3 3-4 6-4 6 0 9 6 6 11-3 5-12 11-12 11z" />
    </svg>
  );
}

function EnvelopeGlyph() {
  return (
    <svg viewBox="0 0 120 120" className="envelope-glyph" aria-hidden="true">
      <path d="M20 36h80v52c0 6-4 10-10 10H30c-6 0-10-4-10-10V36z" />
      <path d="M20 40l40 30 40-30" />
      <path d="M28 94l21-23" />
      <path d="M92 94L71 71" />
      <path d="M60 29c0-4 3-7 7-7 2 0 4 1 5 3 1-2 3-3 5-3 4 0 7 3 7 7 0 10-12 16-12 16S60 39 60 29z" />
      <path d="M16 28l4 1 1 4 1-4 4-1-4-1-1-4-1 4z" />
      <path d="M98 24l3 1 1 3 1-3 3-1-3-1-1-3-1 3z" />
    </svg>
  );
}

function HomeGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="nav-glyph" aria-hidden="true">
      <path d="M6 15l10-8 10 8" />
      <path d="M9 14v11h14V14" />
    </svg>
  );
}

function BookGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="nav-glyph" aria-hidden="true">
      <path d="M8 7h8c3 0 5 2 5 5v13H13c-3 0-5-2-5-5V7z" />
      <path d="M24 7h-8c-3 0-5 2-5 5v13h8c3 0 5-2 5-5V7z" />
    </svg>
  );
}

function ThemeGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="nav-glyph" aria-hidden="true">
      <path d="M16 25c5 0 9-4 9-9 0-6-5-11-11-11S3 10 3 16s5 9 9 9c2 0 3-1 3-3 0-1-1-2-1-3 0-2 1-3 2-3z" />
      <path d="M11 11h.01" />
      <path d="M18 10h.01" />
      <path d="M20 16h.01" />
    </svg>
  );
}

function SettingsGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="nav-glyph" aria-hidden="true">
      <path d="M16 10a6 6 0 100 12 6 6 0 000-12z" />
      <path d="M16 4v3" />
      <path d="M16 25v3" />
      <path d="M4 16h3" />
      <path d="M25 16h3" />
      <path d="M7.5 7.5l2.2 2.2" />
      <path d="M22.3 22.3l2.2 2.2" />
      <path d="M24.5 7.5l-2.2 2.2" />
      <path d="M9.7 22.3l-2.2 2.2" />
    </svg>
  );
}

function SafariGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="safari-glyph" aria-hidden="true">
      <circle cx="16" cy="16" r="10.5" />
      <path d="M16 10l3 7-7 3 4-10z" />
      <path d="M16 16l-3 7 7-3-4-4z" />
    </svg>
  );
}

export default App;
