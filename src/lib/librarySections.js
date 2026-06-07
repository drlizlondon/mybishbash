import { PACKS, isCommitmentLikeCard } from "../utils.js";

function createdDesc(left, right) {
  const leftCreated = new Date(left.representative.createdAt ?? 0).getTime();
  const rightCreated = new Date(right.representative.createdAt ?? 0).getTime();
  return rightCreated - leftCreated;
}

function titleForPack(packId, packCards, libraryPacks = []) {
  const pack = libraryPacks.find((item) => item.id === packId || item.sourceKey === packId) ?? PACKS.find((item) => item.id === packId);
  return pack?.title ?? pack?.name ?? packCards[0]?.dashboardTitle ?? packCards[0]?.promptText ?? "Active pack";
}

export function buildPersonalLibraryItems(cards = []) {
  return cards
    .filter((card) => !card.sourcePackId && !card.deletedAt && !isCommitmentLikeCard(card))
    .map((card) => ({
      type: "personal",
      id: card.id,
      representative: card,
    }))
    .sort(createdDesc);
}

export function buildCommitmentLibraryItems(cards = []) {
  return cards
    .filter((card) => !card.sourcePackId && !card.deletedAt && isCommitmentLikeCard(card))
    .map((card) => ({
      type: "commitment",
      id: card.id,
      representative: card,
    }))
    .sort(createdDesc);
}

export function buildActivePackLibraryItems(cards = [], libraryPacks = []) {
  const packMap = new Map();

  cards.forEach((card) => {
    if (!card.sourcePackId || card.deletedAt) return;
    if (!packMap.has(card.sourcePackId)) {
      packMap.set(card.sourcePackId, []);
    }
    packMap.get(card.sourcePackId).push(card);
  });

  return Array.from(packMap.entries())
    .map(([packId, packCards]) => {
      const representative = packCards.find((card) => !card.paused && !card.disliked) ?? packCards[0];
      const activeCards = packCards.filter((card) => !card.paused && !card.disliked);
      const title = titleForPack(packId, packCards, libraryPacks);
      return {
        type: "pack",
        id: packId,
        count: packCards.length,
        activeCount: activeCards.length,
        representative: {
          ...representative,
          id: packId,
          promptText: title,
          dashboardTitle: title,
          frequency: "multi_daily",
        },
      };
    })
    .sort(createdDesc);
}

export function buildLibrarySections({ cards = [], libraryPacks = [] } = {}) {
  return {
    personal: buildPersonalLibraryItems(cards),
    commitments: buildCommitmentLibraryItems(cards),
    activePacks: buildActivePackLibraryItems(cards, libraryPacks),
  };
}
