import { useEffect, useRef, useState } from "react";
import { BrandMark } from "../../components/BrandMark";
import { BASE_PATH } from "../../app/router/routes";

export default function Masthead({ onCreate, onNavigate, onLogOut, session, hideCreate = false }) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

  function handleNavigate(path) {
    setAccountMenuOpen(false);
    onNavigate?.(path);
  }

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    function handlePointerDown(event) {
      if (!accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  return (
    <header className="hero">
      <div className="hero-copy">
        <div className="hero-mark" aria-hidden="true">
          <BrandMark />
        </div>
      </div>
      <div className={`account-menu-wrap ${accountMenuOpen ? "account-menu-wrap-open" : ""}`} ref={accountMenuRef}>
      <button
        type="button"
        className="settings-gear-button"
        data-testid="settings-gear"
        onClick={() => setAccountMenuOpen((current) => !current)}
        aria-label="Account menu"
        aria-expanded={accountMenuOpen}
        title="Account"
      >
        <span className="account-avatar-mark" aria-hidden="true">
          <span className="account-avatar-head" />
          <span className="account-avatar-body" />
        </span>
      </button>
      {accountMenuOpen ? (
        <div className="account-menu" data-testid="account-menu">
          <button type="button" onClick={() => handleNavigate("/settings")}>Account</button>
          <button type="button" onClick={() => handleNavigate("/access")}>Access / Plan</button>
          <button type="button" onClick={() => handleNavigate("/apps")}>Apps</button>
          <button type="button" onClick={() => { setAccountMenuOpen(false); window.location.href = `${BASE_PATH}/about`; }}>Help</button>
          <button type="button" onClick={() => { setAccountMenuOpen(false); onLogOut?.(); }}>Sign out</button>
          <button type="button" className="account-menu-close" onClick={() => setAccountMenuOpen(false)}>Close</button>
        </div>
      ) : null}
      </div>
      {!hideCreate ? (
        <button
          type="button"
          className="add-button"
          data-testid="create-card-button"
          onClick={onCreate}
          aria-label="Create a myBishBash"
        >
          +
        </button>
      ) : null}
    </header>
  );
}

