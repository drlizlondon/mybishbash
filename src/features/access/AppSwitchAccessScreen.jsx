export default function AppSwitchAccessScreen({ activeStatus, targetStatus, onSwitch, onUpgrade, onBack }) {
  const currentName = activeStatus?.version?.realAppLabel ?? activeStatus?.version?.name ?? "your current app";
  const targetVersion = targetStatus?.version ?? {};
  const targetName = targetVersion.realAppLabel ?? targetVersion.name ?? targetVersion.displayName ?? "this app";
  return (
    <div className="apps-manage-screen" data-testid="apps-switch-access-screen">
      <button type="button" className="text-button apps-back-button" onClick={onBack}>
        ← Apps
      </button>
      <div className="settings-card apps-manage-hero">
        <div className="settings-version-heading">
          <p>Choose your active app</p>
          <span>Free Core lets you keep one connected app active.</span>
        </div>
      </div>
      <div className="settings-card settings-compact">
        <div className="settings-version-heading">
          <p>Switch to {targetName}?</p>
          <span>{currentName} will be inactive while on Free Core. Its setup and settings are kept.</span>
        </div>
        <button type="button" className="pack-button" data-testid={`apps-switch-to-${targetVersion.id}`} onClick={onSwitch}>
          Switch active app
        </button>
        <button type="button" className="pack-button secondary" onClick={onUpgrade}>
          Upgrade to keep multiple apps active
        </button>
      </div>
    </div>
  );
}

