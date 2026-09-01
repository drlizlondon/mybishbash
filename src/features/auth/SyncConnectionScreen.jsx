import { useMemo, useState } from "react";
import { ContentEditProvider, EditPanel, EditableText, useContentEdit } from "../../editing/ContentEditContext";
import { authContent } from "../../content/authContent";
import { getSignupHandoffReference, getSyncErrorMessage } from "../../lib/mybishbashSync";
import { BrandMark } from "../../components/BrandMark";
import { isDemoModeEnabled } from "../../app/e2e";
import { BASE_PATH } from "../../app/router/routes";

export default function SyncConnectionScreen(props) {
  return (
    <ContentEditProvider
      initialContent={authContent}
      storageKey="mybishbash.authContentDraft.v1"
      saveEndpoint="/__save-auth-content"
      saveLabel="src/content/authContent.js"
      isContentCompatible={(value) => Boolean(value?.titles?.signup && value?.form?.email)}
    >
      <SyncConnectionScreenContent {...props} />
      <EditPanel />
    </ContentEditProvider>
  );
}

function SyncConnectionScreenContent({ mode, error, onSignUp, onLogIn, onPasswordReset, onRecoverSignupAccess, onClearError, onOpenLegalModal, launcherName = "" }) {
  const { content } = useContentEdit();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetStatus, setResetStatus] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetPending, setResetPending] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [handoffRevision, setHandoffRevision] = useState(0);
  const [isLogin, setIsLogin] = useState(() => {
    if (typeof window === "undefined") return true;
    return new URLSearchParams(window.location.search).get("signup") !== "1";
  });
  const [agreedToLegal, setAgreedToLegal] = useState(false);
  const hasSignupHandoff = useMemo(() => Boolean(getSignupHandoffReference()), [handoffRevision]);
  const isDemoMode = isDemoModeEnabled();

  const isStandalone = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone);
  const isLauncherLogin = mode === "launcher";
  const isAccessDenied = mode === "access-denied";
  const isSignupBlocked = !isLogin && !hasSignupHandoff && !isDemoMode;
  const isStandaloneSignupRecovery = isSignupBlocked && isStandalone;
  const titlePath = isLauncherLogin
    ? "titles.launcher"
    : isStandaloneSignupRecovery
      ? "titles.signupRecovery"
    : isAccessDenied || (isSignupBlocked && !isStandaloneSignupRecovery)
      ? "titles.inviteOnly"
      : isLogin
        ? "titles.login"
        : "titles.signup";
  const title = isLauncherLogin
    ? content.titles.launcher
    : isAccessDenied
      ? content.titles.inviteOnly
    : isStandaloneSignupRecovery
      ? content.titles.signupRecovery
    : isSignupBlocked && !isStandaloneSignupRecovery
      ? content.titles.inviteOnly
    : isLogin
      ? content.titles.login
      : content.titles.signup;
  const loginCopy = isLauncherLogin
    ? `${content.copy.launcherPrefix} ${launcherName || "app"} ${content.copy.launcherSuffix}`
    : content.copy.login;
  function switchMode(nextIsLogin) {
    setIsLogin(nextIsLogin);
    setShowPassword(false);
    setResetStatus("");
    setResetError("");
    setRecoveryError("");
    onClearError?.();
  }

  async function submitSignupRecovery(event) {
    event.preventDefault();
    const trimmedCode = recoveryCode.trim();
    if (!trimmedCode || recoveryPending) return;
    setRecoveryPending(true);
    setRecoveryError("");
    onClearError?.();
    try {
      const isValid = await onRecoverSignupAccess?.(trimmedCode);
      if (!isValid) {
        setRecoveryError(content.status.recoveryInvalid);
        return;
      }
      setRecoveryCode("");
      setHandoffRevision((current) => current + 1);
      setIsLogin(false);
    } catch {
      setRecoveryError(content.status.recoveryInvalid);
    } finally {
      setRecoveryPending(false);
    }
  }

  function submitExisting(event) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) return;
    if (!isLogin && !agreedToLegal) {
      alert(content.status.legalRequired);
      return;
    }
    if (isLogin) {
      onLogIn(email, password);
    } else {
      onSignUp(email, password);
    }
  }

  async function submitPasswordReset() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || resetPending) return;
    setResetPending(true);
    setResetStatus("");
    setResetError("");
    onClearError?.();
    try {
      await onPasswordReset?.(trimmedEmail);
      setResetStatus(content.status.passwordResetSent);
    } catch (resetRequestError) {
      setResetError(getSyncErrorMessage(resetRequestError, content.status.passwordResetError));
    } finally {
      setResetPending(false);
    }
  }

  return (
    <main className="sync-screen" data-testid="sync-screen">
      <section className="sync-card">
        <span className="sync-heart" aria-hidden="true">
          <BrandMark />
        </span>
        <h1><EditableText path={titlePath}>{title}</EditableText></h1>
        {mode === "loading" ? (
          <EditableText as="p" path="copy.loading" />
        ) : (
          <>
            <p>
              {isAccessDenied
                ? content.copy.accessDenied
                : isStandaloneSignupRecovery
                ? content.copy.signupRecoveryStandalone
                : isSignupBlocked
                ? content.copy.signupBlocked
                : isLogin
                ? loginCopy
                : content.copy.signup}
            </p>
            {isLogin && isStandalone ? <EditableText as="p" className="sync-note" path="copy.standalone" /> : null}
            {error ? <p className="sync-error">{error}</p> : null}

            {isSignupBlocked ? (
              <div className="sync-form">
                {isStandaloneSignupRecovery ? (
                  <>
                    <form className="sync-form" onSubmit={submitSignupRecovery}>
                      <div className="field">
                        <label htmlFor="sync-recovery-code"><EditableText path="form.accessCode" /></label>
                        <input
                          id="sync-recovery-code"
                          className="settings-input"
                          value={recoveryCode}
                          onChange={(event) => {
                            setRecoveryCode(event.target.value);
                            if (recoveryError) setRecoveryError("");
                          }}
                          autoCapitalize="characters"
                          autoComplete="one-time-code"
                          placeholder={content.form.accessCodePlaceholder}
                          required
                        />
                      </div>
                      {recoveryError ? <p className="sync-error" role="alert">{recoveryError}</p> : null}
                      <button type="submit" className="save-button" disabled={recoveryPending}>
                        {recoveryPending ? content.form.checkingAccess : content.actions.continue}
                      </button>
                    </form>
                    <a className="text-button sync-secondary-link" href={`${BASE_PATH}/download`}>
                      <EditableText path="actions.backToBrowserSetup" />
                    </a>
                  </>
                ) : (
                  <a className="save-button" href={`${BASE_PATH}/invite`}><EditableText path="actions.getMyBishBash" /></a>
                )}
                <div className="sync-auth-switch">
                  <EditableText path="actions.alreadyHaveAccount" />
                  <button type="button" className="text-button sync-secondary-link" onClick={() => switchMode(true)}>
                    <EditableText path="actions.loginSwitch" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <form className="sync-form" onSubmit={submitExisting}>
                  <div className="field">
                    <label htmlFor="sync-email"><EditableText path="form.email" /></label>
                    <input
                      id="sync-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      className="settings-input"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={content.form.emailPlaceholder}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="sync-password"><EditableText path="form.password" /></label>
                    <span className="password-field">
                      <input
                        id="sync-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={isLogin ? "current-password" : "new-password"}
                        className="settings-input"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={content.form.passwordPlaceholder}
                        required
                      />
                      <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)}>
                        {showPassword ? content.form.hidePassword : content.form.showPassword}
                      </button>
                    </span>
                    {isLogin ? (
                      <button
                        type="button"
                        className="text-button sync-forgot-password"
                        onClick={submitPasswordReset}
                        disabled={!email.trim() || resetPending}
                      >
                        {resetPending ? content.form.sending : <EditableText path="form.forgotPassword" />}
                      </button>
                    ) : null}
                  </div>
                  {resetStatus ? <p className="sync-success">{resetStatus}</p> : null}
                  {resetError ? <p className="sync-error">{resetError}</p> : null}
                  {!isLogin ? (
                    <>
                      <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "8px", marginTop: "12px", marginBottom: "16px", cursor: "pointer", fontSize: "14px", fontWeight: "normal", opacity: 0.9 }}>
                        <input
                          type="checkbox"
                          checked={agreedToLegal}
                          onChange={(e) => setAgreedToLegal(e.target.checked)}
                          style={{ width: "auto", margin: 0 }}
                        />
                        <span style={{ lineHeight: "1.4" }}>
                          <EditableText path="form.legalPrefix" /> <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenLegalModal?.("terms"); }} style={{ textDecoration: "underline" }}><EditableText path="form.terms" /></a> <EditableText path="form.legalMiddle" /> <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenLegalModal?.("privacy"); }} style={{ textDecoration: "underline" }}><EditableText path="form.privacy" /></a><EditableText path="form.legalSuffix" />
                        </span>
                      </label>
                    </>
                  ) : null}
                  <button type="submit" className="save-button">
                    {isLogin ? content.form.loginSubmit : content.form.signupSubmit}
                  </button>
                </form>

                <div className="sync-auth-switch">
                  <span>{isLogin ? content.actions.needAccount : content.actions.alreadyHaveAccount}</span>
                  <button type="button" className="text-button sync-secondary-link" onClick={() => switchMode(!isLogin)}>
                    {isLogin ? content.actions.signupSwitch : content.actions.loginSwitch}
                  </button>
                </div>
              </>
            )}
            {!isStandalone && !isStandaloneSignupRecovery ? (
              <p className="sync-waitlist-line">
                <EditableText path="actions.noInvite" /> <a className="text-button sync-secondary-link" href={`${BASE_PATH}/early-access`}><EditableText path="actions.joinWaitlist" /></a>
              </p>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
