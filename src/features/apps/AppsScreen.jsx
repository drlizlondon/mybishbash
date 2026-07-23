import { useMemo } from "react";
import AppsPanel from "./AppsPanel";
import { resolveEntitlements, isUnlimited } from "../../lib/accessCapabilities";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSessionStore } from "../../stores/sessionStore";

export default function AppsScreen(props) {
  const homeScreenVersions = useSettingsStore((state) => state.homeScreenVersions);
  const testerStatus = useSessionStore((state) => state.testerStatus);
  const accessProfile = useSessionStore((state) => state.accessProfile);
  const isAdmin = useSessionStore((state) => state.isAdmin);
  const entitlements = useMemo(
    () => resolveEntitlements(accessProfile ?? {}, { isAdmin }),
    [accessProfile, isAdmin],
  );

  return (
    <AppsPanel
      {...props}
      homeScreenVersions={homeScreenVersions}
      isTester={testerStatus?.is_tester === true}
      canUseMultipleApps={isUnlimited(entitlements.maxConnectedApps)}
      maxConnectedApps={entitlements.maxConnectedApps}
    />
  );
}
