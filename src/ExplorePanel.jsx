import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PACK_GOALS, MIN_PACKS_PER_GOAL_SECTION } from "./lib/packGoals";
import { getThemeClass } from "./utils";

// Explore — the read-only discovery surface (docs/explore-architecture.md).
// Structure: Start Here hero → goal sections (>=2 packs each) → More to
// explore (packs without a goal section). No management or editing lives
// here; install/remove are the only verbs, and per-card management stays
// behind the detail view's "Manage cards" for installed packs.

const PREMIUM_INTEREST_KEY = "mybishbash.premium-interest.v1";

function loadPremiumInterest() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PREMIUM_INTEREST_KEY) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function savePremiumInterest(packIds) {
  window.localStorage.setItem(PREMIUM_INTEREST_KEY, JSON.stringify(packIds));
}

function getPreviewEntries(pack, limit = 3) {
  const entries = pack.entries ?? [];
  const flagged = entries.filter((entry) => entry.isPreview);
  return (flagged.length > 0 ? flagged : entries).slice(0, limit);
}

function getCoverQuote(pack) {
  return getPreviewEntries(pack, 1)[0]?.promptText ?? "";
}

function byExploreOrder(left, right) {
  if ((right.sortOrder ?? 0) !== (left.sortOrder ?? 0)) {
    return (right.sortOrder ?? 0) - (left.sortOrder ?? 0);
  }
  const leftTime = new Date(left.publishedAt ?? 0).getTime() || 0;
  const rightTime = new Date(right.publishedAt ?? 0).getTime() || 0;
  if (rightTime !== leftTime) return rightTime - leftTime;
  return (left.title ?? "").localeCompare(right.title ?? "");
}

export function buildExploreSections(packs = [], { isTester = false } = {}) {
  const visible = packs
    .filter((pack) => !pack.comingSoon && (pack.entries?.length ?? 0) > 0)
    .filter((pack) => !pack.isExperimental || isTester)
    .sort(byExploreOrder);

  const hero = visible.find((pack) => pack.isFeatured) ?? null;

  const byGoal = new Map();
  visible.forEach((pack) => {
    const goal = pack.goal?.trim();
    if (!goal) return;
    if (!byGoal.has(goal)) byGoal.set(goal, []);
    byGoal.get(goal).push(pack);
  });

  const goalSections = PACK_GOALS
    .filter((goal) => (byGoal.get(goal)?.length ?? 0) >= MIN_PACKS_PER_GOAL_SECTION)
    .map((goal) => ({ goal, packs: byGoal.get(goal) }));

  const sectionedIds = new Set(goalSections.flatMap((section) => section.packs.map((pack) => pack.id)));
  const morePacks = visible.filter((pack) => !sectionedIds.has(pack.id));

  return { visible, hero, goalSections, morePacks };
}

function PremiumBadge() {
  return <span className="explore-premium-badge">Premium</span>;
}

function ExploreCoverArt({ pack, className }) {
  if (pack.coverImageUrl) {
    return <img src={pack.coverImageUrl} alt="" className={className} loading="lazy" />;
  }
  return <div className={`${className} explore-cover-fallback theme-${getThemeClass(pack.theme)}`} aria-hidden="true" />;
}

function ExploreHero({ pack, onOpen }) {
  const quote = getCoverQuote(pack);
  return (
    <section className="explore-section explore-hero-section">
      <p className="explore-section-title">Start Here</p>
      <button type="button" className="explore-hero" data-testid="explore-hero" onClick={() => onOpen(pack.id)}>
        <ExploreCoverArt pack={pack} className="explore-hero-art" />
        <span className="explore-hero-scrim" aria-hidden="true" />
        <span className="explore-hero-copy">
          {pack.isPremium ? <PremiumBadge /> : null}
          {quote ? <span className="explore-hero-quote">“{quote}”</span> : null}
          <span className="explore-hero-title">{pack.title}</span>
          {pack.description ? <span className="explore-hero-description">{pack.description}</span> : null}
        </span>
      </button>
    </section>
  );
}

function ExploreCoverCard({ pack, onOpen }) {
  const quote = getCoverQuote(pack);
  return (
    <button
      type="button"
      className="explore-cover-card"
      data-testid={`explore-pack-card-${pack.id}`}
      onClick={() => onOpen(pack.id)}
    >
      <span className="explore-cover-art-frame">
        <ExploreCoverArt pack={pack} className="explore-cover-art" />
        {pack.isPremium ? <PremiumBadge /> : null}
      </span>
      <span className="explore-cover-copy">
        {quote ? <span className="explore-cover-quote">“{quote}”</span> : null}
        <span className="explore-cover-title">{pack.title}</span>
        {pack.description ? <span className="explore-cover-description">{pack.description}</span> : null}
      </span>
    </button>
  );
}

