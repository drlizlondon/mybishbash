import { useMemo } from "react";
import { resolveEntitlements } from "../../lib/accessCapabilities";
import { useCardsStore } from "../../stores/cardsStore";
import { useSessionStore } from "../../stores/sessionStore";
import { isCommitmentCard } from "../../utils";
import Composer from "./Composer";

export default function ComposerScreen(props) {
  const cards = useCardsStore((state) => state.cards);
  const accessProfile = useSessionStore((state) => state.accessProfile);
  const isAdmin = useSessionStore((state) => state.isAdmin);
  const personalCardCount = useMemo(
    () => cards.filter((card) => !card.sourcePackId && !card.deletedAt && !isCommitmentCard(card)).length,
    [cards],
  );
  const entitlements = useMemo(
    () => resolveEntitlements(accessProfile ?? {}, { isAdmin }),
    [accessProfile, isAdmin],
  );

  return (
    <Composer
      {...props}
      personalCardCount={personalCardCount}
      maxPersonalCards={entitlements.maxPersonalCards}
    />
  );
}
