import { useState } from "react";

export default function AppsCodeScreen({ onClaimAccessCode, onBack, onContinue, onOpenInstallGuide }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("entry");
  const [error, setError] = useState("");
  const isChecking = status === "checking";
  const isSuccess = status === "success";

  async function submitCode(event) {
    event.preventDefault();
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("Enter your code to continue.");
      return;
    }
    setStatus("checking");
    setError("");
    const claimed = await onClaimAccessCode?.(trimmedCode);
    if (claimed) {
      setStatus("success");
      return;
    }
    setStatus("entry");
    setError("That code did not work. Please check it and try again.");
  }

  return (
    <div className="apps-manage-screen" data-testid="apps-code-screen">
      {!isSuccess ? (
        <button type="button" className="text-button apps-back-button" data-testid="apps-code-back" onClick={onBack}>
          ← Apps
        </button>
      ) : null}
      <div className="settings-card apps-manage-hero">
        <div className="settings-version-heading">
          <p>{isSuccess ? "You now have access to more apps." : "Have a code?"}</p>
          <span>
            {isSuccess
              ? "You can now use myBishBash with more apps."
              : "Enter your access code to use myBishBash with more apps."}
          </span>
        </div>
      </div>

      {isSuccess ? (
        <div className="settings-card apps-code-actions" data-testid="apps-code-success">
          <button type="button" className="pack-button apps-settings-button" onClick={onContinue}>
            Continue to Apps
          </button>
          <button type="button" className="pack-button secondary" onClick={onOpenInstallGuide}>
            Add myBishBash to your Home Screen
          </button>
        </div>
      ) : (
        <form className="settings-card apps-code-form" onSubmit={submitCode}>
          <label htmlFor="apps-access-code">Access code</label>
          <input
            id="apps-access-code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              if (error) setError("");
            }}
            placeholder="Enter access code"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            disabled={isChecking}
          />
          {error ? <p className="download-access-error" role="alert">{error}</p> : null}
          <button type="submit" className="pack-button apps-settings-button" disabled={isChecking}>
            {isChecking ? "Checking..." : "Continue"}
          </button>
        </form>
      )}
    </div>
  );
}

