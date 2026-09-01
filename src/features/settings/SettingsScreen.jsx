import SettingsPanel from "./SettingsPanel";
import { useSettingsStore } from "../../stores/settingsStore";
import { useCardsStore } from "../../stores/cardsStore";
import { useSessionStore } from "../../stores/sessionStore";

export default function SettingsScreen(props) {
  const homeScreenVersions = useSettingsStore((state) => state.homeScreenVersions);
  const notificationSettings = useSettingsStore((state) => state.notificationSettings);
  const timingWindowsPrefs = useSettingsStore((state) => state.timingWindowsPrefs);
  const actionCards = useCardsStore((state) => state.actionCards);
  const session = useSessionStore((state) => state.session);
  const isTester = useSessionStore((state) => state.testerStatus?.is_tester === true);

  return (
    <SettingsPanel
      {...props}
      homeScreenVersions={homeScreenVersions}
      notificationSettings={notificationSettings}
      timingWindowsPrefs={timingWindowsPrefs}
      actionCards={actionCards}
      session={session}
      isTester={isTester}
    />
  );
}
