import { useMemo } from "react";
import { buildLibrarySections } from "../../lib/librarySections";
import { useCardsStore } from "../../stores/cardsStore";
import { usePacksStore } from "../../stores/packsStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { PACKS } from "../../utils";
import StandardLibraryPanel from "./StandardLibraryPanel";

export default function LibraryScreen(props) {
  const cards = useCardsStore((state) => state.cards);
  const actionCards = useCardsStore((state) => state.actionCards);
  const hiddenLibraryPacks = usePacksStore((state) => state.hiddenLibraryPacks);
  const globalPacks = usePacksStore((state) => state.globalPacks);
  const timezone = useSettingsStore((state) => state.profile.timezone);
  const libraryPacks = useMemo(() => {
    const databaseSourceKeys = new Set(globalPacks.map((pack) => pack.sourceKey).filter(Boolean));
    const fallbackPacks = PACKS.filter((pack) => !databaseSourceKeys.has(pack.id));
    return [...fallbackPacks, ...globalPacks].filter((pack) => !hiddenLibraryPacks.includes(pack.id));
  }, [globalPacks, hiddenLibraryPacks]);
  const sections = useMemo(
    () => buildLibrarySections({ cards, libraryPacks }),
    [cards, libraryPacks],
  );
  const doInsteadItems = useMemo(
    () => actionCards.filter((card) => !card.deletedAt),
    [actionCards],
  );

  return (
    <StandardLibraryPanel
      {...props}
      personalItems={sections.personal}
      commitmentItems={sections.commitments}
      activePackItems={sections.activePacks}
      libraryPacks={libraryPacks}
      timezone={timezone}
      doInsteadItems={doInsteadItems}
    />
  );
}
