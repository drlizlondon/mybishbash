import { useEffect, useState } from "react";
import "./ContinueToAppCard.css";

export function ContinueToAppCard({
  appName,
  appIcon,
  destinationUrl,
  onContinue,
  onBack,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(frameId);
  }, []);

  const handleContinue = () => {
    if (onContinue) {
      onContinue();
    } else if (destinationUrl) {
      window.location.assign(destinationUrl);
    }
  };

  return (
    <div className="continue-to-app-container">
      <div className={`continue-to-app-card ${mounted ? "mounted" : ""}`}>
        {appIcon && (
          <img src={appIcon} alt={`${appName} icon`} className="continue-to-app-icon" />
        )}

        <h1 className="continue-to-app-heading">
          Continue to {appName}?
        </h1>

        <button className="continue-to-app-primary-btn" onClick={handleContinue} type="button">
          Continue to {appName}
        </button>

        <button className="continue-to-app-secondary-btn" onClick={onBack} type="button">
          Back to MyBishBash
        </button>
      </div>
    </div>
  );
}