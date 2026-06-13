import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PACK_GOALS, MIN_PACKS_PER_GOAL_SECTION } from "./lib/packGoals";
import { getThemeClass } from "./utils";
import GeneratedPackCover from "./GeneratedPackCover";

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

function isCommitmentTemplatePack(pack) {
  return pack?.contentType === "commitments";
}

function buildCommitmentTemplates(packs = []) {
  return packs
    .filter(isCommitmentTemplatePack)
    .flatMap((pack) =>
      (pack.entries ?? []).map((entry, index) => ({
        id: entry.id ?? `${pack.id}:${index}`,
        packId: pack.id,
        packTitle: pack.title,
        promptText: entry.promptText,
        attribution: entry.attribution,
        theme: pack.theme,
        icon: pack.icon ?? "star",
        defaults: entry.commitmentDefaults ?? {},
      })),
    )
    .filter((template) => template.promptText?.trim());
}

export function buildExploreSections(packs = [], { isTester = false } = {}) {
  const visible = packs
    .filter((pack) => !pack.comingSoon && (pack.entries?.length ?? 0) > 0)
    .filter((pack) => !pack.isExperimental || isTester)
    .sort(byExploreOrder);
  const commitmentTemplates = buildCommitmentTemplates(visible);
  const installablePacks = visible.filter((pack) => !isCommitmentTemplatePack(pack));

  const hero = installablePacks.find((pack) => pack.isFeatured) ?? null;

  const byGoal = new Map();
  installablePacks.forEach((pack) => {
    const goal = pack.goal?.trim();
    if (!goal) return;
    if (!byGoal.has(goal)) byGoal.set(goal, []);
    byGoal.get(goal).push(pack);
  });

  const goalSections = PACK_GOALS
    .filter((goal) => (byGoal.get(goal)?.length ?? 0) >= MIN_PACKS_PER_GOAL_SECTION)
    .map((goal) => ({ goal, packs: byGoal.get(goal) }));

  const sectionedIds = new Set(goalSections.flatMap((section) => section.packs.map((pack) => pack.id)));
  const morePacks = installablePacks.filter((pack) => !sectionedIds.has(pack.id));

  return { visible, installablePacks, hero, goalSections, morePacks, commitmentTemplates };
}

function PremiumBadge() {
  return <span className="explore-premium-badge">Premium</span>;
}

// Generated covers are the standard pack artwork; uploaded cover art remains
// an optional override for packs that already have one.
export function ExploreCoverArt({ pack, className, variant = "grid", isActive = false, locked = false }) {
  if (pack?.coverImageUrl) {
    return <img src={pack.coverImageUrl} alt="" className={className} loading="lazy" />;
  }
  return <GeneratedPackCover pack={pack} variant={variant} className={className} isActive={isActive} locked={locked} />;
}

function ExploreHero({ pack, isActive, locked, onOpen }) {
  const cardCount = pack.entries?.length ?? 0;
  return (
    <section className="explore-section explore-hero-section">
      <p className="explore-section-title">Start Here</p>
      <button type="button" className="explore-hero" data-testid="explore-hero" onClick={() => onOpen(pack.id)}>
        <ExploreCoverArt pack={pack} className="explore-hero-art" variant="bare" isActive={isActive} locked={locked} />
        <span className="explore-hero-scrim" aria-hidden="true" />
        <span className="explore-hero-copy">
          {pack.isPremium ? <PremiumBadge /> : null}
          {isActive ? <span className="explore-active-pill">Installed</span> : null}
          <span className="explore-hero-title">{pack.title}</span>
          {pack.description ? <span className="explore-hero-description">{pack.description}</span> : null}
          <span className="explore-cover-meta">{cardCount} {cardCount === 1 ? "card" : "cards"}</span>
        </span>
      </button>
    </section>
  );
}