function ExplorePackDetail({
  pack,
  isActive,
  locked,
  interestRecorded,
  onInstall,
  onRemove,
  onManageCards,
  onPremiumInterest,
  onClose,
}) {
  const previewEntries = getPreviewEntries(pack);
  const cardCount = pack.entries?.length ?? 0;

  return (
    <div className="explore-detail" data-testid="explore-pack-detail" role="dialog" aria-label={pack.title}>
      <div className="explore-detail-scroll">
        <div className="explore-detail-top">
          <button type="button" className="explore-detail-back" data-testid="explore-detail-close" onClick={onClose}>
            ← Explore
          </button>
        </div>
        <ExploreCoverArt pack={pack} className="explore-detail-art" />
        <div className="explore-detail-body">
          <div className="explore-detail-heading">
            <h2>{pack.title}</h2>
            {pack.isPremium ? <PremiumBadge /> : null}
          </div>
          <p className="explore-detail-meta">
            {cardCount} {cardCount === 1 ? "card" : "cards"} · by {pack.sourceLabel || "MyBishBash"}
          </p>
          {pack.description ? <p className="explore-detail-description">{pack.description}</p> : null}
          {pack.whyText ? (
            <div className="explore-detail-why">
              <p className="explore-detail-why-label">Why this exists</p>
              <p className="explore-detail-why-text">{pack.whyText}</p>
            </div>
          ) : null}
          {previewEntries.length > 0 ? (
            <div className="explore-detail-preview">
              <p className="explore-detail-preview-label">A taste:</p>
              {previewEntries.map((entry, index) => (
                <article key={entry.id ?? index} className={`explore-preview-card theme-${getThemeClass(pack.theme)}`}>
                  <p>{entry.promptText}</p>
                  {entry.attribution ? <span>{entry.attribution}</span> : null}
                </article>
              ))}
            </div>
          ) : null}
          {isActive ? (
            <button type="button" className="explore-manage-link" data-testid="explore-manage-cards" onClick={() => onManageCards(pack.id)}>
              Manage cards
            </button>
          ) : null}
        </div>
      </div>

      <footer className="explore-detail-footer">
        {isActive ? (
          <div className="explore-footer-active">
            <span className="explore-active-note" data-testid="explore-active-note">Active ✓</span>
            <button type="button" className="explore-remove-button" data-testid="explore-remove-button" onClick={() => onRemove(pack.id)}>
              Remove
            </button>
          </div>
        ) : locked ? (
          <button
            type="button"
            className="explore-premium-cta"
            data-testid="explore-premium-cta"
            disabled={interestRecorded}
            onClick={() => onPremiumInterest(pack)}
          >
            {interestRecorded ? "We’ll let you know ✓" : "Premium — Coming Soon"}
          </button>
        ) : (
          <button type="button" className="explore-install-button" data-testid="explore-install-button" onClick={() => onInstall(pack.id)}>
            Install
          </button>
        )}
      </footer>
    </div>
  );
}

export default function ExplorePanel({
  packs = [],
  isPackActive,
  onInstallPack,
  onRemovePack,
  onManageCards,
  isTester = false,
  canUsePremiumContent = false,
  onPremiumInterest,
}) {
  const [selectedPackId, setSelectedPackId] = useState(null);
  const [interestPackIds, setInterestPackIds] = useState(loadPremiumInterest);

  const { hero, goalSections, morePacks, visible } = useMemo(
    () => buildExploreSections(packs, { isTester }),
    [packs, isTester],
  );

  const selectedPack = selectedPackId ? visible.find((pack) => pack.id === selectedPackId) ?? null : null;

  useEffect(() => {
    if (selectedPackId && !selectedPack) setSelectedPackId(null);
  }, [selectedPackId, selectedPack]);

  function handlePremiumInterest(pack) {
    onPremiumInterest?.(pack);
    setInterestPackIds((current) => {
      if (current.includes(pack.id)) return current;
      const next = [...current, pack.id];
      savePremiumInterest(next);
      return next;
    });
  }

  return (
    <section className="panel-section explore-panel" data-testid="explore-panel">
      <div className="section-heading solo">
        <div>
          <h2>Explore</h2>
          <p>Find something that helps.</p>
        </div>
      </div>

      {hero ? <ExploreHero pack={hero} onOpen={setSelectedPackId} /> : null}

      {goalSections.map(({ goal, packs: goalPacks }) => (
        <section key={goal} className="explore-section" data-testid={`explore-goal-section-${goal.toLowerCase()}`}>
          <p className="explore-section-title">{goal}</p>
          <div className="explore-cover-grid">
            {goalPacks.map((pack) => (
              <ExploreCoverCard key={pack.id} pack={pack} onOpen={setSelectedPackId} />
            ))}
          </div>
        </section>
      ))}

      {morePacks.length > 0 ? (
        <section className="explore-section" data-testid="explore-more-section">
          <p className="explore-section-title">{goalSections.length > 0 ? "More to explore" : "Packs"}</p>
          <div className="explore-cover-grid">
            {morePacks.map((pack) => (
              <ExploreCoverCard key={pack.id} pack={pack} onOpen={setSelectedPackId} />
            ))}
          </div>
        </section>
      ) : null}

      {visible.length === 0 ? (
        <p className="explore-empty-note">New packs are on their way. Check back soon.</p>
      ) : null}

      {/* Portal: .app-inner creates a stacking context below the fixed
          bottom nav, so the full-screen detail must escape it. */}
      {selectedPack ? createPortal(
        <ExplorePackDetail
          pack={selectedPack}
          isActive={isPackActive(selectedPack.id)}
          locked={selectedPack.isPremium === true && !canUsePremiumContent}
          interestRecorded={interestPackIds.includes(selectedPack.id)}
          onInstall={(packId) => onInstallPack(packId)}
          onRemove={(packId) => onRemovePack(packId)}
          onManageCards={onManageCards}
          onPremiumInterest={handlePremiumInterest}
          onClose={() => setSelectedPackId(null)}
        />,
        document.body,
      ) : null}
    </section>
  );
}
