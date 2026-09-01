import { isKnownLauncher, getLauncherConfig, resolveLauncherIconSrc } from "../../lib/launcherRegistry";
import {
  getTodayKey,
  normalizeCards,
  isCommitmentCard,
  isEligible,
  isCardDoneToday,
} from "../../utils";

function getUsageDays(cards = [], events = []) {
  const dateValues = [
    ...cards.map((card) => card.createdAt),
    ...events.map((event) => event.created_at),
  ]
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (dateValues.length === 0) return 1;
  return Math.max(1, Math.floor((Date.now() - Math.min(...dateValues)) / 86400000) + 1);
}

function getCommitmentAppMeta(card, versions = {}) {
  const explicitName = card?.appName ?? card?.app_name ?? card?.appLabel ?? card?.app_label ?? null;
  if (explicitName) {
    return {
      name: explicitName,
      iconUrl: card?.appIconUrl ?? card?.app_icon_url ?? card?.appIcon ?? card?.app_icon ?? "",
    };
  }

  const launcherId = card?.launcherContext ?? card?.targetApp ?? card?.appId ?? card?.app_id ?? null;
  if (!launcherId || !isKnownLauncher(launcherId)) return null;
  const version = versions[launcherId] ?? getLauncherConfig(launcherId);
  if (!version) return null;
  return {
    name: version.realAppLabel || version.displayName || version.name || launcherId,
    iconUrl: resolveLauncherIconSrc(version),
  };
}

export function getHomeCardTitle(card) {
  if (isCommitmentCard(card)) return "Today’s Commitment";
  return card.dashboardTitle ?? card.promptText?.trim() ?? "";
}

export function buildHomeState({ cards = [], events = [], timezone, homeScreenVersions = {} }) {
  const now = new Date();
  const todayKey = getTodayKey(now, timezone);
  const normalized = normalizeCards(cards, now, timezone);
  const personalCardsTotal = normalized.filter((card) =>
    !card.sourcePackId && !card.deletedAt && !isCommitmentCard(card)
  );
  const personalCardsToday = personalCardsTotal.filter((card) => {
    if (card.sourcePackId || card.deletedAt || isCommitmentCard(card)) return false;
    return isCardDoneToday(card, todayKey) || card.statusToday === "pending" || isEligible(card, now, timezone);
  });
  const completedPersonalCardsToday = Math.min(
    personalCardsToday.filter((card) => isCardDoneToday(card, todayKey)).length,
    personalCardsTotal.length,
  );
  const nextIncompletePersonalCard = personalCardsToday.find((card) => !isCardDoneToday(card, todayKey)) ?? null;
  const liveCommitments = normalized
    .filter((card) =>
      isCommitmentCard(card) &&
      !card.deletedAt &&
      !card.paused &&
      !card.disliked &&
      card.commitmentStatusToday === "made" &&
      card.commitmentDecisionDate === todayKey &&
      card.commitmentLifecycleStatus !== "closed_early" &&
      card.commitmentLifecycleStatus !== "reviewed"
    )
    .sort((left, right) => new Date(right.commitmentDecisionAt ?? right.updatedAt ?? 0).getTime() - new Date(left.commitmentDecisionAt ?? left.updatedAt ?? 0).getTime());
  const activeCommitment = liveCommitments[0] ?? null;
  const hasCompletedCommitmentToday = !activeCommitment && normalized.some((card) =>
    isCommitmentCard(card) &&
    !card.deletedAt &&
    card.commitmentDecisionDate === todayKey &&
    Boolean(card.commitmentStatusToday)
  );
  const activeCommitmentApp = getCommitmentAppMeta(activeCommitment, homeScreenVersions);
  const checkInComplete = activeCommitment?.commitmentCheckInResponseDate === todayKey;
  const hasCheckIn = Boolean(activeCommitment?.commitmentCheckInEnabled);

  return {
    usageDays: getUsageDays(normalized, events),
    completedPersonalCardsToday,
    totalPersonalCardsToday: personalCardsTotal.length,
    nextIncompletePersonalCard,
    liveCommitmentCount: liveCommitments.length,
    hasCompletedCommitmentToday,
    activeCommitment: activeCommitment
      ? {
          id: activeCommitment.id,
          title: activeCommitment.promptText || activeCommitment.dashboardTitle || "Untitled commitment",
          appName: activeCommitmentApp?.name ?? "",
          appIconUrl: activeCommitmentApp?.iconUrl ?? "",
          progressPercentage: hasCheckIn ? (checkInComplete ? 100 : 50) : null,
          metadataText: hasCheckIn
            ? checkInComplete
              ? "Check-in complete"
              : activeCommitment.commitmentCheckInTime
                ? `Check-in at ${activeCommitment.commitmentCheckInTime}`
                : "Check-in set"
            : "",
        }
      : null,
  };
}