function ExploreCoverCard({ pack, isActive, locked, onOpen }) {
  const cardCount = pack.entries?.length ?? 0;
  return (
    <button
      type="button"
      className={`explore-cover-card${isActive ? " is-active" : ""}`}
      data-testid={`explore-pack-card-${pack.id}`}
      onClick={() => onOpen(pack.id)}
    >
      <span className="explore-cover-art-frame">
        <ExploreCoverArt pack={pack} className="explore-cover-art" variant="grid" isActive={isActive} locked={locked} />
        {pack.isPremium ? <PremiumBadge /> : null}
        {isActive ? <span className="explore-active-pill">Installed</span> : null}
      </span>
      <span className="explore-cover-copy">
        <span className="explore-cover-title">{pack.title}</span>
        {pack.description ? <span className="explore-cover-description">{pack.description}</span> : null}
        <span className="explore-cover-meta">{cardCount} {cardCount === 1 ? "card" : "cards"}</span>
      </span>
    </button>
  );
}

function CommitmentTemplateCard({ template, onTake }) {
  return (
    <article className={`explore-commitment-card theme-${getThemeClass(template.theme)}`} data-testid={`explore-commitment-template-${template.id}`}>
      <div className="explore-commitment-copy">
        <p className="explore-commitment-kicker">{template.packTitle}</p>
        <h3>I will {template.promptText}</h3>
        {template.attribution ? <p>{template.attribution}</p> : null}
      </div>
      <button type="button" className="explore-commitment-button" data-testid={`take-commitment-${template.id}`} onClick={() => onTake(template)}>
        Take this commitment
      </button>
    </article>
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
  onTakeCommitment,
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
        <ExploreCoverArt pack={pack} className="explore-detail-art" variant="detail" isActive={isActive} locked={locked} />
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
        {pack.contentType === "commitments" ? (
          <button type="button" className="explore-install-button" data-testid="explore-take-commitment-button" onClick={() => onTakeCommitment(getPreviewEntries(pack, 1)[0], pack)}>
            Take this commitment
          </button>
        ) : isActive ? (
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
  onTakeCommitment,
}) {
  const [selectedPackId, setSelectedPackId] = useState(null);
  const [interestPackIds, setInterestPackIds] = useState(loadPremiumInterest);

  const { hero, goalSections, morePacks, visible, commitmentTemplates } = useMemo(
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

      {hero ? (
        <ExploreHero
          pack={hero}
          isActive={isPackActive(hero.id)}
          locked={hero.isPremium === true && !canUsePremiumContent}
          onOpen={setSelectedPackId}
        />
      ) : null}

      {commitmentTemplates.length > 0 ? (
        <section className="explore-section" data-testid="explore-commitments-rail">
          <p className="explore-section-title">Commitments</p>
          <div className="explore-commitment-rail">
            {commitmentTemplates.map((template) => (
              <CommitmentTemplateCard key={template.id} template={template} onTake={onTakeCommitment} />
            ))}
          </div>
        </section>
      ) : null}

      {goalSections.map(({ goal, packs: goalPacks }) => (
        <section key={goal} className="explore-section" data-testid={`explore-goal-section-${goal.toLowerCase()}`}>
          <p className="explore-section-title">{goal}</p>
          <div className="explore-cover-grid">
            {goalPacks.map((pack) => (
              <ExploreCoverCard
                key={pack.id}
                pack={pack}
                isActive={isPackActive(pack.id)}
                locked={pack.isPremium === true && !canUsePremiumContent}
                onOpen={setSelectedPackId}
              />
            ))}
          </div>
        </section>
      ))}

      {morePacks.length > 0 ? (
        <section className="explore-section" data-testid="explore-more-section">
          <p className="explore-section-title">{goalSections.length > 0 ? "More to explore" : "Packs"}</p>
          <div className="explore-cover-grid">
            {morePacks.map((pack) => (
              <ExploreCoverCard
                key={pack.id}
                pack={pack}
                isActive={isPackActive(pack.id)}
                locked={pack.isPremium === true && !canUsePremiumContent}
                onOpen={setSelectedPackId}
              />
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
          onTakeCommitment={(entry, pack) => {
            if (!entry) return;
            onTakeCommitment?.({
              id: entry.id ?? `${pack.id}:detail`,
              packId: pack.id,
              packTitle: pack.title,
              promptText: entry.promptText,
              attribution: entry.attribution,
              theme: pack.theme,
              icon: pack.icon ?? "star",
              defaults: entry.commitmentDefaults ?? {},
            });
          }}
          onClose={() => setSelectedPackId(null)}
        />,
        document.body,
      ) : null}
    </section>
  );
}
