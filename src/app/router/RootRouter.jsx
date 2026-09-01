import { Suspense, lazy, useEffect, useState } from "react";
import App, {
  isStandaloneDisplayMode,
  consumeSignupHandoffFromUrl,
  applyLocalNormalPreviewFlag,
  shouldStartDemoOnboarding,
  shouldStartDemoSignup,
  resetDemoOnboardingState,
  resetDemoSignupState,
} from "../../App";
import { BASE_PATH, getPathRelativeToKnownBase, normalizeRoutePath } from "./routes";

// Marketing/legal pages are lazy: they short-circuit the app at the top of
// App() and pull in framer-motion (landing) — keeping them out of the main
// bundle speeds first paint on the app/card path.
const EditableLandingPage = lazy(() => import("../../features/marketing/LandingPage").then((m) => ({ default: m.EditableLandingPage })));
const EarlyAccessPage = lazy(() => import("../../features/marketing/EarlyAccessPage"));
const AboutPage = lazy(() => import("../../features/marketing/AboutPage"));
const DownloadPage = lazy(() => import("../../features/marketing/DownloadPage"));

// Minimal, brand-coloured hold while a lazy page chunk loads. Intentionally
// quiet (no spinner) so it reads as an instant background, not a loading state.
function PageSuspenseFallback() {
  return <div style={{ position: "fixed", inset: 0, background: "#0c0c0c" }} aria-hidden="true" />;
}

function LegalPage({ title, docUrl }) {
  const [content, setContent] = useState("Loading...");

  useEffect(() => {
    fetch(docUrl)
      .then((res) => res.text())
      .then((text) => {
        const parsed = text
          .replace(/^# (.*$)/gim, "<h1>$1</h1>")
          .replace(/^## (.*$)/gim, "<h2>$1</h2>")
          .replace(/^### (.*$)/gim, "<h3>$1</h3>")
          .replace(/\*\*(.*)\*\*/gim, "<strong>$1</strong>")
          .replace(/^- (.*$)/gim, "<li>$1</li>")
          .replace(/^---$/gim, "<hr />");

        const lines = parsed.split("\n");
        let inList = false;
        const formatted = lines
          .map((line) => {
            if (line.startsWith("<li>")) {
              if (!inList) {
                inList = true;
                return "<ul>" + line;
              }
              return line;
            } else {
              let out = line;
              if (inList) {
                inList = false;
                out = "</ul>" + line;
              }
              if (!line.startsWith("<h") && !line.startsWith("<u") && !line.startsWith("<hr") && line.trim().length > 0) {
                return "<p>" + out + "</p>";
              }
              return out;
            }
          })
          .join("");

        setContent(formatted + (inList ? "</ul>" : ""));
      })
      .catch(() => setContent("<p>Failed to load document.</p>"));
  }, [docUrl]);

  return (
    <div className="app-shell" style={{ backgroundColor: "#FAF7F2", minHeight: "100vh" }}>
      <div style={{ padding: "24px", maxWidth: "600px", margin: "0 auto", position: "relative", zIndex: 10 }}>
        <a href={BASE_PATH || "/"} style={{ display: "inline-block", marginBottom: "24px", textDecoration: "underline", color: "var(--charcoal)", fontWeight: "bold" }}>
          ← Back
        </a>
        <div className="legal-content" style={{ lineHeight: "1.6", color: "var(--charcoal)", fontSize: "16px" }} dangerouslySetInnerHTML={{ __html: content }} />
      </div>
      <style dangerouslySetInnerHTML={{__html: "\n" +
        "  .legal-content h1 { font-size: 24px; font-weight: bold; margin-bottom: 16px; margin-top: 32px; }\n" +
        "  .legal-content h2 { font-size: 20px; font-weight: bold; margin-bottom: 12px; margin-top: 24px; }\n" +
        "  .legal-content h3 { font-size: 16px; font-weight: bold; margin-bottom: 12px; margin-top: 24px; }\n" +
        "  .legal-content p { margin-bottom: 16px; }\n" +
        "  .legal-content ul { margin-bottom: 16px; padding-left: 20px; list-style-type: disc; }\n" +
        "  .legal-content li { margin-bottom: 8px; }\n" +
        "  .legal-content hr { border: none; border-top: 1px solid rgba(0,0,0,0.1); margin: 32px 0; }\n"
      }} />
    </div>
  );
}

function RootRouter() {
  if (typeof window !== "undefined") {
    consumeSignupHandoffFromUrl();
    applyLocalNormalPreviewFlag();

    if (shouldStartDemoOnboarding()) {
      resetDemoOnboardingState();
      window.history.replaceState({}, "", `${BASE_PATH}/onboarding`);
    } else if (shouldStartDemoSignup()) {
      resetDemoSignupState();
      window.history.replaceState({}, "", `${BASE_PATH}/home?signup=1`);
    }

    const params = new URLSearchParams(window.location.search);
    const routeParam = params.get("route");
    const rawPath = routeParam || getPathRelativeToKnownBase(window.location.pathname);
    const normalizedPath = normalizeRoutePath(rawPath);
    const hasAppRouteParam = params.has("route");
    const isStandaloneMode = isStandaloneDisplayMode();

    if (normalizedPath === "/early-access") {
      return <Suspense fallback={<PageSuspenseFallback />}><EarlyAccessPage /></Suspense>;
    }

    if (normalizedPath === "/download" || normalizedPath === "/invite") {
      return <Suspense fallback={<PageSuspenseFallback />}><DownloadPage /></Suspense>;
    }

    if (normalizedPath === "/about") {
      return <Suspense fallback={<PageSuspenseFallback />}><AboutPage /></Suspense>;
    }

    if (normalizedPath === "/terms" || normalizedPath === "/privacy") {
      const isTerms = normalizedPath === "/terms";
      return (
        <LegalPage
          title={isTerms ? "Terms of Use" : "Privacy Policy"}
          docUrl={`${BASE_PATH}/${isTerms ? "terms-of-use.md" : "privacy-policy.md"}`}
        />
      );
    }

    if (!hasAppRouteParam && !isStandaloneMode && (normalizedPath === "/" || normalizedPath === "/index.html")) {
      return <Suspense fallback={<PageSuspenseFallback />}><EditableLandingPage /></Suspense>;
    }
  }

  return <App />;
}

export default RootRouter;
