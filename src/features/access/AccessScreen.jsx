import { useMemo } from "react";
import AccessPanel from "./AccessPanel";
import { resolveEntitlements, isUnlimited } from "../../lib/accessCapabilities";
import { useSessionStore } from "../../stores/sessionStore";

export default function AccessScreen(props) {
  const accessProfile = useSessionStore((state) => state.accessProfile);
  const isAdmin = useSessionStore((state) => state.isAdmin);
  const entitlements = useMemo(
    () => resolveEntitlements(accessProfile ?? {}, { isAdmin }),
    [accessProfile, isAdmin],
  );

  return (
    <AccessPanel
      {...props}
      accessProfile={accessProfile}
      canUseMultipleApps={isUnlimited(entitlements.maxConnectedApps)}
    />
  );
}
