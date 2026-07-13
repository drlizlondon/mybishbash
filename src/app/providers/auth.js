import { useEffect } from "react";
import { buildE2ESession, recordLaunchTiming } from "../e2e";
import {
  getSession,
  getSyncErrorMessage,
  onAuthStateChange,
} from "../../lib/mybishbashSync";
import { getSessionActions } from "../../stores/sessionStore";

const AUTH_SESSION_RETRY_DELAYS_MS = [150, 450, 900];

export function useAuthLifecycle({ e2eMode, testerStatus, setShouldLaunchOverlay }) {
  const {
    setSession,
    setAuthReady,
    setSyncStatus,
    setSyncError,
  } = getSessionActions();

  useEffect(() => {
    let mounted = true;
    let authSessionForTiming = null;

    if (e2eMode) {
      setSession(buildE2ESession());
      setSyncStatus("ready");
      recordLaunchTiming("sync ready", { source: "e2e" }, { is_tester: true });
      setSyncError("");
      setAuthReady(true);
      recordLaunchTiming("auth ready", { source: "e2e" }, { is_tester: true });
      setShouldLaunchOverlay(false);
      return undefined;
    }

    async function resolveSessionWithRetry() {
      let lastError = null;
      for (let attempt = 0; attempt <= AUTH_SESSION_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          return await getSession();
        } catch (error) {
          lastError = error;
          const delay = AUTH_SESSION_RETRY_DELAYS_MS[attempt];
          if (delay === undefined) break;
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
      }
      throw lastError;
    }

    resolveSessionWithRetry()
      .then((currentSession) => {
        if (mounted) {
          authSessionForTiming = currentSession;
          setSession(currentSession);
          if (!currentSession) setSyncStatus("needs-connection");
        }
      })
      .catch((error) => {
        console.warn("[AUTH] Session check failed after retries", error);
        if (mounted) {
          setSyncError(getSyncErrorMessage(error, "Still checking your myBishBash login. Please try again in a moment."));
          setSyncStatus("error");
        }
      })
      .finally(() => {
        if (mounted) setAuthReady(true);
        if (mounted) recordLaunchTiming("auth ready", { sessionPresent: Boolean(authSessionForTiming?.user?.id) }, testerStatus);
      });

    const { data: { subscription } } = onAuthStateChange((event, newSession) => {
      if (mounted) {
        setSession((currentSession) => {
          if (newSession) return newSession;
          if (event === "SIGNED_OUT") return null;
          return currentSession;
        });
        if (newSession) {
          setSyncError("");
        } else if (event === "SIGNED_OUT") {
          setSyncStatus("needs-connection");
        }
        setAuthReady(true);
        recordLaunchTiming("auth ready", { sessionPresent: Boolean(newSession?.user?.id), event }, testerStatus);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [e2eMode]);
}
