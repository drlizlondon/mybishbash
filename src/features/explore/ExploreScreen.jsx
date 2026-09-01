import { useMemo } from "react";
import { resolveEntitlements } from "../../lib/accessCapabilities";
import { PACKS } from "../../utils";
import { useCardsStore } from "../../stores/cardsStore";
import { usePacksStore } from "../../stores/packsStore";
import { useSessionStore } from "../../stores/sessionStore";
import ExplorePanel from "./ExplorePanel";

export default function ExploreScreen(props) {
  const cards = useCardsStore((state) => state.cards);
  const hiddenLibraryPacks = usePacksStore((state) => state.hiddenLibraryPacks);
  const globalPacks = usePacksStore((state) => state.globalPacks);
  const testerStatus = useSessionStore((state) => state.testerStatus);
  const accessProfile = useSessionStore((state) => state.accessProfile);
  const isAdmin = useSessionStore((state) => state.isAdmin);
  const packs = useMemo(() => {
    const databaseSourceKeys = new Set(globalPacks.map((pack) => pack.sourceKey).filter(Boolean));
    const fallbackPacks = PACKS.filter((pack) => !databaseSourceKeys.has(pack.id));
    return [...fallbackPacks, ...globalPacks].filter((pack) => !hiddenLibraryPacks.includes(pack.id));
  }, [globalPacks, hiddenLibraryPacks]);
  const entitlements = useMemo(
    () => resolveEntitlements(accessProfile ?? {}, { isAdmin }),
    [accessProfile, isAdmin],
  );
  const isPackActive = (packId) =>
    cards.some((card) => card.sourcePackId === packId && !card.deletedAt);

  return (
    <ExplorePanel
      {...props}
      packs={packs}
      isPackActive={isPackActive}
      isTester={testerStatus?.is_tester === true}
      canUsePremiumContent={entitlements.premiumPacksEnabled}
    />
  );
}
