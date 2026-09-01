import { useEffect } from "react";
import {
  buildE2ESession,
  E2E_TESTER_MODE_KEY,
  loadE2EAccessProfile,
  recordLaunchTiming,
} from "../e2e";
import {
  checkIsAdmin,
  fetchOwnAccessProfile,
  getSession,
  getSyncErrorMessage,
  onAuthStateChange,
} from "../../lib/mybishbashSync";
import { isAccessActive } from "../../lib/accessCapabilities";
import { getSessionActions, useSessionStore } from "../../stores/sessionStore";
import { fetchTesterStatus } from "../../testing/TestPilot";

const AUTH_SESSION_RETRY_DELAYS_MS = [150, 450, 900];
const HQ_ADMIN_EMAILS = (import.meta.env.VITE_HQ_ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function useAuthLifecycle({ e2eMode, testerStatus, setShouldLaunchOverlay }) {
  const session = useSessionStore((state) => state.session);
  const authReady = useSessionStore((state) => state.authReady);
  const {
    setAccessProfile,
    setAccessStatus,
    setAdminStatus,
    setSession,
    setAuthReady,
    setIsAdmin,
    setSyncStatus,
    setSyncError,
    setTesterStatus,
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

  useEffect(() => {
    if (e2eMode) {
      setIsAdmin(false);
      setAdminStatus("ready");
      return undefined;
    }
    if (session?.user?.id) {
      if (session.user.email && HQ_ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
        setIsAdmin(true);
        setAdminStatus("ready");
        return undefined;
      }
      let cancelled = false;
      setIsAdmin(false);
      setAdminStatus("checking");
      checkIsAdmin(session.user.id)
        .then((admin) => {
          if (!cancelled) setIsAdmin(admin);
        })
        .catch(() => {
          if (!cancelled) setIsAdmin(false);
        })
        .finally(() => {
          if (!cancelled) setAdminStatus("ready");
        });
      return () => {
        cancelled = true;
      };
    } else {
      setIsAdmin(false);
      setAdminStatus("ready");
    }
    return undefined;
  }, [e2eMode, session?.user?.email, session?.user?.id]);

  useEffect(() => {
    if (e2eMode) {
      const e2eTesterMode = typeof window !== "undefined" && window.localStorage.getItem(E2E_TESTER_MODE_KEY) === "true";
      setTesterStatus({ is_tester: e2eTesterMode });
      recordLaunchTiming("tester status ready", { source: "e2e", isTester: e2eTesterMode }, { is_tester: e2eTesterMode });
      return undefined;
    }
    if (!session?.user?.id) {
      setTesterStatus({ is_tester: false });
      recordLaunchTiming("tester status ready", { sessionPresent: false, isTester: false }, { is_tester: false });
      return undefined;
    }

    let cancelled = false;
    setTesterStatus(null);
    fetchTesterStatus(session.user.id)
      .then((status) => {
        if (!cancelled) {
          const nextStatus = status ?? { is_tester: false };
          setTesterStatus(nextStatus);
          recordLaunchTiming("tester status ready", { sessionPresent: true, isTester: nextStatus.is_tester === true }, nextStatus);
        }
      })
      .catch((error) => {
        console.warn("Could not load tester status", error);
        if (!cancelled) {
          setTesterStatus({ is_tester: false });
          recordLaunchTiming("tester status ready", { sessionPresent: true, isTester: false, error: true }, { is_tester: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [e2eMode, session?.user?.id]);

  useEffect(() => {
    if (!authReady || e2eMode || !session?.user?.id) {
      setAccessProfile(e2eMode ? loadE2EAccessProfile() : null);
      setAccessStatus(e2eMode ? "granted" : session?.user?.id ? "unknown" : "signed-out");
      return undefined;
    }
    let cancelled = false;
    setAccessStatus("loading");
    fetchOwnAccessProfile(session.user.id).then((profileRow) => {
      if (!cancelled) {
        setAccessProfile(profileRow);
        setAccessStatus(!profileRow || isAccessActive(profileRow) ? "granted" : "denied");
      }
    }).catch((error) => {
      console.warn("Could not load access profile; preserving signed-in session", error);
      if (!cancelled) {
        setAccessProfile(null);
        setAccessStatus("granted");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, e2eMode, session?.user?.id]);
}
