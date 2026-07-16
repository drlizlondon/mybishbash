import { useState } from "react";
import { isStripeCheckoutConfigured, startStripeCheckout, openStripeCustomerPortal } from "../../lib/stripeCheckout";
import { getAccessPlanLabel } from "./getAccessPlanLabel";

export default function AccessPanel({ accessProfile, canUseMultipleApps, onManageApps, onEnterCode }) {
  const [checkoutStatus, setCheckoutStatus] = useState("");
  const planLabel = getAccessPlanLabel(accessProfile, canUseMultipleApps);
  const isFoundingAccess = canUseMultipleApps;
  const checkoutConfigured = isStripeCheckoutConfigured();
  const upgradePlans = [
    { id: "founder", label: "Founder" },
    { id: "annual", label: "Annual" },
    { id: "weekly", label: "Weekly" },
  ];

  async function handleCheckout(planId) {
    const result = await startStripeCheckout(planId);
    if (!result.ok && result.reason === "not_configured") {
      setCheckoutStatus("Upgrade checkout is not live yet.");
      return;
    }
    if (!result.ok) {
      setCheckoutStatus("Upgrade checkout is not available right now.");
    }
  }

  async function handleBilling() {
    const result = await openStripeCustomerPortal();
    if (!result.ok && result.reason === "not_configured") {
      setCheckoutStatus("Billing management is not live yet.");
      return;
    }
    if (!result.ok) {
      setCheckoutStatus("Billing management is not available right now.");
    }
  }

  return (
    <section className="panel-section access-panel-section" data-testid="access-page">
      <div className="section-heading solo">
        <div>
          <h2>Access / Plan</h2>
          <p>Current plan: {planLabel}</p>
        </div>
      </div>

      <div className="settings-card apps-manage-hero access-plan-card">
        <div className="settings-version-heading">
          <p>{isFoundingAccess ? "Founding Access" : "Free Core"}</p>
          {isFoundingAccess ? (
            <>
              <span>Your account includes all currently available app shortcuts.</span>
              <span>You can manage connected apps from Apps.</span>
            </>
          ) : (
            <>
              <span>Free Core includes myBishBash and one connected app shortcut.</span>
              <span>Upgrade to keep myBishBash connected to more apps.</span>
            </>
          )}
        </div>
        <div className="home-screen-version-actions apps-row-actions access-plan-actions">
          {isFoundingAccess ? (
            <>
              <button type="button" className="pack-button" onClick={onManageApps}>
                Manage apps
              </button>
              <button type="button" className="pack-button secondary" onClick={handleBilling}>
                Manage billing
              </button>
            </>
          ) : (
            <>
              <button type="button" className="pack-button" onClick={() => void handleCheckout("founder")}>
                Upgrade
              </button>
              <button type="button" className="pack-button secondary" onClick={onEnterCode}>
                Enter access code
              </button>
              <button type="button" className="text-button apps-code-link" onClick={onManageApps}>
                Manage apps
              </button>
            </>
          )}
        </div>
      </div>

      <div className="settings-card" data-testid="stripe-upgrade-section">
        <div className="settings-version-heading">
          <p>Upgrade options</p>
          <span>
            {checkoutConfigured
              ? "Choose the access option that fits how you want to use myBishBash."
              : "Upgrade checkout is not live yet."}
          </span>
        </div>
        <div className="home-screen-version-actions apps-row-actions access-plan-actions">
          {upgradePlans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              className="pack-button secondary"
              data-testid={`stripe-plan-${plan.id}`}
              onClick={() => void handleCheckout(plan.id)}
            >
              {plan.label}
            </button>
          ))}
        </div>
        {checkoutStatus ? <p className="tiny-note" role="status">{checkoutStatus}</p> : null}
      </div>
    </section>
  );
}

