export default function AppsAccessScreen({ onUnlock, onHaveCode, onBack }) {
  return (
    <div className="apps-manage-screen" data-testid="apps-access-screen">
      <button type="button" className="text-button apps-back-button" data-testid="apps-access-back" onClick={onBack}>
        ← Apps
      </button>
      <div className="settings-card apps-manage-hero">
        <div className="settings-version-heading">
          <p>Upgrade</p>
          <span>Upgrade to keep myBishBash connected to more apps.</span>
        </div>
      </div>
      <div className="settings-card settings-compact">
        <button type="button" className="pack-button" onClick={onUnlock}>
          Upgrade
        </button>
        <button type="button" className="text-button apps-code-link" onClick={onHaveCode}>
          Have a code?
        </button>
      </div>
    </div>
  );
}

