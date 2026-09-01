import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { isKnownLauncher } from "../../lib/launcherRegistry";

export function getHomeSpotlightSteps(firstApp = null) {
  const firstAppId = firstApp?.id && isKnownLauncher(firstApp.id) ? firstApp.id : "";
  const firstAppName = firstApp?.realAppLabel ?? firstApp?.name ?? firstApp?.displayName ?? "your first app";
  return [
  {
    id: "home",
    path: "/home",
    selector: '[data-testid="home-panel"]',
    title: "Home",
    body: "Start here. Home shows what needs your attention today.",
    button: "Next",
  },
  {
    id: "explore",
    path: "/explore",
    selector: '[data-testid="bottom-nav-explore"]',
    title: "Explore",
    body: "Find extra support when you want it, including Packs for focus, confidence, sleep, punctuality or intentional phone use.",
    button: "Next",
  },
  {
    id: "apps",
    path: "/apps",
    selector: '[data-testid="bottom-nav-apps"]',
    title: "Apps",
    body: "Choose where myBishBash appears. Add it before the apps you already open.",
    button: "Next",
  },
  {
    id: "ready",
    path: "/apps",
    selector: firstAppId ? `[data-testid="apps-option-${firstAppId}"], [data-testid="protected-app-${firstAppId}"]` : '[data-testid="apps-panel"]',
    title: firstAppId ? `Set up ${firstAppName}` : "Set up your first app",
    body: firstAppId
      ? `You chose ${firstAppName} during onboarding. Set it up with myBishBash so it can appear before ${firstAppName}.`
      : "Set up your first app so myBishBash can appear before an app you already open.",
    button: firstAppId ? `Set up ${firstAppName}` : "Open Apps",
    action: firstAppId ? "openLauncherSetup" : "openApps",
    launcherId: firstAppId,
  },
  ];
}

export default function HomeSpotlightTour({ actionSignal, firstApp = null, locationKey = "", onComplete, onNavigate, onOpenLauncherSetup }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const visibleSteps = useMemo(() => getHomeSpotlightSteps(firstApp), [firstApp]);
  const step = visibleSteps[Math.min(stepIndex, visibleSteps.length - 1)] ?? visibleSteps[0];
  const isFinalStep = stepIndex >= visibleSteps.length - 1;

  useLayoutEffect(() => {
    if (!step) return undefined;
    if (!step.selector) {
      setTargetRect(null);
      return undefined;
    }
    setTargetRect(null);
    const targets = Array.from(document.querySelectorAll(step.selector)).filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const target = targets[0];
    if (!target) return undefined;

    const updateRect = () => {
      const rect = target.getBoundingClientRect();
      setTargetRect({
        top: Math.max(8, rect.top - 8),
        left: Math.max(8, rect.left - 8),
        width: Math.min(window.innerWidth - 16, rect.width + 16),
        height: Math.min(window.innerHeight - 16, rect.height + 16),
      });
    };

    targets.forEach((item) => item.classList.add("home-spotlight-target-active"));
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      targets.forEach((item) => {
        item.classList.remove("home-spotlight-target-active");
      });
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [step, visibleSteps.length, locationKey]);

  useEffect(() => {
    if (!actionSignal || !step?.advanceOnTargetClick || actionSignal.id !== step.id) return;
    setStepIndex((current) => Math.min(current + 1, visibleSteps.length - 1));
  }, [actionSignal, step, visibleSteps.length]);

  if (!step) return null;

  function finish() {
    onComplete?.();
    if (step?.action === "openLauncherSetup" && step.launcherId) {
      onOpenLauncherSetup?.(step.launcherId);
      return;
    }
    if (step?.action === "openApps") {
      onNavigate?.("/apps");
      return;
    }
    onNavigate?.("/home");
  }

  function next() {
    if (isFinalStep) {
      finish();
      return;
    }
    setStepIndex((current) => {
      const nextIndex = current + 1;
      const nextStep = visibleSteps[nextIndex];
      if (nextStep?.path) onNavigate?.(nextStep.path);
      return nextIndex;
    });
  }

  function previous() {
    setStepIndex((current) => {
      const nextIndex = Math.max(0, current - 1);
      const nextStep = visibleSteps[nextIndex];
      if (nextStep?.path) onNavigate?.(nextStep.path);
      return nextIndex;
    });
  }

  const cardPlacement = targetRect && targetRect.top > 140 && targetRect.top < window.innerHeight / 2 ? "below" : "above";

  return (
    <div className="home-spotlight-tour" data-testid="home-spotlight-tour" role="dialog" aria-modal="true" aria-labelledby="home-spotlight-title">
      <div className="home-spotlight-dim" />
      {targetRect ? (
        <div
          className="home-spotlight-ring"
          style={{
            top: `${targetRect.top}px`,
            left: `${targetRect.left}px`,
            width: `${targetRect.width}px`,
            height: `${targetRect.height}px`,
          }}
          aria-hidden="true"
        />
      ) : null}
      <article className={`home-spotlight-card ${cardPlacement}`}>
        <div className="home-spotlight-dots" aria-label={`Step ${stepIndex + 1} of ${visibleSteps.length}`}>
          {visibleSteps.map((item, index) => (
            <span key={item.id} className={index === stepIndex ? "active" : ""} />
          ))}
        </div>
        <h2 id="home-spotlight-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="home-spotlight-actions">
          <button
            type="button"
            className="home-spotlight-back"
            onClick={previous}
            disabled={stepIndex === 0}
            aria-label="Previous spotlight step"
          >
            ←
          </button>
          <button type="button" className="home-spotlight-next" onClick={next}>
            {step.button}
          </button>
        </div>
        {!isFinalStep ? (
          <a
            className="home-spotlight-skip-link"
            href="#"
            onClick={(event) => {
              event.preventDefault();
              finish();
            }}
          >
            Skip
          </a>
        ) : null}
      </article>
    </div>
  );
}

