import { useCardsStore } from "../../stores/cardsStore";
import { useEventsStore } from "../../stores/eventsStore";
import { useSettingsStore } from "../../stores/settingsStore";
import HomePanel from "./HomePanel";

/**
 * Store container for the home screen (Phase 4 D4).
 *
 * Reads the domain state HomePanel needs directly from the stores so App does
 * not drill `cards`/`events`/`timezone`/`homeScreenVersions` through its JSX.
 * Everything else HomePanel takes — onboarding/activation props and the
 * launch-flow callbacks — stays App-owned and arrives through `props`.
 * HomePanel's body is unchanged.
 */
export default function HomeScreen(props) {
  const cards = useCardsStore((state) => state.cards);
  const events = useEventsStore((state) => state.events);
  const timezone = useSettingsStore((state) => state.profile.timezone);
  const homeScreenVersions = useSettingsStore((state) => state.homeScreenVersions);

  return (
    <HomePanel
      {...props}
      cards={cards}
      events={events}
      timezone={timezone}
      homeScreenVersions={homeScreenVersions}
    />
  );
}
